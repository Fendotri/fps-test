import path from 'node:path';
import { existsSync } from 'node:fs';

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
    profanityFile: process.env.PROFANITY_FILTER_FILE || (
        (() => {
            const rootFile = path.resolve(process.cwd(), 'profanity_filter_list.txt');
            if (existsSync(rootFile)) return rootFile;
            return path.resolve(process.cwd(), 'backend/data/profanity_filter_list.txt');
        })()
    ),
    chatHistoryLimit: toNumber(process.env.CHAT_HISTORY_LIMIT, 400),
};
