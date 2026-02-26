import dotenv from 'dotenv';

// Load .env from monorepo root (two levels up from apps/api)
dotenv.config({ path: '../../.env' });

import express from "express"
import { authMiddleware } from "./middleware";
import { prismaClient } from "db/client";
import cors from "cors";
import { Transaction, SystemProgram, Connection, Keypair, PublicKey } from "@solana/web3.js";


const connection = new Connection("https://api.mainnet-beta.solana.com");
const app = express();

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

app.post("/api/v1/website", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const { url, policy, advanced } = req.body;

    if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required" });
    }

    try {
        new URL(url);
    } catch {
        return res.status(400).json({ error: "invalid url" });
    }

    const parsedUrl = new URL(url);
    const generatedSlug = `${slugify(parsedUrl.hostname)}-${Math.random().toString(36).slice(2, 8)}`;

    const data = await prismaClient.website.create({
        data: {
            userId,
            url,
            cooldownMinutes: Number.isFinite(policy?.cooldownMinutes) ? Math.max(1, Number(policy.cooldownMinutes)) : 10,
            retries: Number.isFinite(policy?.retries) ? Math.max(0, Number(policy.retries)) : 2,
            quorum: Number.isFinite(policy?.quorum) ? Math.max(1, Number(policy.quorum)) : 2,
            validatorsPerRound: Number.isFinite(policy?.validatorsPerRound) ? Math.max(1, Number(policy.validatorsPerRound)) : 3,
            escalationMinutes: Number.isFinite(policy?.escalationMinutes) ? Math.max(1, Number(policy.escalationMinutes)) : 5,
            statusPageSlug: generatedSlug,
            statusPageTitle: `${parsedUrl.hostname} Status`,
            checkType: advanced?.checkType ?? "HTTP",
            expectedKeyword: typeof advanced?.expectedKeyword === "string" ? advanced.expectedKeyword : null,
            dnsRecordType: typeof advanced?.dnsRecordType === "string" ? advanced.dnsRecordType : null,
            dnsExpectedValue: typeof advanced?.dnsExpectedValue === "string" ? advanced.dnsExpectedValue : null,
            tlsWarningDaysCsv: typeof advanced?.tlsWarningDaysCsv === "string" ? advanced.tlsWarningDaysCsv : "30,14,7",
            multiStepConfig: typeof advanced?.multiStepConfig === "string" ? advanced.multiStepConfig : null,
            sloTarget: Number.isFinite(advanced?.sloTarget) ? Number(advanced.sloTarget) : 99.9,
            errorBudgetWindowMinutes: Number.isFinite(advanced?.errorBudgetWindowMinutes) ? Math.max(60, Number(advanced.errorBudgetWindowMinutes)) : 43200,
            teamName: typeof advanced?.teamName === "string" ? advanced.teamName : "default",
        }
    })

    res.json({
        id: data.id
    })
})

app.get("/api/v1/website/status", authMiddleware, async (req, res) => {
    const websiteId = req.query.websiteId! as unknown as string;
    const userId = req.userId;

    const data = await prismaClient.website.findFirst({
        where: {
            id: websiteId,
            userId,
            disabled: false
        },
        include: {
            ticks: true,
            incidents: {
                include: {
                    events: {
                        orderBy: { createdAt: "desc" },
                        take: 50,
                    },
                },
                orderBy: { startedAt: "desc" },
                take: 10,
            },
        }
    })

    res.json(data)

})

app.get("/api/v1/websites", authMiddleware, async (req, res) => {
    const userId = req.userId!;

    const websites = await prismaClient.website.findMany({
        where: {
            userId,
            disabled: false
        },
        include: {
            ticks: {
                orderBy: { createdAt: "desc" },
                take: 120,
            },
            incidents: {
                include: {
                    events: {
                        orderBy: { createdAt: "desc" },
                        take: 20,
                    },
                },
                orderBy: { startedAt: "desc" },
                take: 5,
            },
            alertRoutes: true,
            onCallSchedules: true,
            integrations: {
                where: {
                    enabled: true,
                },
            },
        }
    })

    res.json({
        websites
    })
})

