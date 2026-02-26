import dotenv from "dotenv";

// Load .env from monorepo root (two levels up from apps/hub)
dotenv.config({ path: "../../.env" });

import { randomUUIDv7, type ServerWebSocket } from "bun";
import type { IncomingMessage, SignupIncomingMessage } from "common/types";
import { prismaClient } from "db/client";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const availableValidators: { validatorId: string; socket: ServerWebSocket<unknown>; publicKey: string }[] = [];
const CALLBACKS: { [callbackId: string]: (data: IncomingMessage) => void } = {};

const COST_PER_VALIDATION = 100;
const MONITOR_TICK_MS = Number(process.env.MONITOR_TICK_MS ?? 15_000);
const VALIDATION_TIMEOUT_MS = Number(process.env.VALIDATION_TIMEOUT_MS ?? 20_000);
const ALERT_RETRY_MAX_ATTEMPTS = Number(process.env.ALERT_RETRY_MAX_ATTEMPTS ?? 5);
const ALERT_RETRY_BASE_DELAY_SEC = Number(process.env.ALERT_RETRY_BASE_DELAY_SEC ?? 30);
const ALERT_REMINDER_MINUTES = Number(process.env.ALERT_REMINDER_MINUTES ?? 10);
const FAST_RECHECK_SECONDS = Number(process.env.FAST_RECHECK_SECONDS ?? 30);
const NORMAL_RECHECK_SECONDS = Number(process.env.NORMAL_RECHECK_SECONDS ?? 60);
const STABLE_RECHECK_SECONDS = Number(process.env.STABLE_RECHECK_SECONDS ?? 180);

const websiteNextRun = new Map<string, number>();

type NotificationKind = "FIRE" | "STILL_DOWN" | "RESOLVED" | "ESCALATION";

Bun.serve({
  fetch(req, server) {
    if (server.upgrade(req)) {
      return;
    }
    return new Response("Upgrade failed", { status: 500 });
  },
  port: 8081,
  websocket: {
    async message(ws: ServerWebSocket<unknown>, message: string) {
      const data: IncomingMessage = JSON.parse(message);

      if (data.type === "signup") {
        const verified = await verifyMessage(
          `Signed message for ${data.data.callbackId}, ${data.data.publicKey}`,
          data.data.publicKey,
          data.data.signedMessage,
        );
        if (verified) {
          await signupHandler(ws, data.data);
        }
      } else if (data.type === "validate") {
        const callback = CALLBACKS[data.data.callbackId];
        if (callback) {
          callback(data);
          delete CALLBACKS[data.data.callbackId];
        }
      }
    },
    async close(ws: ServerWebSocket<unknown>) {
      availableValidators.splice(
        availableValidators.findIndex((validator) => validator.socket === ws),
        1,
      );
    },
  },
});

async function signupHandler(ws: ServerWebSocket<unknown>, { ip, publicKey, callbackId }: SignupIncomingMessage) {
  const validatorDb = await prismaClient.validator.findFirst({ where: { publicKey } });

  if (validatorDb) {
    ws.send(
      JSON.stringify({
        type: "signup",
        data: {
          validatorId: validatorDb.id,
          callbackId,
        },
      }),
    );

    availableValidators.push({
      validatorId: validatorDb.id,
      socket: ws,
      publicKey: validatorDb.publicKey,
    });
    return;
  }

  const validator = await prismaClient.validator.create({
    data: {
      ip,
      publicKey,
      location: "unknown",
    },
  });

  ws.send(
    JSON.stringify({
      type: "signup",
      data: {
        validatorId: validator.id,
        callbackId,
      },
    }),
  );

  availableValidators.push({
    validatorId: validator.id,
    socket: ws,
    publicKey: validator.publicKey,
  });
}

async function verifyMessage(message: string, publicKey: string, signature: string) {
  const messageBytes = naclUtil.decodeUTF8(message);
  return nacl.sign.detached.verify(messageBytes, new Uint8Array(JSON.parse(signature)), new PublicKey(publicKey).toBytes());
}

