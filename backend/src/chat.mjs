import fs from 'node:fs/promises';

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const ALNUM_RE = /[\p{L}\p{N}]/u;
const MAX_MESSAGE_LENGTH = 220;
const DEFAULT_HISTORY_LIMIT = 400;

const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 6;
const RATE_MIN_INTERVAL_MS = 650;
const RATE_DUPLICATE_WINDOW_MS = 12_000;
const RATE_COOLDOWN_MS = 6_000;
const RATE_STATE_MAX_USERS = 4000;

const toInt = (value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const trimUnicode = (value, limit) => Array.from(`${value || ''}`).slice(0, limit).join('');

const normalizeDisplayName = (value, fallback) => {
    const text = `${value || ''}`
        .replace(/[^\p{L}\p{N}_\-\[\]\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 26);
    return text || fallback;
};

const normalizeMessage = (value) => {
    const compact = `${value || ''}`
        .replace(/\s+/g, ' ')
        .trim();
    return trimUnicode(compact, MAX_MESSAGE_LENGTH);
};

const tokenizeWithOffsets = (text) => {
    const input = `${text || ''}`;
    const tokens = [];
    for (const match of input.matchAll(WORD_RE)) {
        const value = `${match[0] || ''}`.toLowerCase();
        const index = Number(match.index) || 0;
        if (!value) continue;
        tokens.push({
            value,
            start: index,
            end: index + match[0].length,
        });
    }
    return tokens;
};

const tokenizeValues = (text) => tokenizeWithOffsets(text).map((item) => item.value);

const parseFilterLines = (raw) => (
    `${raw || ''}`
        .split(/\r?\n/g)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => !!line && !line.startsWith('//') && !line.startsWith(';'))
);

const hasNonWordChar = (value) => /[^\p{L}\p{N}\s]/u.test(value);

const isBoundaryChar = (char) => {
    if (!char) return true;
    return !ALNUM_RE.test(char);
};

const buildProfanityMatcher = (entries) => {
    const singleWords = new Set();
    const phraseMap = new Map();
    const literalMap = new Map();
    let literalCount = 0;

    entries.forEach((entry) => {
        const normalizedEntry = `${entry || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
        if (!normalizedEntry) return;

        const containsSymbols = hasNonWordChar(normalizedEntry);
        if (!containsSymbols) {
            const tokens = tokenizeValues(normalizedEntry);
            if (tokens.length === 1) {
                singleWords.add(tokens[0]);
            } else if (tokens.length > 1) {
                const head = tokens[0];
                const list = phraseMap.get(head) || [];
                list.push(tokens);
                phraseMap.set(head, list);
            }
        } else {
            const first = normalizedEntry[0];
            if (!first) return;
            const list = literalMap.get(first) || [];
            if (!list.includes(normalizedEntry)) {
                list.push(normalizedEntry);
                literalMap.set(first, list);
                literalCount += 1;
            }
        }
    });

    phraseMap.forEach((list, key) => {
        list.sort((a, b) => b.length - a.length);
        phraseMap.set(key, list);
    });

    literalMap.forEach((list, key) => {
        list.sort((a, b) => b.length - a.length);
        literalMap.set(key, list);
    });

    return {
        singleWords,
        phraseMap,
        literalMap,
        size: entries.length,
        literalCount,
    };
};

const detectProfanity = (text, matcher) => {
    const source = `${text || ''}`;
    const lower = source.toLowerCase();
    const tokens = tokenizeWithOffsets(source);

    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (matcher.singleWords.has(token.value)) {
            return {
                phrase: token.value,
                start: token.start,
                end: token.end,
            };
        }

        const candidates = matcher.phraseMap.get(token.value);
        if (!candidates || !candidates.length) continue;
        for (const phraseTokens of candidates) {
            if ((i + phraseTokens.length - 1) >= tokens.length) continue;
            let valid = true;
            for (let j = 0; j < phraseTokens.length; j += 1) {
                if (tokens[i + j].value !== phraseTokens[j]) {
                    valid = false;
                    break;
                }
            }
            if (valid) {
                return {
                    phrase: phraseTokens.join(' '),
                    start: tokens[i].start,
                    end: tokens[i + phraseTokens.length - 1].end,
                };
            }
        }
    }

    for (let i = 0; i < lower.length; i += 1) {
        const key = lower[i];
        const candidates = matcher.literalMap.get(key);
        if (!candidates || !candidates.length) continue;
        for (const literal of candidates) {
            if (!lower.startsWith(literal, i)) continue;
            const end = i + literal.length;
            const prev = i > 0 ? lower[i - 1] : '';
            const next = end < lower.length ? lower[end] : '';
            if (!isBoundaryChar(prev) || !isBoundaryChar(next)) continue;
            return {
                phrase: literal,
                start: i,
                end,
            };
        }
    }

    return null;
};

const normalizeForSpam = (text) => `${text || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();

const pruneRateState = (rateState) => {
    if (rateState.size <= RATE_STATE_MAX_USERS) return;
    const now = Date.now();
    const staleBefore = now - Math.max(RATE_WINDOW_MS, RATE_DUPLICATE_WINDOW_MS) - RATE_COOLDOWN_MS;
    for (const [userId, state] of rateState) {
        if (state.lastSeenAt < staleBefore) {
            rateState.delete(userId);
        }
        if (rateState.size <= RATE_STATE_MAX_USERS) break;
    }
};

const checkSpam = (rateState, userId, message, now) => {
    const state = rateState.get(userId) || {
        timestamps: [],
        lastSentAt: 0,
        mutedUntil: 0,
        lastMessageNorm: '',
        lastMessageAt: 0,
        lastSeenAt: now,
    };
    state.lastSeenAt = now;

    if (state.mutedUntil > now) {
        rateState.set(userId, state);
        return {
            ok: false,
            reason: 'spam-cooldown',
            retryAfterMs: state.mutedUntil - now,
        };
    }

    if (state.lastSentAt && (now - state.lastSentAt) < RATE_MIN_INTERVAL_MS) {
        rateState.set(userId, state);
        return {
            ok: false,
            reason: 'slow-down',
            retryAfterMs: RATE_MIN_INTERVAL_MS - (now - state.lastSentAt),
        };
    }

    state.timestamps = state.timestamps.filter((ts) => (now - ts) <= RATE_WINDOW_MS);
    if (state.timestamps.length >= RATE_MAX_MESSAGES) {
        state.mutedUntil = now + RATE_COOLDOWN_MS;
        rateState.set(userId, state);
        return {
            ok: false,
            reason: 'spam-window',
            retryAfterMs: RATE_COOLDOWN_MS,
        };
    }

    const normalized = normalizeForSpam(message);
    if (normalized && state.lastMessageNorm === normalized && (now - state.lastMessageAt) < RATE_DUPLICATE_WINDOW_MS) {
        rateState.set(userId, state);
        return {
            ok: false,
            reason: 'duplicate-message',
            retryAfterMs: RATE_DUPLICATE_WINDOW_MS - (now - state.lastMessageAt),
        };
    }

    state.timestamps.push(now);
    state.lastSentAt = now;
    state.lastMessageNorm = normalized;
    state.lastMessageAt = now;
    rateState.set(userId, state);
    pruneRateState(rateState);

    return { ok: true };
};

const ensureChatStore = (data) => {
    if (!data.chat || typeof data.chat !== 'object') data.chat = {};
    if (!Array.isArray(data.chat.lobby)) data.chat.lobby = [];
    data.chat.nextId = toInt(data.chat.nextId, 1, 1);
};

const fallbackMatcher = buildProfanityMatcher([
    'pain in the ass',
    'fuck',
    'fucking',
    'shit',
    'motherfucker',
    'amk',
    'aq',
    'siktir',
]);

const loadMatcherFromFile = async (filePath) => {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const lines = parseFilterLines(raw);
        if (!lines.length) return { matcher: fallbackMatcher, loadedFromFile: false, entries: fallbackMatcher.size };
        return { matcher: buildProfanityMatcher(lines), loadedFromFile: true, entries: lines.length };
    } catch {
        return { matcher: fallbackMatcher, loadedFromFile: false, entries: fallbackMatcher.size };
    }
};

export const createLobbyChatService = async ({
    db,
    profanityFile,
    historyLimit = DEFAULT_HISTORY_LIMIT,
}) => {
    const filterSource = await loadMatcherFromFile(profanityFile);
    const rateState = new Map();
    const cappedHistory = toInt(historyLimit, DEFAULT_HISTORY_LIMIT, 100, 3000);

    const list = ({ afterId = 0, limit = 50 }) => {
        const data = db.read();
        const lobby = Array.isArray(data.chat?.lobby) ? data.chat.lobby : [];
        const safeAfter = toInt(afterId, 0, 0);
        const safeLimit = toInt(limit, 50, 1, 200);

        if (!lobby.length) {
            return {
                messages: [],
                nextCursor: safeAfter,
                serverTime: new Date().toISOString(),
            };
        }

        let messages;
        if (safeAfter > 0) {
            messages = lobby.filter((item) => toInt(item.id, 0, 0) > safeAfter).slice(0, safeLimit);
        } else {
            messages = lobby.slice(-safeLimit);
        }

        const nextCursor = messages.length
            ? toInt(messages[messages.length - 1]?.id, safeAfter, 0)
            : safeAfter;

        return {
            messages,
            nextCursor,
            serverTime: new Date().toISOString(),
        };
    };

    const post = async ({ user, text, displayName }) => {
        const cleaned = normalizeMessage(text);
        if (!cleaned) {
            return { ok: false, status: 400, error: 'Message is empty.' };
        }

        const spam = checkSpam(rateState, user.id, cleaned, Date.now());
        if (!spam.ok) {
            return {
                ok: false,
                status: 429,
                error: 'You are sending messages too fast.',
                reason: spam.reason,
                retryAfterMs: spam.retryAfterMs,
            };
        }

        const profanityHit = detectProfanity(cleaned, filterSource.matcher);
        if (profanityHit) {
            return {
                ok: false,
                status: 400,
                error: 'Message blocked by profanity filter.',
                reason: 'profanity',
                blockedPhrase: profanityHit.phrase,
            };
        }

        let created = null;
        await db.mutate((mutable) => {
            const target = mutable.users.find((item) => item.id === user.id);
            if (!target) return;

            ensureChatStore(mutable);
            const messageId = toInt(mutable.chat.nextId, 1, 1);
            const nowIso = new Date().toISOString();
            created = {
                id: messageId,
                userId: target.id,
                username: target.username,
                displayName: normalizeDisplayName(displayName, target.username),
                title: `${target.progression?.cosmetics?.title || ''}`,
                nameColor: `${target.progression?.cosmetics?.nameColor || 'default'}`,
                avatar: `${target.progression?.cosmetics?.avatar || 'rookie_ops'}`,
                avatarFrame: `${target.progression?.cosmetics?.avatarFrame || 'default'}`,
                text: cleaned,
                createdAt: nowIso,
            };

            mutable.chat.nextId = messageId + 1;
            mutable.chat.lobby.push(created);
            if (mutable.chat.lobby.length > cappedHistory) {
                mutable.chat.lobby.splice(0, mutable.chat.lobby.length - cappedHistory);
            }
        });

        if (!created) {
            return { ok: false, status: 401, error: 'Unauthorized' };
        }

        return {
            ok: true,
            message: created,
            serverTime: new Date().toISOString(),
        };
    };

    const meta = () => ({
        profanityEntries: filterSource.entries,
        profanitySource: filterSource.loadedFromFile ? 'file' : 'fallback',
    });

    return {
        list,
        post,
        meta,
    };
};

export const normalizeChatStore = (rawChat) => {
    const normalized = {
        nextId: 1,
        lobby: [],
    };
    if (!rawChat || typeof rawChat !== 'object') return normalized;
    normalized.nextId = toInt(rawChat.nextId, 1, 1);
    if (Array.isArray(rawChat.lobby)) {
        normalized.lobby = rawChat.lobby
            .map((item) => ({
                id: toInt(item?.id, 0, 0),
                userId: `${item?.userId || ''}`,
                username: `${item?.username || ''}`,
                displayName: `${item?.displayName || item?.username || ''}`,
                title: `${item?.title || ''}`,
                nameColor: `${item?.nameColor || 'default'}`,
                avatar: `${item?.avatar || 'rookie_ops'}`,
                avatarFrame: `${item?.avatarFrame || 'default'}`,
                text: trimUnicode(normalizeMessage(item?.text || ''), MAX_MESSAGE_LENGTH),
                createdAt: `${item?.createdAt || ''}`,
            }))
            .filter((item) => item.id > 0 && item.userId && item.text);
        if (normalized.lobby.length) {
            const maxId = normalized.lobby.reduce((acc, item) => Math.max(acc, item.id), 0);
            normalized.nextId = Math.max(normalized.nextId, maxId + 1);
        }
    }
    return normalized;
};
