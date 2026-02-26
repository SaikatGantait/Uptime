import dotenv from 'dotenv';

// Load .env from monorepo root (two levels up from apps/hub)
dotenv.config({ path: '../../.env' });

import { randomUUIDv7, type ServerWebSocket } from "bun";
import type { IncomingMessage, SignupIncomingMessage } from "common/types";
import { prismaClient } from "db/client";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";

const availableValidators: { validatorId: string, socket: ServerWebSocket<unknown>, publicKey: string }[] = [];

const CALLBACKS : { [callbackId: string]: (data: IncomingMessage) => void } = {}
const COST_PER_VALIDATION = 100; // in lamports
const MONITOR_INTERVAL_MS = 60 * 1000;
const VALIDATION_TIMEOUT_MS = 20 * 1000;

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
            
            if (data.type === 'signup') {

                const verified = await verifyMessage(
                    `Signed message for ${data.data.callbackId}, ${data.data.publicKey}`,
                    data.data.publicKey,
                    data.data.signedMessage
                );
                if (verified) {
                    await signupHandler(ws, data.data);
                }
            } else if (data.type === 'validate') {
                const callback = CALLBACKS[data.data.callbackId];
                if (callback) {
                    callback(data);
                    delete CALLBACKS[data.data.callbackId];
                }
            }
        },
        async close(ws: ServerWebSocket<unknown>) {
            availableValidators.splice(availableValidators.findIndex(v => v.socket === ws), 1);
        }
    },
});

async function signupHandler(ws: ServerWebSocket<unknown>, { ip, publicKey, signedMessage, callbackId }: SignupIncomingMessage) {
    const validatorDb = await prismaClient.validator.findFirst({
        where: {
            publicKey,
        },
    });

    if (validatorDb) {
        ws.send(JSON.stringify({
            type: 'signup',
            data: {
                validatorId: validatorDb.id,
                callbackId,
            },
        }));

        availableValidators.push({
            validatorId: validatorDb.id,
            socket: ws,
            publicKey: validatorDb.publicKey,
        });
        return;
    }
    
    //TODO: Given the ip, return the location
    const validator = await prismaClient.validator.create({
        data: {
            ip,
            publicKey,
            location: 'unknown',
        },
    });

    ws.send(JSON.stringify({
        type: 'signup',
        data: {
            validatorId: validator.id,
            callbackId,
        },
    }));

    availableValidators.push({
        validatorId: validator.id,
        socket: ws,
        publicKey: validator.publicKey,
    });
}