function isInQuietHours(schedule: { quietHoursStart: number | null; quietHoursEnd: number | null }) {
  if (schedule.quietHoursStart === null || schedule.quietHoursEnd === null) return false;
  const nowUtcHour = new Date().getUTCHours();
  if (schedule.quietHoursStart <= schedule.quietHoursEnd) {
    return nowUtcHour >= schedule.quietHoursStart && nowUtcHour < schedule.quietHoursEnd;
  }
  return nowUtcHour >= schedule.quietHoursStart || nowUtcHour < schedule.quietHoursEnd;
}

function isWebsiteMuted(website: { snoozeUntil: Date | null; maintenanceStartAt: Date | null; maintenanceEndAt: Date | null }) {
  const now = Date.now();
  if (website.snoozeUntil && website.snoozeUntil.getTime() > now) return true;
  if (website.maintenanceStartAt && website.maintenanceEndAt) {
    const start = website.maintenanceStartAt.getTime();
    const end = website.maintenanceEndAt.getTime();
    if (now >= start && now <= end) return true;
  }
  return false;
}

function classifyRootCause(detail?: string | null) {
  const text = (detail ?? "").toLowerCase();
  if (!text) return "unknown";
  if (text.includes("dns")) return "dns";
  if (text.includes("tls") || text.includes("certificate")) return "tls";
  if (text.includes("timeout")) return "timeout";
  if (text.includes("keyword")) return "keyword";
  if (text.includes("http 5")) return "http_5xx";
  if (text.includes("http 4")) return "http_4xx";
  return "network";
}

function severityRank(severity: "P1" | "P2" | "P3") {
  if (severity === "P1") return 3;
  if (severity === "P2") return 2;
  return 1;
}

function retryDelayMs(attempts: number) {
  const base = ALERT_RETRY_BASE_DELAY_SEC * 1000;
  return Math.min(base * Math.pow(2, Math.max(0, attempts - 1)), 30 * 60 * 1000);
}

function resolveComponentUrl(baseUrl: string, component: { targetUrl: string | null; path: string | null }) {
  if (component.targetUrl && component.targetUrl.trim()) {
    return new URL(component.targetUrl.trim()).toString();
  }

  const path = component.path && component.path.trim() ? component.path.trim() : "/";
  return new URL(path, baseUrl).toString();
}

function buildPayload(args: {
  kind: NotificationKind;
  websiteUrl: string;
  severity: "P1" | "P2" | "P3";
  incidentId: string;
  rootCauseHint?: string;
}) {
  const titleMap: Record<NotificationKind, string> = {
    FIRE: "🚨 Incident fired",
    STILL_DOWN: "⏱️ Still down reminder",
    RESOLVED: "✅ Incident resolved",
    ESCALATION: "📣 Escalation triggered",
  };

  const title = `${titleMap[args.kind]} • ${args.websiteUrl}`;
  const summary = `${title}\nSeverity: ${args.severity}\nIncident: ${args.incidentId}\nRoot cause hint: ${args.rootCauseHint ?? "unknown"}`;
  return { title, summary };
}

async function sendEmail(destination: string, payload: { title: string; summary: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Missing RESEND_API_KEY or ALERT_EMAIL_FROM");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [destination],
      subject: payload.title,
      text: payload.summary,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status} ${text}`);
  }

  try {
    const parsed = JSON.parse(text) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

async function sendSms(destination: string, payload: { title: string; summary: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    throw new Error("Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER");
  }

  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({
    To: destination,
    From: from,
    Body: `${payload.title}\n${payload.summary}`.slice(0, 1500),
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Twilio failed: ${response.status} ${text}`);
  }

  try {
    const parsed = JSON.parse(text) as { sid?: string };
    return parsed.sid ?? null;
  } catch {
    return null;
  }
}

