import { randomUUIDv7 } from "bun";
import type { OutgoingMessage, SignupOutgoingMessage, ValidateOutgoingMessage } from "common/types";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config({ path: '../../.env' });
dotenv.config();

const CALLBACKS: {[callbackId: string]: (data: SignupOutgoingMessage) => void} = {}

let validatorId: string | null = null;

function parsePrivateKeyBytes(raw: string): Uint8Array {
    const trimmed = raw.trim();

    if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            throw new Error("PRIVATE_KEY JSON must be an array");
        }
        return Uint8Array.from(parsed);
    }

    if (/^\d+(\s*,\s*\d+)+$/.test(trimmed)) {
        return Uint8Array.from(trimmed.split(",").map(v => Number(v.trim())));
    }

    return bs58.decode(trimmed);
}

function loadValidatorKeypair(): Keypair {
    const rawPrivateKey = process.env.PRIVATE_KEY;

    if (!rawPrivateKey) {
        console.warn("⚠️  PRIVATE_KEY not found. Using an ephemeral validator keypair for this session.");
        return Keypair.generate();
    }

    try {
        const privateKeyBytes = parsePrivateKeyBytes(rawPrivateKey);

        if (privateKeyBytes.length === 64) {
            return Keypair.fromSecretKey(privateKeyBytes);
        }

        if (privateKeyBytes.length === 32) {
            return Keypair.fromSeed(privateKeyBytes);
        }

        throw new Error(`Unsupported key length ${privateKeyBytes.length}. Expected 32 or 64 bytes.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown parsing error";
        console.warn(`⚠️  Invalid PRIVATE_KEY (${message}). Using an ephemeral validator keypair for this session.`);
        return Keypair.generate();
    }
}

async function main() {
    const keypair = loadValidatorKeypair();
    const ws = new WebSocket("ws://localhost:8081");

    ws.onmessage = async (event) => {
        const data: OutgoingMessage = JSON.parse(event.data);
        if (data.type === 'signup') {
            CALLBACKS[data.data.callbackId]?.(data.data)
            delete CALLBACKS[data.data.callbackId];
        } else if (data.type === 'validate') {
            await validateHandler(ws, data.data, keypair);
        }
    }

    ws.onopen = async () => {
        const callbackId = randomUUIDv7();
        CALLBACKS[callbackId] = (data: SignupOutgoingMessage) => {
            validatorId = data.validatorId;
        }
        const signedMessage = await signMessage(`Signed message for ${callbackId}, ${keypair.publicKey}`, keypair);

        ws.send(JSON.stringify({
            type: 'signup',
            data: {
                callbackId,
                ip: '127.0.0.1',
                publicKey: keypair.publicKey.toBase58(),
                signedMessage,
            },
        }));
    }
}

async function validateHandler(ws: WebSocket, { url, callbackId, websiteId }: ValidateOutgoingMessage, keypair: Keypair) {
    console.log(`Validating ${url}`);
    const startTime = Date.now();
    const signature = await signMessage(`Replying to ${callbackId}`, keypair);

    try {
        const response = await fetch(url);
        const endTime = Date.now();
        const latency = endTime - startTime;
        const status = response.status;

        console.log(url);
        console.log(status);
        ws.send(JSON.stringify({
            type: 'validate',
            data: {
                callbackId,
                status: status === 200 ? 'Good' : 'Bad',
                latency,
                websiteId,
                validatorId,
                signedMessage: signature,
            },
        }));
    } catch (error) {
        ws.send(JSON.stringify({
            type: 'validate',
            data: {
                callbackId,
                status:'Bad',
                latency: 1000,
                websiteId,
                validatorId,
                signedMessage: signature,
            },
        }));
        console.error(error);
    }
}

async function signMessage(message: string, keypair: Keypair) {
    const messageBytes = nacl_util.decodeUTF8(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

    return JSON.stringify(Array.from(signature));
}

main();

setInterval(async () => {

}, 10000);