app.patch("/api/v1/website/:websiteId/policy", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const websiteId = req.params.websiteId;
    const {
        cooldownMinutes,
        retries,
        quorum,
        validatorsPerRound,
        escalationMinutes,
        checkType,
        expectedKeyword,
        dnsRecordType,
        dnsExpectedValue,
        tlsWarningDaysCsv,
        multiStepConfig,
        sloTarget,
        errorBudgetWindowMinutes,
        teamName,
    } = req.body ?? {};

    const website = await prismaClient.website.findFirst({
        where: { id: websiteId, userId, disabled: false },
    });

    if (!website) {
        return res.status(404).json({ error: "website not found" });
    }

    const updated = await prismaClient.website.update({
        where: { id: websiteId },
        data: {
            cooldownMinutes: Number.isFinite(cooldownMinutes) ? Math.max(1, Number(cooldownMinutes)) : website.cooldownMinutes,
            retries: Number.isFinite(retries) ? Math.max(0, Number(retries)) : website.retries,
            quorum: Number.isFinite(quorum) ? Math.max(1, Number(quorum)) : website.quorum,
            validatorsPerRound: Number.isFinite(validatorsPerRound) ? Math.max(1, Number(validatorsPerRound)) : website.validatorsPerRound,
            escalationMinutes: Number.isFinite(escalationMinutes) ? Math.max(1, Number(escalationMinutes)) : website.escalationMinutes,
            checkType: typeof checkType === "string" ? checkType : website.checkType,
            expectedKeyword: typeof expectedKeyword === "string" ? expectedKeyword : website.expectedKeyword,
            dnsRecordType: typeof dnsRecordType === "string" ? dnsRecordType : website.dnsRecordType,
            dnsExpectedValue: typeof dnsExpectedValue === "string" ? dnsExpectedValue : website.dnsExpectedValue,
            tlsWarningDaysCsv: typeof tlsWarningDaysCsv === "string" ? tlsWarningDaysCsv : website.tlsWarningDaysCsv,
            multiStepConfig: typeof multiStepConfig === "string" ? multiStepConfig : website.multiStepConfig,
            sloTarget: Number.isFinite(sloTarget) ? Number(sloTarget) : website.sloTarget,
            errorBudgetWindowMinutes: Number.isFinite(errorBudgetWindowMinutes) ? Math.max(60, Number(errorBudgetWindowMinutes)) : website.errorBudgetWindowMinutes,
            teamName: typeof teamName === "string" ? teamName : website.teamName,
        },
    });

    return res.json({ website: updated });
});

app.post("/api/v1/website/:websiteId/alert-routes", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const websiteId = req.params.websiteId;
    const { targetTeam, minSeverity = "P3", channel = "WEBHOOK" } = req.body ?? {};

    const website = await prismaClient.website.findFirst({ where: { id: websiteId, userId, disabled: false } });
    if (!website) {
        return res.status(404).json({ error: "website not found" });
    }

    const route = await prismaClient.alertRoute.create({
        data: {
            websiteId,
            targetTeam: typeof targetTeam === "string" && targetTeam.trim() ? targetTeam.trim() : website.teamName,
            minSeverity,
            channel,
        },
    });

    return res.json({ route });
});

app.post("/api/v1/website/:websiteId/on-call", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const websiteId = req.params.websiteId;
    const { rotationName, timezone = "UTC", quietHoursStart, quietHoursEnd } = req.body ?? {};

    const website = await prismaClient.website.findFirst({ where: { id: websiteId, userId, disabled: false } });
    if (!website) {
        return res.status(404).json({ error: "website not found" });
    }

    const schedule = await prismaClient.onCallSchedule.create({
        data: {
            websiteId,
            rotationName: typeof rotationName === "string" && rotationName.trim() ? rotationName.trim() : `${website.teamName}-primary`,
            timezone,
            quietHoursStart: Number.isFinite(quietHoursStart) ? Number(quietHoursStart) : null,
            quietHoursEnd: Number.isFinite(quietHoursEnd) ? Number(quietHoursEnd) : null,
        },
    });

    return res.json({ schedule });
});

app.post("/api/v1/website/:websiteId/integrations", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const websiteId = req.params.websiteId;
    const { type = "WEBHOOK", endpoint } = req.body ?? {};

    const website = await prismaClient.website.findFirst({ where: { id: websiteId, userId, disabled: false } });
    if (!website) {
        return res.status(404).json({ error: "website not found" });
    }

    if (!endpoint || typeof endpoint !== "string") {
        return res.status(400).json({ error: "endpoint is required" });
    }

    const integration = await prismaClient.integrationChannel.create({
        data: {
            websiteId,
            type,
            endpoint,
            enabled: true,
        },
    });

    return res.json({ integration });
});

