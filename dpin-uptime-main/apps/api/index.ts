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

app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

app.post("/api/v1/website", authMiddleware, async (req, res) => {
    const userId = req.userId!;
    const { url } = req.body;

    if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required" });
    }

    try {
        new URL(url);
    } catch {
        return res.status(400).json({ error: "invalid url" });
    }

    const data = await prismaClient.website.create({
        data: {
            userId,
            url
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
            ticks: true
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
            ticks: true
        }
    })

    res.json({
        websites
    })
})

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