async function verifyMessage(message: string, publicKey: string, signature: string) {
    const messageBytes = nacl_util.decodeUTF8(message);
    const result = nacl.sign.detached.verify(
        messageBytes,
        new Uint8Array(JSON.parse(signature)),
        new PublicKey(publicKey).toBytes(),
    );

    return result;
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

    for (const website of websitesToMonitor) {
        const validatorsPerRound = Math.max(1, Math.min(website.validatorsPerRound, availableValidators.length));
        const validatorsForWebsite = [...availableValidators]
            .sort(() => Math.random() - 0.5)
            .slice(0, validatorsPerRound);

        const responses = await Promise.all(
            validatorsForWebsite.map((validator) => requestValidation(validator, {
                websiteId: website.id,
                url: website.url,
                retries: website.retries,
                checkType: website.checkType,
                expectedKeyword: website.expectedKeyword,
                dnsRecordType: website.dnsRecordType,
                dnsExpectedValue: website.dnsExpectedValue,
                tlsWarningDaysCsv: website.tlsWarningDaysCsv,
                multiStepConfig: website.multiStepConfig,
            }))
        );
        const validResponses = responses.filter((response): response is NonNullable<typeof response> => !!response);

        if (validResponses.length === 0) {
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

        const badCount = validResponses.filter((response) => response.status === "Bad").length;
        const goodCount = validResponses.length - badCount;
        const quorum = Math.max(1, Math.min(website.quorum, validResponses.length));
        const isDown = badCount >= quorum;
        const highestSeverity = validResponses.reduce<'P1' | 'P2' | 'P3'>((current, response) => {
            if (severityRank(response.severity) > severityRank(current)) {
                return response.severity;
            }
            return current;
        }, 'P3');

        await upsertIncidentState({
            websiteId: website.id,
            websiteUrl: website.url,
            isDown,
            badCount,
            goodCount,
            sampleCount: validResponses.length,
            quorum,
            cooldownMinutes: website.cooldownMinutes,
            severity: highestSeverity,
        });
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
    console.log(`Sending validate to ${validator.validatorId} ${payload.url}`);

    validator.socket.send(JSON.stringify({
        type: "validate",
        data: {
            ...payload,
            callbackId,
        },
    }));

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
    goodCount: number;
    sampleCount: number;
    quorum: number;
    cooldownMinutes: number;
    severity: "P1" | "P2" | "P3";
}) {
    const now = new Date();
    const openIncident = await prismaClient.incident.findFirst({
        where: {
            websiteId: args.websiteId,
            status: "OPEN",
        },
    });

    if (args.isDown) {
        const incident = openIncident ?? await prismaClient.incident.create({
            data: {
                websiteId: args.websiteId,
                status: "OPEN",
                summary: `${args.websiteUrl} appears down`,
                severity: args.severity,
            },
        });

        if (openIncident && severityRank(args.severity) > severityRank(openIncident.severity)) {
            await prismaClient.incident.update({
                where: { id: openIncident.id },
                data: { severity: args.severity },
            });
        }

        if (!openIncident) {
            await prismaClient.incidentEvent.create({
                data: {
                    incidentId: incident.id,
                    type: "DETECTED",
                    message: `Detected outage for ${args.websiteUrl}`,
                },
            });
        }

        await prismaClient.incidentEvent.create({
            data: {
                incidentId: incident.id,
                type: "QUORUM_DECISION",
                message: `Quorum evaluated: bad=${args.badCount}, good=${args.goodCount}, sample=${args.sampleCount}, required=${args.quorum}.`,
            },
        });

        const website = await prismaClient.website.findUnique({ where: { id: args.websiteId } });
        const cooldownMs = args.cooldownMinutes * 60 * 1000;
        const canNotify = !website?.lastAlertSentAt || (now.getTime() - website.lastAlertSentAt.getTime()) >= cooldownMs;

        if (canNotify) {
            await prismaClient.website.update({
                where: { id: args.websiteId },
                data: { lastAlertSentAt: now },
            });

            await prismaClient.incidentEvent.create({
                data: {
                    incidentId: incident.id,
                    type: "ALERT_SENT",
                    message: `Alert sent [${args.severity}] (quorum ${args.badCount}/${args.sampleCount}, required ${args.quorum}).`,
                },
            });

            await dispatchAlertDeliveries(incident.id, args.websiteId, args.severity);
        } else {
            await prismaClient.incidentEvent.create({
                data: {
                    incidentId: incident.id,
                    type: "ALERT_SUPPRESSED",
                    message: `Alert suppressed due to cooldown window (${args.cooldownMinutes} min).`,
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
        "Primary and contributing causes.",
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
        const escalationMs = incident.website.escalationMinutes * 60 * 1000;
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
    }
}

function severityRank(severity: "P1" | "P2" | "P3") {
    if (severity === "P1") return 3;
    if (severity === "P2") return 2;
    return 1;
}

async function dispatchAlertDeliveries(incidentId: string, websiteId: string, severity: "P1" | "P2" | "P3") {
    const [routes, integrations, schedules] = await Promise.all([
        prismaClient.alertRoute.findMany({ where: { websiteId } }),
        prismaClient.integrationChannel.findMany({ where: { websiteId, enabled: true } }),
        prismaClient.onCallSchedule.findMany({ where: { websiteId } }),
    ]);

    const nowUtcHour = new Date().getUTCHours();
    const inQuietHours = schedules.some((schedule) => {
        if (schedule.quietHoursStart === null || schedule.quietHoursEnd === null) {
            return false;
        }

        if (schedule.quietHoursStart <= schedule.quietHoursEnd) {
            return nowUtcHour >= schedule.quietHoursStart && nowUtcHour < schedule.quietHoursEnd;
        }
        return nowUtcHour >= schedule.quietHoursStart || nowUtcHour < schedule.quietHoursEnd;
    });

    const destinations = routes
        .filter((route) => severityRank(severity) >= severityRank(route.minSeverity as "P1" | "P2" | "P3"))
        .flatMap((route) => integrations.filter((integration) => integration.type === route.channel));

    for (const destination of destinations) {
        await prismaClient.alertDelivery.create({
            data: {
                incidentId,
                channelType: destination.type,
                destination: destination.endpoint,
                status: inQuietHours ? "queued_quiet_hours" : "queued",
            },
        });
    }
}

setInterval(async () => {
    await runMonitoringRound();
    await runEscalationSweep();
}, MONITOR_INTERVAL_MS);