app.get("/api/v1/website/:websiteId/analytics", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const websiteId = req.params.websiteId;

    const website = await prismaClient.website.findFirst({
        where: { id: websiteId, userId, disabled: false },
    });

    if (!website) {
        return res.status(404).json({ error: "website not found" });
    }

    const from = new Date(Date.now() - website.errorBudgetWindowMinutes * 60 * 1000);
    const ticks = await prismaClient.websiteTick.findMany({
        where: {
            websiteId,
            createdAt: { gte: from },
        },
        include: {
            validator: true,
        },
        orderBy: { createdAt: "asc" },
    });

    const latencies = ticks.map((tick) => tick.latency).sort((a, b) => a - b);
    const percentile = (p: number) => {
        if (latencies.length === 0) return 0;
        const index = Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length));
        return latencies[index];
    };

    const total = ticks.length;
    const good = ticks.filter((tick) => tick.status === "Good").length;
    const sli = total === 0 ? 100 : (good / total) * 100;
    const errorBudgetRemaining = Math.max(0, 100 - Math.max(0, sli - website.sloTarget));

    const incidents = await prismaClient.incident.findMany({
        where: { websiteId },
        orderBy: { startedAt: "desc" },
    });

    const mttaSamples = incidents
        .filter((incident) => incident.acknowledgedAt)
        .map((incident) => incident.acknowledgedAt!.getTime() - incident.startedAt.getTime());
    const mttrSamples = incidents
        .filter((incident) => incident.resolvedAt)
        .map((incident) => incident.resolvedAt!.getTime() - incident.startedAt.getTime());

    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

    const regionMap = new Map<string, { good: number; bad: number }>();
    for (const tick of ticks) {
        const region = tick.validator.location || "unknown";
        const row = regionMap.get(region) ?? { good: 0, bad: 0 };
        if (tick.status === "Good") row.good += 1; else row.bad += 1;
        regionMap.set(region, row);
    }

    const regionalHeatmap = Array.from(regionMap.entries()).map(([region, value]) => ({
        region,
        total: value.good + value.bad,
        errorRate: (value.bad / Math.max(1, value.good + value.bad)) * 100,
    }));

    return res.json({
        analytics: {
            sli,
            sloTarget: website.sloTarget,
            errorBudgetRemaining,
            latency: {
                p50: percentile(50),
                p95: percentile(95),
                p99: percentile(99),
            },
            mttaMs: average(mttaSamples),
            mttrMs: average(mttrSamples),
            regionalHeatmap,
        },
    });
});

app.patch("/api/v1/website/:websiteId/status-page", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const websiteId = req.params.websiteId;
    const { slug, title, isPublic } = req.body ?? {};

    const website = await prismaClient.website.findFirst({
        where: { id: websiteId, userId, disabled: false },
    });

    if (!website) {
        return res.status(404).json({ error: "website not found" });
    }

    const normalizedSlug = typeof slug === "string" && slug.trim().length > 0
        ? slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")
        : website.statusPageSlug;

    const updated = await prismaClient.website.update({
        where: { id: websiteId },
        data: {
            statusPageSlug: normalizedSlug,
            statusPageTitle: typeof title === "string" && title.trim() ? title.trim() : website.statusPageTitle,
            statusPagePublic: typeof isPublic === "boolean" ? isPublic : website.statusPagePublic,
        },
    });

    return res.json({ website: updated });
});

app.get("/api/v1/incidents", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const websiteId = typeof req.query.websiteId === "string" ? req.query.websiteId : undefined;

    const incidents = await prismaClient.incident.findMany({
        where: {
            website: {
                userId,
                disabled: false,
                ...(websiteId ? { id: websiteId } : {}),
            },
        },
        include: {
            website: true,
            events: {
                orderBy: { createdAt: "desc" },
                take: 100,
            },
        },
        orderBy: { startedAt: "desc" },
    });

    return res.json({ incidents });
});

app.post("/api/v1/incidents/:incidentId/ack", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const incidentId = req.params.incidentId;

    const incident = await prismaClient.incident.findFirst({
        where: {
            id: incidentId,
            website: {
                userId,
                disabled: false,
            },
        },
    });

    if (!incident) {
        return res.status(404).json({ error: "incident not found" });
    }

    const now = new Date();

    await prismaClient.$transaction(async (tx) => {
        await tx.incident.update({
            where: { id: incident.id },
            data: {
                acknowledgedAt: now,
            },
        });

        await tx.incidentEvent.create({
            data: {
                incidentId: incident.id,
                type: "ACKNOWLEDGED",
                message: `Incident acknowledged by user ${userId}`,
            },
        });
    });

    return res.json({ message: "incident acknowledged" });
});

