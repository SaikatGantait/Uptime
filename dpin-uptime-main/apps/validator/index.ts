import { randomUUIDv7 } from "bun";
import type { OutgoingMessage, SignupOutgoingMessage, ValidateOutgoingMessage } from "common/types";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";
import dotenv from "dotenv";
import bs58 from "bs58";
import dns from "node:dns/promises";
import tls from "node:tls";

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

async function validateHandler(ws: WebSocket, payload: ValidateOutgoingMessage, keypair: Keypair) {
    const { url, callbackId, websiteId, retries } = payload;
    console.log(`Validating ${url}`);
    const signature = await signMessage(`Replying to ${callbackId}`, keypair);
    const result = await runCheckEngine({ url, retries, payload });

    ws.send(JSON.stringify({
        type: 'validate',
        data: {
            callbackId,
            status: result.ok ? 'Good' : 'Bad',
            latency: result.latency,
            websiteId,
            validatorId,
            signedMessage: signature,
            severity: result.severity,
            details: result.details,
        },
    }));
}

async function runCheckEngine({
    url,
    retries,
    payload,
}: {
    url: string;
    retries: number;
    payload: ValidateOutgoingMessage;
}): Promise<{ ok: boolean; latency: number; severity: 'P1' | 'P2' | 'P3'; details: string }> {
    switch (payload.checkType) {
        case 'MULTI_STEP':
            return runMultiStepCheck(payload.multiStepConfig, retries, url);
        case 'KEYWORD':
            return runKeywordCheck(url, payload.expectedKeyword, retries);
        case 'DNS':
            return runDnsCheck(url, payload.dnsRecordType, payload.dnsExpectedValue);
        case 'TLS':
            return runTlsCheck(url, payload.tlsWarningDaysCsv);
        case 'HTTP':
        default:
            return runHttpCheck(url, retries);
    }
}

async function runHttpCheck(url: string, retries: number) {
    const attempts = Math.max(1, retries + 1);
    let lastLatency = 1000;
    let lastStatus = 0;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const startTime = Date.now();
        try {
            const response = await fetch(url);
            const latency = Date.now() - startTime;
            lastLatency = latency;
            lastStatus = response.status;

            if (response.status >= 200 && response.status < 400) {
                return { ok: true, latency, severity: 'P3' as const, details: `HTTP ${response.status}` };
            }
        } catch {
            // ignore and retry
        }

        if (attempt < attempts) {
            await Bun.sleep(250);
        }
    }

    return {
        ok: false,
        latency: lastLatency,
        severity: 'P2' as const,
        details: `HTTP failed after ${attempts} attempts (last status ${lastStatus || 'n/a'})`,
    };
}

async function runKeywordCheck(url: string, keyword?: string | null, retries = 0) {
    const attempts = Math.max(1, retries + 1);
    const target = keyword?.trim() ?? '';
    if (!target) {
        return { ok: false, latency: 0, severity: 'P2' as const, details: 'Missing expected keyword' };
    }

    let lastLatency = 1000;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const startTime = Date.now();
        try {
            const response = await fetch(url);
            const text = await response.text();
            const latency = Date.now() - startTime;
            lastLatency = latency;

            if (response.status >= 200 && response.status < 400 && text.includes(target)) {
                return { ok: true, latency, severity: 'P3' as const, details: `Keyword '${target}' found` };
            }
        } catch {
            // retry
        }

        if (attempt < attempts) {
            await Bun.sleep(250);
        }
    }

    return { ok: false, latency: lastLatency, severity: 'P2' as const, details: `Keyword '${target}' not found` };
}