async function sendWebhook(destination: string, payload: { title: string; summary: string }) {
  const response = await fetch(destination, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: payload.summary,
      title: payload.title,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status}`);
  }

  return null;
}

async function deliverAlert(delivery: {
  channelType: string;
  destination: string;
  payload: string | null;
}) {
  const payload = delivery.payload ? (JSON.parse(delivery.payload) as { title: string; summary: string }) : { title: "Uptime Alert", summary: "No payload" };

  switch (delivery.channelType) {
    case "EMAIL":
      return sendEmail(delivery.destination, payload);
    case "SMS":
      return sendSms(delivery.destination, payload);
    default:
      return sendWebhook(delivery.destination, payload);
  }
}

async function dispatchAlertDeliveries(
  incidentId: string,
  websiteId: string,
  severity: "P1" | "P2" | "P3",
  notificationKind: NotificationKind,
  options?: { forceAllRoutes?: boolean; rootCauseHint?: string },
) {
  const [incident, website, routes, integrations, schedules] = await Promise.all([
    prismaClient.incident.findUnique({ where: { id: incidentId } }),
    prismaClient.website.findUnique({ where: { id: websiteId } }),
    prismaClient.alertRoute.findMany({ where: { websiteId } }),
    prismaClient.integrationChannel.findMany({ where: { websiteId, enabled: true } }),
    prismaClient.onCallSchedule.findMany({ where: { websiteId } }),
  ]);

  if (!incident || !website) return;

  const inQuietHours = schedules.some(isInQuietHours);
  const payload = buildPayload({
    kind: notificationKind,
    websiteUrl: website.url,
    severity,
    incidentId,
    rootCauseHint: options?.rootCauseHint,
  });

  const destinations = options?.forceAllRoutes
    ? integrations
    : routes
        .filter((route) => severityRank(severity) >= severityRank(route.minSeverity as "P1" | "P2" | "P3"))
        .flatMap((route) => integrations.filter((integration) => integration.type === route.channel));

  if (destinations.length === 0) {
    await prismaClient.incidentEvent.create({
      data: {
        incidentId,
        type: "NOTE",
        message: `No destinations matched for ${notificationKind} alert.`,
      },
    });
    return;
  }

  for (const destination of destinations) {
    await prismaClient.alertDelivery.create({
      data: {
        incidentId,
        channelType: destination.type,
        destination: destination.endpoint,
        status: inQuietHours ? "queued_quiet_hours" : "queued",
        notificationKind,
        attempts: 0,
        maxAttempts: ALERT_RETRY_MAX_ATTEMPTS,
        nextRetryAt: new Date(),
        payload: JSON.stringify(payload),
      },
    });
  }
}

async function runAlertDeliverySweep() {
  const now = new Date();
  const deliveries = await prismaClient.alertDelivery.findMany({
    where: {
      status: { in: ["queued", "queued_quiet_hours", "retry"] },
      nextRetryAt: { lte: now },
    },
    include: {
      incident: {
        include: {
          website: {
            include: {
              onCallSchedules: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  for (const delivery of deliveries) {
    if (delivery.status === "queued_quiet_hours") {
      const stillQuiet = delivery.incident.website.onCallSchedules.some(isInQuietHours);
      if (stillQuiet) {
        await prismaClient.alertDelivery.update({
          where: { id: delivery.id },
          data: { nextRetryAt: new Date(Date.now() + 5 * 60 * 1000) },
        });
        continue;
      }
    }

    try {
      const externalId = await deliverAlert(delivery);

      await prismaClient.alertDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          attempts: delivery.attempts + 1,
          externalId,
          lastError: null,
        },
      });

      await prismaClient.incidentEvent.create({
        data: {
          incidentId: delivery.incidentId,
          type: "ALERT_SENT",
          message: `${delivery.notificationKind} alert delivered via ${delivery.channelType} to ${delivery.destination}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown delivery error";
      const attempts = delivery.attempts + 1;
      const exhausted = attempts >= delivery.maxAttempts;

      await prismaClient.alertDelivery.update({
        where: { id: delivery.id },
        data: {
          status: exhausted ? "failed" : "retry",
          attempts,
          lastError: message,
          nextRetryAt: exhausted ? delivery.nextRetryAt : new Date(Date.now() + retryDelayMs(attempts)),
        },
      });

      await prismaClient.incidentEvent.create({
        data: {
          incidentId: delivery.incidentId,
          type: "NOTE",
          message: exhausted
            ? `Alert delivery failed permanently after ${attempts} attempts (${delivery.channelType} ${delivery.destination}): ${message}`
            : `Alert delivery retry scheduled (${attempts}/${delivery.maxAttempts}) for ${delivery.channelType} ${delivery.destination}: ${message}`,
        },
      });
    }
  }
}