app.get("/api/v1/incidents/:incidentId/postmortem-template", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const incidentId = req.params.incidentId;

    const incident = await prismaClient.incident.findFirst({
        where: {
            id: incidentId,
            website: {
                userId,
                disabled: false,
            },
        },
        include: {
            website: true,
            events: {
                orderBy: { createdAt: "asc" },
            },
        },
    });

    if (!incident) {
        return res.status(404).json({ error: "incident not found" });
    }

    const timeline = incident.events.map((event) => `- ${event.createdAt.toISOString()} | ${event.type} | ${event.message}`).join("\n");
    const template = incident.postmortemTemplate ?? [
        `# Postmortem for ${incident.website.url}`,
        "",
        "## Summary",
        "Describe what happened.",
        "",
        "## Impact",
        "- Affected users/services",
        "- Duration",
        "",
        "## Timeline",
        timeline || "- No timeline events captured",
        "",
        "## Root cause",
        "",
        "## Action items",
        "- [ ]",
    ].join("\n");

    return res.json({ template });
});

app.get("/api/v1/status/:slug", async (req, res) => {
    const slug = req.params.slug;

    const website = await prismaClient.website.findFirst({
        where: {
            statusPageSlug: slug,
            disabled: false,
        },
        include: {
            ticks: {
                orderBy: { createdAt: "desc" },
                take: 120,
            },
            incidents: {
                include: {
                    events: {
                        orderBy: { createdAt: "desc" },
                        take: 100,
                    },
                },
                orderBy: { startedAt: "desc" },
                take: 20,
            },
        },
    });

    if (!website) {
        return res.status(404).json({ error: "status page not found" });
    }

    if (!website.statusPagePublic) {
        return res.status(403).json({ error: "status page is private" });
    }

    const currentTick = website.ticks[0];
    return res.json({
        statusPage: {
            title: website.statusPageTitle,
            slug: website.statusPageSlug,
            url: website.url,
            currentStatus: currentTick?.status ?? "Unknown",
            currentLatency: currentTick?.latency ?? null,
            timeline: website.incidents.flatMap((incident) => incident.events),
            incidents: website.incidents,
        },
    });
});

app.delete("/api/v1/website/", authMiddleware, async (req, res) => {
    const websiteId = req.body.websiteId;
    const userId = req.userId!;

    await prismaClient.website.update({
        where: {
            id: websiteId,
            userId
        },
        data: {
            disabled: true
        }
    })

    res.json({
        message: "Deleted website successfully"
    })
})

app.post("/api/v1/payout/:validatorId", async (req, res) => {
    const validatorId = req.params.validatorId;

    if (!validatorId) {
        return res.status(400).json({ error: "validatorId is required" });
    }

    const validator = await prismaClient.validator.findUnique({
        where: {
            id: validatorId,
        },
    });

    if (!validator) {
        return res.status(404).json({ error: "validator not found" });
    }

    if (validator.pendingPayouts <= 0) {
        return res.status(400).json({ error: "no pending payouts for validator" });
    }

    const payerPrivateKey = process.env.PAYER_PRIVATE_KEY;
    if (!payerPrivateKey) {
        return res.status(500).json({ error: "PAYER_PRIVATE_KEY is not configured" });
    }

    let payer: Keypair;
    try {
        payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(payerPrivateKey)));
    } catch {
        return res.status(500).json({ error: "invalid PAYER_PRIVATE_KEY format" });
    }

    let validatorPubkey: PublicKey;
    try {
        validatorPubkey = new PublicKey(validator.publicKey);
    } catch {
        return res.status(400).json({ error: "validator has invalid public key" });
    }

    const lamports = validator.pendingPayouts;

    try {
        const latestBlockhash = await connection.getLatestBlockhash();
        const transaction = new Transaction({
            feePayer: payer.publicKey,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }).add(
            SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                toPubkey: validatorPubkey,
                lamports,
            })
        );

        const signature = await connection.sendTransaction(transaction, [payer]);
        await connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        });

        await prismaClient.validator.update({
            where: {
                id: validatorId,
            },
            data: {
                pendingPayouts: 0,
            },
        });

        return res.json({
            message: "payout completed",
            validatorId,
            lamports,
            signature,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        return res.status(500).json({ error: "payout failed", message });
    }
})

const port = parseInt(process.env.PORT || "5050", 10);
const host = "0.0.0.0"; // Bind to all interfaces (IPv4 and IPv6)

app.listen(port, host, () => {
    console.log(`API listening on http://${host}:${port}`);
    console.log(`Local access: http://localhost:${port}`);
});
