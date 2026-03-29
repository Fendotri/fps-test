import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const loadEnvFile = () => {
    const candidates = [
        path.resolve(process.cwd(), 'backend/.env'),
        path.resolve(process.cwd(), '.env'),
    ];

    for (const filePath of candidates) {
        if (!existsSync(filePath)) continue;
        const raw = readFileSync(filePath, 'utf8');
        raw.split(/\r?\n/g).forEach((line) => {
            const trimmed = `${line || ''}`.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex <= 0) return;
            const key = trimmed.slice(0, eqIndex).trim();
            if (!key || process.env[key] !== undefined) return;
            let value = trimmed.slice(eqIndex + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        });
        return filePath;
    }
    return null;
};

loadEnvFile();

const toNumber = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
};

const parseCorsOrigins = (value) => {
    if (!value) return ['http://localhost:5173'];
    const normalized = `${value}`.trim();
    if (normalized === '*') return ['*'];

    const parts = normalized
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    return parts.length ? parts : ['http://localhost:5173'];
};

export const config = {
    host: process.env.BACKEND_HOST || '0.0.0.0',
    port: toNumber(process.env.BACKEND_PORT, 8787),
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
    authSecret: process.env.AUTH_SECRET || 'change-me-in-production',
    adminApiKey: process.env.ADMIN_API_KEY || '',
    tokenTtlSeconds: toNumber(process.env.TOKEN_TTL_SECONDS, 60 * 60 * 24 * 14),
    wsTickRate: toNumber(process.env.WS_TICK_RATE, 20),
    dataFile: process.env.DATA_FILE || path.resolve(process.cwd(), 'backend/data/db.json'),
    publicDir: process.env.PUBLIC_DIR || path.resolve(process.cwd(), 'public'),
    profanityFile: process.env.PROFANITY_FILTER_FILE || (
        (() => {
            const rootFile = path.resolve(process.cwd(), 'profanity_filter_list.txt');
            if (existsSync(rootFile)) return rootFile;
            return path.resolve(process.cwd(), 'backend/data/profanity_filter_list.txt');
        })()
    ),
    chatHistoryLimit: toNumber(process.env.CHAT_HISTORY_LIMIT, 400),
};