async function requestValidation(
  validator: { validatorId: string; socket: ServerWebSocket<unknown>; publicKey: string },
  payload: {
    websiteId: string;
    url: string;
    retries: number;
    checkType: "HTTP" | "MULTI_STEP" | "KEYWORD" | "DNS" | "TLS";
    expectedKeyword?: string | null;
    dnsRecordType?: string | null;
    dnsExpectedValue?: string | null;
    tlsWarningDaysCsv?: string | null;
    multiStepConfig?: string | null;
  },
) {
  const callbackId = randomUUIDv7();

  validator.socket.send(
    JSON.stringify({
      type: "validate",
      data: {
        ...payload,
        callbackId,
      },
    }),
  );

  return new Promise<null | { validatorId: string; status: "Good" | "Bad"; latency: number; severity: "P1" | "P2" | "P3"; details?: string }>((resolve) => {
    const timeout = setTimeout(() => {
      delete CALLBACKS[callbackId];
      resolve(null);
    }, VALIDATION_TIMEOUT_MS);

    CALLBACKS[callbackId] = async (data: IncomingMessage) => {
      if (data.type !== "validate") {
        clearTimeout(timeout);
        resolve(null);
        return;
      }

      const { validatorId, status, latency, signedMessage } = data.data;
      const verified = await verifyMessage(`Replying to ${callbackId}`, validator.publicKey, signedMessage);
      clearTimeout(timeout);

      if (!verified) {
        resolve(null);
        return;
      }

      resolve({ validatorId, status, latency, severity: data.data.severity, details: data.data.details });
    };
  });
}

async function upsertIncidentState(args: {
  websiteId: string;
  websiteUrl: string;
  isDown: boolean;
  badCount: number;
  badRegionCount: number;
  goodCount: number;
  sampleCount: number;
  quorum: number;
  cooldownMinutes: number;
  severity: "P1" | "P2" | "P3";
  rootCauseHint: string;
}) {
  const now = new Date();
  const openIncident = await prismaClient.incident.findFirst({
    where: {
      websiteId: args.websiteId,
      status: "OPEN",
    },
  });

  if (args.isDown) {
    const incident =
      openIncident ??
      (await prismaClient.incident.create({
        data: {
          websiteId: args.websiteId,
          status: "OPEN",
          summary: `${args.websiteUrl} appears down (${args.rootCauseHint})`,
          severity: args.severity,
        },
      }));

    if (openIncident && severityRank(args.severity) > severityRank(openIncident.severity)) {
      await prismaClient.incident.update({ where: { id: openIncident.id }, data: { severity: args.severity } });
    }

    if (!openIncident) {
      await prismaClient.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: "DETECTED",
          message: `Detected outage for ${args.websiteUrl}. Root cause hint: ${args.rootCauseHint}.`,
        },
      });
    }

    await prismaClient.incidentEvent.create({
      data: {
        incidentId: incident.id,
        type: "QUORUM_DECISION",
        message: `Quorum: bad=${args.badCount}, badRegions=${args.badRegionCount}, good=${args.goodCount}, sample=${args.sampleCount}, required=${args.quorum}.`,
      },
    });

    const website = await prismaClient.website.findUnique({ where: { id: args.websiteId } });
    const reminderMs = Math.max(args.cooldownMinutes, ALERT_REMINDER_MINUTES) * 60 * 1000;
    const canNotify = !website?.lastAlertSentAt || now.getTime() - website.lastAlertSentAt.getTime() >= reminderMs;

    if (canNotify) {
      await prismaClient.website.update({ where: { id: args.websiteId }, data: { lastAlertSentAt: now } });

      const kind: NotificationKind = openIncident ? "STILL_DOWN" : "FIRE";
      await prismaClient.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: "ALERT_SENT",
          message: `${kind} alert queued [${args.severity}] (quorum ${args.badCount}/${args.sampleCount}, regions ${args.badRegionCount}).`,
        },
      });

      await dispatchAlertDeliveries(incident.id, args.websiteId, args.severity, kind, { rootCauseHint: args.rootCauseHint });
    } else {
      await prismaClient.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: "ALERT_SUPPRESSED",
          message: `Alert suppressed due to dedup/reminder window (${Math.round(reminderMs / 60000)} min).`,
        },
      });
    }

    return;
  }

  if (!openIncident) {
    return;
  }

  const postmortemTemplate = [
    `# Postmortem template: ${args.websiteUrl}`,
    "",
    "## Summary",
    "Describe what happened in 2-3 sentences.",
    "",
    "## Impact",
    "- Who/what was affected?",
    "- Duration and severity",
    "",
    "## Timeline",
    "- Detection time",
    "- Mitigation steps",
    "- Recovery confirmation",
    "",
    "## Root cause",
    args.rootCauseHint,
    "",
    "## Action items",
    "- [ ] Preventive fix",
    "- [ ] Monitoring/alert tuning",
  ].join("\n");

  await prismaClient.incident.update({
    where: { id: openIncident.id },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
      postmortemTemplate,
    },
  });

  await prismaClient.incidentEvent.create({
    data: {
      incidentId: openIncident.id,
      type: "RECOVERY",
      message: `Service recovered (good=${args.goodCount}, bad=${args.badCount}, sample=${args.sampleCount}).`,
    },
  });

  await dispatchAlertDeliveries(openIncident.id, args.websiteId, args.severity, "RESOLVED", { rootCauseHint: args.rootCauseHint });
}