async function runDnsCheck(url: string, recordType?: string | null, expected?: string | null) {
    try {
        const hostname = new URL(url).hostname;
        const type = (recordType || 'A').toUpperCase();
        const records = await dns.resolve(hostname, type as "A");
        const normalized = records.map((record) => String(record));

        if (expected && !normalized.some((value) => value.includes(expected))) {
            return { ok: false, latency: 0, severity: 'P2' as const, details: `DNS mismatch for ${hostname}: expected '${expected}' in ${normalized.join(', ')}` };
        }

        return { ok: true, latency: 0, severity: 'P3' as const, details: `DNS ${type} ${normalized.join(', ')}` };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'DNS resolution failed';
        return { ok: false, latency: 0, severity: 'P1' as const, details: message };
    }
}

async function runTlsCheck(url: string, warningDaysCsv?: string | null) {
    try {
        const hostname = new URL(url).hostname;
        const warningDays = (warningDaysCsv || '30,14,7')
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value) && value > 0)
            .sort((a, b) => a - b);

        const certExpiry = await new Promise<Date>((resolve, reject) => {
            const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false }, () => {
                const certificate = socket.getPeerCertificate();
                socket.end();
                if (!certificate?.valid_to) {
                    reject(new Error('TLS certificate missing valid_to')); 
                    return;
                }
                resolve(new Date(certificate.valid_to));
            });

            socket.setTimeout(10000, () => {
                socket.destroy();
                reject(new Error('TLS timeout'));
            });

            socket.on('error', reject);
        });

        const daysLeft = Math.floor((certExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const highestThreshold = warningDays[warningDays.length - 1] ?? 30;

        if (daysLeft <= 3) {
            return { ok: false, latency: 0, severity: 'P1' as const, details: `TLS certificate expires in ${daysLeft} day(s)` };
        }

        if (daysLeft <= highestThreshold) {
            return { ok: false, latency: 0, severity: 'P2' as const, details: `TLS warning: expires in ${daysLeft} day(s)` };
        }

        return { ok: true, latency: 0, severity: 'P3' as const, details: `TLS valid for ${daysLeft} day(s)` };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'TLS check failed';
        return { ok: false, latency: 0, severity: 'P1' as const, details: message };
    }
}

async function runMultiStepCheck(config?: string | null, retries = 0, fallbackUrl?: string) {
    let steps: Array<{ url: string; method?: string; body?: string; headers?: Record<string, string>; expectedStatus?: number; expectedKeyword?: string }> = [];
    if (config) {
        try {
            const parsed = JSON.parse(config);
            if (Array.isArray(parsed)) {
                steps = parsed;
            }
        } catch {
            // fallback below
        }
    }

    if (steps.length === 0 && fallbackUrl) {
        steps = [{ url: fallbackUrl, method: 'GET', expectedStatus: 200 }];
    }

    const attempts = Math.max(1, retries + 1);
    let lastLatency = 0;

    for (const [index, step] of steps.entries()) {
        let stepPassed = false;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const start = Date.now();
            try {
                const response = await fetch(step.url, {
                    method: step.method || 'GET',
                    headers: step.headers,
                    body: step.body,
                });
                const text = await response.text();
                const latency = Date.now() - start;
                lastLatency = latency;
                const expectedStatus = step.expectedStatus ?? 200;
                const statusOk = response.status === expectedStatus;
                const keywordOk = !step.expectedKeyword || text.includes(step.expectedKeyword);

                if (statusOk && keywordOk) {
                    stepPassed = true;
                    break;
                }
            } catch {
                // retry
            }
            if (attempt < attempts) {
                await Bun.sleep(250);
            }
        }

        if (!stepPassed) {
            return {
                ok: false,
                latency: lastLatency,
                severity: 'P1' as const,
                details: `Multi-step failed at step ${index + 1}`,
            };
        }
    }

    return { ok: true, latency: lastLatency, severity: 'P3' as const, details: `Multi-step passed (${steps.length} step(s))` };
}

async function signMessage(message: string, keypair: Keypair) {
    const messageBytes = nacl_util.decodeUTF8(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

    return JSON.stringify(Array.from(signature));
}

main();

setInterval(async () => {

}, 10000);