async function runEscalationSweep() {
  const openIncidents = await prismaClient.incident.findMany({
    where: {
      status: "OPEN",
      acknowledgedAt: null,
      escalatedAt: null,
    },
    include: {
      website: true,
    },
  });

  const now = new Date();
  for (const incident of openIncidents) {
    const escalationMs = Math.max(incident.website.escalationMinutes, 1) * 60 * 1000;
    if (now.getTime() - incident.startedAt.getTime() < escalationMs) {
      continue;
    }

    await prismaClient.incident.update({
      where: { id: incident.id },
      data: { escalatedAt: now },
    });

    await prismaClient.incidentEvent.create({
      data: {
        incidentId: incident.id,
        type: "ESCALATED",
        message: `Escalated incident after ${incident.website.escalationMinutes} minutes without acknowledgement.`,
      },
    });

    await dispatchAlertDeliveries(incident.id, incident.websiteId, incident.severity as "P1" | "P2" | "P3", "ESCALATION", {
      forceAllRoutes: true,
      rootCauseHint: "escalation",
    });
  }
}

async function runMonitoringRound() {
  const websitesToMonitor = await prismaClient.website.findMany({
    where: {
      disabled: false,
    },
  });

  if (availableValidators.length === 0) {
    return;
  }

  const nowMs = Date.now();

  for (const website of websitesToMonitor) {
    if (isWebsiteMuted(website)) {
      continue;
    }

    const nextAt = websiteNextRun.get(website.id) ?? 0;
    if (nextAt > nowMs) {
      continue;
    }

    const validatorsPerRound = Math.max(1, Math.min(website.validatorsPerRound, availableValidators.length));
    const validatorsForWebsite = [...availableValidators]
      .sort(() => Math.random() - 0.5)
      .slice(0, validatorsPerRound);

    const components = await prismaClient.websiteComponent.findMany({
      where: {
        websiteId: website.id,
        enabled: true,
      },
    });

    const responses = await Promise.all(
      validatorsForWebsite.map((validator) =>
        requestValidation(validator, {
          websiteId: website.id,
          url: website.url,
          retries: website.retries,
          checkType: website.checkType,
          expectedKeyword: website.expectedKeyword,
          dnsRecordType: website.dnsRecordType,
          dnsExpectedValue: website.dnsExpectedValue,
          tlsWarningDaysCsv: website.tlsWarningDaysCsv,
          multiStepConfig: website.multiStepConfig,
        }),
      ),
    );

    const validResponses = responses.filter((response): response is NonNullable<typeof response> => !!response);
    if (validResponses.length === 0) {
      websiteNextRun.set(website.id, Date.now() + FAST_RECHECK_SECONDS * 1000);
      continue;
    }

    await prismaClient.$transaction(async (tx) => {
      for (const response of validResponses) {
        await tx.websiteTick.create({
          data: {
            websiteId: website.id,
            validatorId: response.validatorId,
            status: response.status,
            latency: response.latency,
            severity: response.severity,
            details: response.details,
            createdAt: new Date(),
          },
        });

        await tx.validator.update({
          where: { id: response.validatorId },
          data: {
            pendingPayouts: { increment: COST_PER_VALIDATION },
          },
        });
      }
    });

    const validatorRegions = await prismaClient.validator.findMany({
      where: { id: { in: validResponses.map((response) => response.validatorId) } },
      select: { id: true, location: true },
    });
    const regionMap = new Map(validatorRegions.map((validator) => [validator.id, validator.location || "unknown"]));

    const badResponses = validResponses.filter((response) => response.status === "Bad");
    const badRegions = new Set(
      badResponses
        .map((response) => regionMap.get(response.validatorId) ?? "unknown")
        .filter((region) => !!region),
    );

    const badCount = badResponses.length;
    const goodCount = validResponses.length - badCount;
    const quorum = Math.max(1, Math.min(website.quorum, validResponses.length));
    const regionQuorumDown = badRegions.size >= quorum;
    const fallbackQuorumDown = badCount >= quorum;
    const isDown = regionQuorumDown || fallbackQuorumDown;

    const highestSeverity = validResponses.reduce<"P1" | "P2" | "P3">((current, response) => {
      if (severityRank(response.severity) > severityRank(current)) {
        return response.severity;
      }
      return current;
    }, "P3");

    const rootCauseCounts = new Map<string, number>();
    for (const response of badResponses) {
      const key = classifyRootCause(response.details);
      rootCauseCounts.set(key, (rootCauseCounts.get(key) ?? 0) + 1);
    }
    const rootCauseHint = [...rootCauseCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    await upsertIncidentState({
      websiteId: website.id,
      websiteUrl: website.url,
      isDown,
      badCount,
      badRegionCount: badRegions.size,
      goodCount,
      sampleCount: validResponses.length,
      quorum,
      cooldownMinutes: website.cooldownMinutes,
      severity: highestSeverity,
      rootCauseHint,
    });

    const nextDelaySeconds = isDown
      ? FAST_RECHECK_SECONDS
      : badCount > 0
        ? NORMAL_RECHECK_SECONDS
        : STABLE_RECHECK_SECONDS;
    websiteNextRun.set(website.id, Date.now() + nextDelaySeconds * 1000);

    for (const component of components) {
      let componentUrl: string;
      try {
        componentUrl = resolveComponentUrl(website.url, component);
      } catch {
        continue;
      }

      const componentResponses = await Promise.all(
        validatorsForWebsite.map((validator) =>
          requestValidation(validator, {
            websiteId: website.id,
            url: componentUrl,
            retries: website.retries,
            checkType: component.checkType,
            expectedKeyword: component.expectedKeyword,
            dnsRecordType: component.dnsRecordType,
            dnsExpectedValue: component.dnsExpectedValue,
            tlsWarningDaysCsv: component.tlsWarningDaysCsv,
            multiStepConfig: component.multiStepConfig,
          }),
        ),
      );

      const validComponentResponses = componentResponses.filter(
        (response): response is NonNullable<typeof response> => !!response,
      );

      if (validComponentResponses.length === 0) {
        continue;
      }

      await prismaClient.$transaction(async (tx) => {
        for (const response of validComponentResponses) {
          await tx.componentTick.create({
            data: {
              websiteId: website.id,
              componentId: component.id,
              validatorId: response.validatorId,
              status: response.status,
              latency: response.latency,
              severity: response.severity,
              details: response.details,
              createdAt: new Date(),
            },
          });

          await tx.validator.update({
            where: { id: response.validatorId },
            data: {
              pendingPayouts: { increment: COST_PER_VALIDATION },
            },
          });
        }
      });
    }
  }
}

setInterval(async () => {
  try {
    await runMonitoringRound();
    await runEscalationSweep();
    await runAlertDeliverySweep();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown hub loop error";
    console.error(`[hub-loop] ${message}`);
  }
}, MONITOR_TICK_MS);
