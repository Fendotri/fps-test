import http from 'node:http';
import crypto from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './src/config.mjs';
import { JsonDb, createNewUser, toPublicUser } from './src/db.mjs';
import {
    acceptFriendRequest,
    buildFriendsSnapshot,
    cancelFriendRequest,
    declineFriendRequest,
    removeFriend,
    searchFriendCandidates,
    sendFriendRequest,
} from './src/friends.mjs';
import {
    buildDirectThread,
    buildSocialSnapshot,
    createSquadRoom,
    claimFriendGift,
    joinSquadRoomByPartyId,
    leaveSquadRoom,
    listPublicSquadRooms,
    markDirectThreadRead,
    respondSquadInvite,
    sendDirectMessage,
    sendFriendGift,
    sendSquadInvite,
    setSquadRoomVisibility,
} from './src/social.mjs';
import { applyFfaProgress, buildLeaderboard } from './src/leaderboard.mjs';
import {
    buildCasesCatalogResponse,
    buildSpinTrack,
    computeFfaRewardBreakdown,
    findSkinMeta,
    getCaseById,
    getCasesArray,
    getDefaultLoadout,
    getShopOffers,
    getWeaponsCatalog,
    normalizeLoadout,
    normalizeLiveops,
    pickWeightedDrop,
} from './src/liveops.mjs';
import {
    buildPremierLeaderboard,
    computePremierUpdate,
    getPremierTierMeta,
    resolveCurrentPremierProfile,
    setCurrentPremierProfile,
    syncUserPremierMirror,
    toPremierPublic,
} from './src/premier.mjs';
import {
    applyProgressionFromMatch,
    buildProgressionSnapshot,
    claimWeeklyLoginReward,
    equipProgressionCosmetic,
} from './src/progression.mjs';
import {
    hashPassword,
    isStrongPassword,
    isValidUsername,
    issueToken,
    parseBearerToken,
    verifyPassword,
    verifyToken,
} from './src/auth.mjs';
import { attachRealtimeGateway } from './src/realtime.mjs';
import { createLobbyChatService } from './src/chat.mjs';
import { buildAdminContentPage } from './src/adminContentPage.mjs';

const json = (res, statusCode, payload) => {
    const body = JSON.stringify(payload);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
};

const setCors = (req, res) => {
    const origin = req.headers.origin;
    const allowAll = config.corsOrigins.includes('*');
    const allowedByList = !!origin && config.corsOrigins.includes(origin);
    const allowed = allowAll || !origin || allowedByList;
    if (allowed) {
        const allowOrigin = allowAll ? '*' : (allowedByList ? origin : config.corsOrigins[0]);
        res.setHeader('Access-Control-Allow-Origin', allowOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    return allowed;
};

const parseBody = async (req, options = {}) => {
    const chunks = [];
    let size = 0;
    const maxSize = Math.max(1024, Number(options.maxSizeBytes) || (1024 * 1024));

    for await (const chunk of req) {
        size += chunk.length;
        if (size > maxSize) throw new Error('Body too large');
        chunks.push(chunk);
    }

    if (!chunks.length) return {};
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
};

const safeQty = (value, fallback = 1) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(20, Math.floor(parsed)));
};

const toInt = (value, fallback = 0, min = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.floor(parsed));
};

const toWeaponKillMap = (value) => {
    if (!value || typeof value !== 'object') return {};
    const output = {};
    Object.keys(value).forEach((weaponId) => {
        const key = `${weaponId || ''}`.trim().toLowerCase();
        if (!key) return;
        output[key] = toInt(value[weaponId], 0, 0);
    });
    return output;
};

const html = (res, statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
};

const sanitizeAssetName = (value, fallback = 'asset') => `${value || fallback}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || fallback;

const decodeBase64Payload = (value) => {
    const raw = `${value || ''}`.trim();
    if (!raw) return null;
    const body = raw.includes(',') ? raw.split(',').pop() : raw;
    try {
        return Buffer.from(body, 'base64');
    } catch {
        return null;
    }
};

const createAssetFolderMap = () => ({
    'weapon-icon': {
        folder: path.resolve(config.publicDir, 'content/weapons/icons'),
        publicBase: '/content/weapons/icons',
        extensions: new Set(['.png', '.jpg', '.jpeg', '.webp']),
    },
    'weapon-model': {
        folder: path.resolve(config.publicDir, 'content/weapons/models'),
        publicBase: '/content/weapons/models',
        extensions: new Set(['.glb', '.gltf', '.fbx', '.obj']),
    },
    'player-icon': {
        folder: path.resolve(config.publicDir, 'content/players/icons'),
        publicBase: '/content/players/icons',
        extensions: new Set(['.png', '.jpg', '.jpeg', '.webp']),
    },
    'player-model': {
        folder: path.resolve(config.publicDir, 'content/players/models'),
        publicBase: '/content/players/models',
        extensions: new Set(['.glb', '.gltf', '.fbx', '.obj']),
    },
    'player-animation': {
        folder: path.resolve(config.publicDir, 'content/players/animations'),
        publicBase: '/content/players/animations',
        extensions: new Set(['.glb', '.gltf', '.fbx']),
    },
});

const issueUserToken = (user) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: user.id,
        usr: user.username,
        ver: Number(user.tokenVersion || 1),
        iat: now,
        exp: now + config.tokenTtlSeconds,
    };
    return issueToken(payload, config.authSecret);
};

const createServer = async () => {
    const db = await new JsonDb(config.dataFile).init();
    const chatService = await createLobbyChatService({
        db,
        profanityFile: config.profanityFile,
        historyLimit: config.chatHistoryLimit,
    });
    const presenceByUserId = new Map();

    const touchPresence = (userId) => {
        const safeUserId = `${userId || ''}`.trim();
        if (!safeUserId) return null;
        const nowIso = new Date().toISOString();
        presenceByUserId.set(safeUserId, nowIso);
        return nowIso;
    };

    const resolvePresence = (userId) => {
        const safeUserId = `${userId || ''}`.trim();
        if (!safeUserId) return { online: false, lastSeenAt: null };
        const lastSeenAt = presenceByUserId.get(safeUserId) || null;
        if (!lastSeenAt) return { online: false, lastSeenAt: null };
        const ageMs = Date.now() - (Number(new Date(lastSeenAt).getTime()) || 0);
        return {
            online: ageMs >= 0 && ageMs <= 3 * 60 * 1000,
            lastSeenAt,
        };
    };

    const toClientUser = (user, data = db.read()) => toPublicUser(
        user,
        data.liveops,
        new Date(),
        data.premier,
        buildFriendsSnapshot({
            user,
            users: data.users,
            presenceResolver: resolvePresence,
        }),
    );

    const toSocialPayload = (user, data = db.read()) => buildSocialSnapshot({
        user,
        users: data.users,
        socialStore: data.social,
        liveops: data.liveops,
        presenceResolver: resolvePresence,
    });

    const requireAuth = (req, res) => {
        const token = parseBearerToken(req.headers.authorization);
        const payload = verifyToken(token, config.authSecret);
        if (!payload || !payload.sub || !payload.exp) {
            json(res, 401, { error: 'Unauthorized' });
            return null;
        }
        if (payload.exp <= Math.floor(Date.now() / 1000)) {
            json(res, 401, { error: 'Token expired' });
            return null;
        }

        const data = db.read();
        const user = data.users.find((item) => item.id === payload.sub);
        if (!user) {
            json(res, 401, { error: 'Unauthorized' });
            return null;
        }
        if (Number(user.tokenVersion || 1) !== Number(payload.ver || 0)) {
            json(res, 401, { error: 'Session revoked' });
            return null;
        }
        touchPresence(user.id);
        return user;
    };

    const optionalAuth = (req) => {
        const token = parseBearerToken(req.headers.authorization);
        const payload = verifyToken(token, config.authSecret);
        if (!payload || !payload.sub || !payload.exp) return null;
        if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

        const data = db.read();
        const user = data.users.find((item) => item.id === payload.sub);
        if (!user) return null;
        if (Number(user.tokenVersion || 1) !== Number(payload.ver || 0)) return null;
        touchPresence(user.id);
        return user;
    };

    const requireAdmin = (req, res) => {
        if (!config.adminApiKey) {
            json(res, 503, { error: 'Admin API is disabled. Set ADMIN_API_KEY to enable.' });
            return false;
        }

        const headerKey = `${req.headers['x-admin-key'] || ''}`;
        if (!headerKey || headerKey !== config.adminApiKey) {
            json(res, 401, { error: 'Invalid admin key.' });
            return false;
        }

        return true;
    };

    const server = http.createServer(async (req, res) => {
        const allowCors = setCors(req, res);
        if (!allowCors) return json(res, 403, { error: 'Origin not allowed' });
        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            return res.end();
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        const method = req.method || 'GET';

        try {
            if (method === 'GET' && pathname === '/admin/content') {
                return html(res, 200, buildAdminContentPage());
            }

            if (method === 'GET' && pathname === '/api/health') {
                const chatMeta = chatService.meta();
                return json(res, 200, {
                    ok: true,
                    service: 'cube-strike-backend',
                    time: new Date().toISOString(),
                    multiplayerReady: true,
                    chat: {
                        enabled: true,
                        profanitySource: chatMeta.profanitySource,
                        profanityEntries: chatMeta.profanityEntries,
                    },
                });
            }

            if (method === 'POST' && pathname === '/api/auth/register') {
                const body = await parseBody(req);
                const username = typeof body.username === 'string' ? body.username.trim() : '';
                const password = typeof body.password === 'string' ? body.password : '';

                if (!isValidUsername(username)) {
                    return json(res, 400, { error: 'Username must be 3-20 chars and use letters/numbers/_ only.' });
                }
                if (!isStrongPassword(password)) {
                    return json(res, 400, { error: 'Password must be 8+ chars and include upper/lower/numeric.' });
                }

                const data = db.read();
                const usernameLower = username.toLowerCase();
                const existing = data.users.find((item) => item.usernameLower === usernameLower);
                if (existing) return json(res, 409, { error: 'Username already exists.' });

                const { hash, salt } = await hashPassword(password);
                const starterWallet = toInt(data.liveops?.economy?.starterWallet, 1200, 0);
                const defaultLoadout = getDefaultLoadout(data.liveops);
                const user = createNewUser({
                    id: crypto.randomUUID(),
                    username,
                    passwordHash: hash,
                    passwordSalt: salt,
                    starterWallet,
                    defaultLoadout,
                });
                user.usernameLower = usernameLower;

                await db.mutate((mutable) => {
                    mutable.users.push(user);
                });

                const token = issueUserToken(user);
                touchPresence(user.id);
                return json(res, 201, { token, user: toClientUser(user, db.read()) });
            }

            if (method === 'POST' && pathname === '/api/auth/login') {
                const body = await parseBody(req);
                const username = typeof body.username === 'string' ? body.username.trim() : '';
                const password = typeof body.password === 'string' ? body.password : '';
                const usernameLower = username.toLowerCase();

                const data = db.read();
                const user = data.users.find((item) => item.usernameLower === usernameLower);
                if (!user) return json(res, 401, { error: 'Invalid credentials.' });

                const validPassword = await verifyPassword(password, user.passwordSalt, user.passwordHash);
                if (!validPassword) return json(res, 401, { error: 'Invalid credentials.' });

                const token = issueUserToken(user);
                touchPresence(user.id);
                return json(res, 200, { token, user: toClientUser(user, data) });
            }

            if (method === 'GET' && pathname === '/api/auth/me') {
                const user = requireAuth(req, res);
                if (!user) return;
                const data = db.read();
                return json(res, 200, { user: toClientUser(user, data) });
            }

            if (method === 'GET' && pathname === '/api/profile') {
                const user = requireAuth(req, res);
                if (!user) return;
                const data = db.read();
                return json(res, 200, {
                    profile: toClientUser(user, data),
                    currency: data.liveops?.currency || 'coin',
                });
            }

            if (method === 'GET' && pathname === '/api/friends') {
                const user = requireAuth(req, res);
                if (!user) return;
                const data = db.read();
                return json(res, 200, {
                    friends: buildFriendsSnapshot({
                        user,
                        users: data.users,
                        presenceResolver: resolvePresence,
                    }),
                    serverTime: new Date().toISOString(),
                });
            }

            if (method === 'GET' && pathname === '/api/friends/search') {
                const user = requireAuth(req, res);
                if (!user) return;
                const query = `${url.searchParams.get('q') || ''}`.trim();
                const limit = Math.max(1, Math.min(25, Number(url.searchParams.get('limit') || 8) || 8));
                const data = db.read();
                return json(res, 200, {
                    results: searchFriendCandidates({
                        user,
                        users: data.users,
                        query,
                        limit,
                        presenceResolver: resolvePresence,
                    }),
                    query,
                    serverTime: new Date().toISOString(),
                });
            }

            if (method === 'POST' && pathname === '/api/friends/request') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const requestedUserId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                const requestedUsername = typeof body.username === 'string' ? `${body.username}`.trim().toLowerCase() : '';
                const data = db.read();
                const target = data.users.find((item) => item.id === requestedUserId)
                    || data.users.find((item) => item.usernameLower === requestedUsername);
                if (!target) return json(res, 404, { error: 'User not found.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const other = mutable.users.find((item) => item.id === target.id);
                    if (!actor || !other) return;
                    result = sendFriendRequest({ fromUser: actor, toUser: other });
                });

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                if (!result?.ok) {
                    const message = result?.reason === 'cannot-add-self'
                        ? 'You cannot add yourself.'
                        : 'Friend request failed.';
                    return json(res, 400, { error: message });
                }
                return json(res, 200, {
                    ok: true,
                    status: result.status,
                    reason: result.reason,
                    friends: buildFriendsSnapshot({
                        user: actor,
                        users: fresh.users,
                        presenceResolver: resolvePresence,
                    }),
                });
            }

            if (method === 'POST' && pathname === '/api/friends/accept') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const requesterId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                if (!requesterId) return json(res, 400, { error: 'userId is required.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const requester = mutable.users.find((item) => item.id === requesterId);
                    if (!actor || !requester) return;
                    result = acceptFriendRequest({ user: actor, requester });
                });

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                if (!result?.ok) return json(res, 404, { error: 'Friend request not found.' });
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    friends: buildFriendsSnapshot({
                        user: actor,
                        users: fresh.users,
                        presenceResolver: resolvePresence,
                    }),
                });
            }

            if (method === 'POST' && pathname === '/api/friends/decline') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const requesterId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                if (!requesterId) return json(res, 400, { error: 'userId is required.' });

                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const requester = mutable.users.find((item) => item.id === requesterId);
                    if (!actor || !requester) return;
                    declineFriendRequest({ user: actor, requester });
                });

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: 'declined',
                    friends: buildFriendsSnapshot({
                        user: actor,
                        users: fresh.users,
                        presenceResolver: resolvePresence,
                    }),
                });
            }

            if (method === 'POST' && pathname === '/api/friends/cancel') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const targetId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                if (!targetId) return json(res, 400, { error: 'userId is required.' });

                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const target = mutable.users.find((item) => item.id === targetId);
                    if (!actor || !target) return;
                    cancelFriendRequest({ user: actor, target });
                });

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: 'cancelled',
                    friends: buildFriendsSnapshot({
                        user: actor,
                        users: fresh.users,
                        presenceResolver: resolvePresence,
                    }),
                });
            }

            if (method === 'POST' && pathname === '/api/friends/remove') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const targetId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                if (!targetId) return json(res, 400, { error: 'userId is required.' });

                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const target = mutable.users.find((item) => item.id === targetId);
                    if (!actor || !target) return;
                    removeFriend({ user: actor, target });
                });

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: 'removed',
                    friends: buildFriendsSnapshot({
                        user: actor,
                        users: fresh.users,
                        presenceResolver: resolvePresence,
                    }),
                });
            }

            if (method === 'GET' && pathname === '/api/social') {
                const user = requireAuth(req, res);
                if (!user) return;
                const data = db.read();
                return json(res, 200, {
                    social: toSocialPayload(user, data),
                    serverTime: new Date().toISOString(),
                });
            }

            if (method === 'GET' && pathname === '/api/social/squad/public') {
                const data = db.read();
                return json(res, 200, {
                    rooms: listPublicSquadRooms({
                        socialStore: data.social,
                        users: data.users,
                        presenceResolver: resolvePresence,
                        viewerUserId: '',
                    }),
                    serverTime: new Date().toISOString(),
                });
            }

            if (method === 'POST' && pathname === '/api/social/squad/invite') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const targetId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                if (!targetId) return json(res, 400, { error: 'userId is required.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const target = mutable.users.find((item) => item.id === targetId);
                    if (!actor || !target) {
                        result = { ok: false, reason: 'user-not-found' };
                        return;
                    }
                    result = sendSquadInvite({
                        socialStore: mutable.social,
                        fromUser: actor,
                        toUser: target,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: actor.id,
                            type: 'social_room_invite',
                            targetUserId: target.id,
                            roomId: result.roomId || null,
                            inviteId: result.inviteId || null,
                            reason: result.reason,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) {
                    const error = result?.reason === 'friends-only'
                        ? 'Only friends can receive squad invites.'
                        : result?.reason === 'room-full'
                            ? 'Your squad room is full.'
                            : result?.reason === 'cannot-invite-self'
                                ? 'You cannot invite yourself.'
                                : 'Squad invite failed.';
                    return json(res, 400, { error });
                }

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'POST' && pathname === '/api/social/squad/create') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const visibility = typeof body.visibility === 'string' ? `${body.visibility}`.trim().toLowerCase() : 'private';
                const forceNew = !!body.forceNew;

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    if (!actor) {
                        result = { ok: false, reason: 'user-not-found' };
                        return;
                    }
                    const label = typeof body.label === 'string' ? `${body.label}`.trim() : '';
                    const capacity = Number(body.capacity);
                    const game = body && typeof body.game === 'object'
                        ? {
                            mode: typeof body.game.mode === 'string' ? `${body.game.mode}`.trim().toLowerCase() : 'ffa',
                            durationSeconds: Number(body.game.durationSeconds),
                            fillBots: body.game.fillBots !== false,
                        }
                        : null;
                    result = createSquadRoom({
                        socialStore: mutable.social,
                        user: actor,
                        visibility,
                        label,
                        capacity,
                        game,
                        forceNew,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: actor.id,
                            type: 'social_room_create',
                            roomId: result.roomId || null,
                            partyId: result.partyId || null,
                            visibility: result.visibility || visibility,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) return json(res, 400, { error: 'Room creation failed.' });
                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'POST' && pathname === '/api/social/squad/visibility') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const visibility = typeof body.visibility === 'string' ? `${body.visibility}`.trim().toLowerCase() : 'private';

                let result = null;
                await db.mutate((mutable) => {
                    result = setSquadRoomVisibility({
                        socialStore: mutable.social,
                        userId: user.id,
                        visibility,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: user.id,
                            type: 'social_room_visibility',
                            roomId: result.roomId || null,
                            partyId: result.partyId || null,
                            visibility: result.visibility || visibility,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) {
                    const error = result?.reason === 'host-only'
                        ? 'Only the room host can change visibility.'
                        : 'Room visibility update failed.';
                    return json(res, 400, { error });
                }

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'POST' && pathname === '/api/social/squad/join') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const partyId = typeof body.partyId === 'string' ? `${body.partyId}`.trim().toUpperCase() : '';
                if (!partyId) return json(res, 400, { error: 'partyId is required.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    if (!actor) {
                        result = { ok: false, reason: 'user-not-found' };
                        return;
                    }
                    result = joinSquadRoomByPartyId({
                        socialStore: mutable.social,
                        user: actor,
                        partyId,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: actor.id,
                            type: 'social_room_join',
                            roomId: result.roomId || null,
                            partyId,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) {
                    const error = result?.reason === 'party-not-found'
                        ? 'Party ID not found.'
                        : result?.reason === 'room-full'
                            ? 'This party is full.'
                            : 'Party join failed.';
                    return json(res, 400, { error });
                }

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'POST' && pathname === '/api/social/squad/respond') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const inviteId = typeof body.inviteId === 'string' ? `${body.inviteId}`.trim() : '';
                const action = typeof body.action === 'string' ? `${body.action}`.trim().toLowerCase() : '';
                if (!inviteId || !action) return json(res, 400, { error: 'inviteId and action are required.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    if (!actor) {
                        result = { ok: false, reason: 'user-not-found' };
                        return;
                    }
                    result = respondSquadInvite({
                        socialStore: mutable.social,
                        inviteId,
                        actorUser: actor,
                        action,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: actor.id,
                            type: 'social_room_invite_response',
                            inviteId,
                            roomId: result.roomId || null,
                            action,
                            reason: result.reason,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) {
                    const error = result?.reason === 'room-full'
                        ? 'This squad room is already full.'
                        : result?.reason === 'room-expired'
                            ? 'This squad room is no longer available.'
                            : 'Squad response failed.';
                    return json(res, 400, { error });
                }

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'POST' && pathname === '/api/social/squad/leave') {
                const user = requireAuth(req, res);
                if (!user) return;
                let result = null;
                await db.mutate((mutable) => {
                    result = leaveSquadRoom({
                        socialStore: mutable.social,
                        userId: user.id,
                        now: new Date(),
                    });
                    mutable.transactions.push({
                        id: crypto.randomUUID(),
                        userId: user.id,
                        type: 'social_room_leave',
                        reason: result?.reason || 'left-room',
                        createdAt: new Date().toISOString(),
                    });
                });
                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result?.reason || 'left-room',
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'POST' && pathname === '/api/social/gifts/send') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const targetId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                const giftKey = typeof body.giftKey === 'string' ? `${body.giftKey}`.trim().toLowerCase() : '';
                const note = typeof body.note === 'string' ? body.note : '';
                if (!targetId || !giftKey) return json(res, 400, { error: 'userId and giftKey are required.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const target = mutable.users.find((item) => item.id === targetId);
                    if (!actor || !target) {
                        result = { ok: false, reason: 'user-not-found' };
                        return;
                    }
                    result = sendFriendGift({
                        socialStore: mutable.social,
                        fromUser: actor,
                        toUser: target,
                        giftKey,
                        note,
                        liveops: mutable.liveops,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: actor.id,
                            type: 'social_gift_send',
                            targetUserId: target.id,
                            giftId: result.gift?.id || null,
                            giftKey,
                            amount: result.charged || 0,
                            currency: mutable.liveops?.currency || 'coin',
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) {
                    const error = result?.reason === 'friends-only'
                        ? 'Only friends can receive gifts.'
                        : result?.reason === 'insufficient-wallet'
                            ? 'Insufficient wallet for this gift.'
                            : result?.reason === 'cannot-gift-self'
                                ? 'You cannot gift yourself.'
                                : 'Gift send failed.';
                    return json(res, 400, { error });
                }

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    wallet: actor?.wallet || 0,
                    inventory: actor?.inventory || null,
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'POST' && pathname === '/api/social/gifts/claim') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const giftId = typeof body.giftId === 'string' ? `${body.giftId}`.trim() : '';
                if (!giftId) return json(res, 400, { error: 'giftId is required.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    if (!actor) {
                        result = { ok: false, reason: 'user-not-found' };
                        return;
                    }
                    result = claimFriendGift({
                        socialStore: mutable.social,
                        user: actor,
                        giftId,
                        liveops: mutable.liveops,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: actor.id,
                            type: 'social_gift_claim',
                            giftId,
                            rewardType: result.gift?.type || null,
                            rewardAmount: result.gift?.amount || 0,
                            caseId: result.gift?.caseId || null,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) {
                    return json(res, 400, { error: 'Gift claim failed.' });
                }

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    wallet: actor?.wallet || 0,
                    inventory: actor?.inventory || null,
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'GET' && pathname === '/api/social/messages') {
                const user = requireAuth(req, res);
                if (!user) return;
                const otherUserId = `${url.searchParams.get('userId') || ''}`.trim();
                if (!otherUserId) return json(res, 400, { error: 'userId is required.' });

                await db.mutate((mutable) => {
                    markDirectThreadRead({
                        socialStore: mutable.social,
                        userId: user.id,
                        otherUserId,
                        now: new Date(),
                    });
                });

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ...buildDirectThread({
                        user: actor,
                        otherUserId,
                        users: fresh.users,
                        socialStore: fresh.social,
                        presenceResolver: resolvePresence,
                    }),
                    social: toSocialPayload(actor, fresh),
                    serverTime: new Date().toISOString(),
                });
            }

            if (method === 'POST' && pathname === '/api/social/messages') {
                const user = requireAuth(req, res);
                if (!user) return;
                const body = await parseBody(req);
                const otherUserId = typeof body.userId === 'string' ? `${body.userId}`.trim() : '';
                const text = typeof body.text === 'string' ? body.text : '';
                if (!otherUserId) return json(res, 400, { error: 'userId is required.' });

                let result = null;
                await db.mutate((mutable) => {
                    const actor = mutable.users.find((item) => item.id === user.id);
                    const other = mutable.users.find((item) => item.id === otherUserId);
                    if (!actor || !other) {
                        result = { ok: false, reason: 'user-not-found' };
                        return;
                    }
                    result = sendDirectMessage({
                        socialStore: mutable.social,
                        fromUser: actor,
                        toUser: other,
                        text,
                        now: new Date(),
                    });
                    if (result?.ok) {
                        mutable.transactions.push({
                            id: crypto.randomUUID(),
                            userId: actor.id,
                            type: 'social_dm_send',
                            targetUserId: other.id,
                            messageId: result.message?.id || null,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });

                if (!result?.ok) {
                    const error = result?.reason === 'friends-only'
                        ? 'Only friends can exchange private messages.'
                        : result?.reason === 'cannot-message-self'
                            ? 'You cannot message yourself.'
                            : result?.reason === 'empty-message'
                                ? 'Message cannot be empty.'
                                : 'Message send failed.';
                    return json(res, 400, { error });
                }

                const fresh = db.read();
                const actor = fresh.users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    reason: result.reason,
                    ...buildDirectThread({
                        user: actor,
                        otherUserId,
                        users: fresh.users,
                        socialStore: fresh.social,
                        presenceResolver: resolvePresence,
                    }),
                    social: toSocialPayload(actor, fresh),
                });
            }

            if (method === 'GET' && pathname === '/api/progression') {
                const user = requireAuth(req, res);
                if (!user) return;
                const data = db.read();
                const now = new Date();
                return json(res, 200, {
                    progression: buildProgressionSnapshot({ user, liveops: data.liveops, now }),
                    currency: data.liveops?.currency || 'coin',
                    serverTime: now.toISOString(),
                });
            }

            if (method === 'POST' && pathname === '/api/progression/equip') {
                const user = requireAuth(req, res);
                if (!user) return;

                const body = await parseBody(req);
                const type = typeof body.type === 'string' ? `${body.type}` : '';
                const value = typeof body.value === 'string' ? `${body.value}` : '';
                if (!type || !value) {
                    return json(res, 400, { error: 'type and value are required.' });
                }

                let applied = false;
                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;
                    applied = equipProgressionCosmetic(target, type, value, mutable.liveops);
                });

                if (!applied) {
                    return json(res, 400, { error: 'Cosmetic is not unlocked or invalid.' });
                }

                const freshData = db.read();
                const freshUser = freshData.users.find((item) => item.id === user.id);
                const now = new Date();
                return json(res, 200, {
                    ok: true,
                    progression: buildProgressionSnapshot({ user: freshUser, liveops: freshData.liveops, now }),
                    currency: freshData.liveops?.currency || 'coin',
                });
            }

            if (method === 'POST' && pathname === '/api/rewards/weekly-login/claim') {
                const user = requireAuth(req, res);
                if (!user) return;

                let claimResult = null;
                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;
                    claimResult = claimWeeklyLoginReward({
                        user: target,
                        liveops: mutable.liveops,
                        now: new Date(),
                    });
                });

                const freshData = db.read();
                const freshUser = freshData.users.find((item) => item.id === user.id);
                const snapshot = claimResult?.snapshot
                    || buildProgressionSnapshot({ user: freshUser, liveops: freshData.liveops, now: new Date() });

                if (!claimResult?.ok) {
                    return json(res, 409, {
                        ok: false,
                        reason: claimResult?.reason || 'claim-failed',
                        rewardCoin: 0,
                        claimedDay: claimResult?.claimedDay || null,
                        wallet: freshUser?.wallet || 0,
                        progression: snapshot,
                        currency: freshData.liveops?.currency || 'coin',
                    });
                }

                return json(res, 200, {
                    ok: true,
                    reason: claimResult.reason,
                    rewardCoin: claimResult.rewardCoin,
                    claimedDay: claimResult.claimedDay,
                    wallet: freshUser.wallet,
                    progression: snapshot,
                    currency: freshData.liveops?.currency || 'coin',
                });
            }

            if (method === 'GET' && pathname === '/api/shop/offers') {
                const data = db.read();
                const offers = getShopOffers(data.liveops);
                const cases = getCasesArray(data.liveops);
                return json(res, 200, {
                    offers,
                    cases,
                    currency: data.liveops?.currency || 'coin',
                    revision: Number(data.liveops?.revision) || 1,
                });
            }

            if (method === 'GET' && pathname === '/api/loadout/catalog') {
                const data = db.read();
                return json(res, 200, {
                    weapons: getWeaponsCatalog(data.liveops),
                    defaultLoadout: getDefaultLoadout(data.liveops),
                    revision: Number(data.liveops?.revision) || 1,
                    currency: data.liveops?.currency || 'coin',
                });
            }

            if (method === 'POST' && pathname === '/api/loadout/equip') {
                const user = requireAuth(req, res);
                if (!user) return;

                const data = db.read();
                const weapons = getWeaponsCatalog(data.liveops);
                const byId = new Map(weapons.map((item) => [item.weaponId, item]));
                const validSlots = new Set(['primary', 'secondary', 'knife']);
                const body = await parseBody(req);
                const slot = typeof body.slot === 'string' ? `${body.slot}`.trim().toLowerCase() : '';
                const weaponId = typeof body.weaponId === 'string' ? `${body.weaponId}`.trim().toLowerCase() : '';

                if (!validSlots.has(slot)) return json(res, 400, { error: 'Invalid loadout slot.' });
                const selected = byId.get(weaponId);
                if (!selected) return json(res, 404, { error: 'Weapon not found.' });
                if (`${selected.slot}`.toLowerCase() !== slot) {
                    return json(res, 400, { error: 'Weapon cannot be equipped in this slot.' });
                }

                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;
                    target.loadout = normalizeLoadout({
                        ...(target.loadout || {}),
                        [slot]: weaponId,
                    }, mutable.liveops);
                });

                const freshUser = db.read().users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    loadout: freshUser.loadout,
                });
            }

            if (method === 'POST' && pathname === '/api/shop/purchase') {
                const user = requireAuth(req, res);
                if (!user) return;

                const data = db.read();
                const offers = getShopOffers(data.liveops);

                const body = await parseBody(req);
                const offerId = typeof body.offerId === 'string' ? body.offerId : '';
                const qty = safeQty(body.qty, 1);
                const autoOpenCase = !!body.autoOpenCase || !!body.autoOpen;
                const offer = offers.find((item) => item.id === offerId);
                if (!offer) return json(res, 404, { error: 'Offer not found.' });

                const priceCoin = toInt(offer.priceCoin ?? offer.price, 0, 0);
                const totalPrice = priceCoin * qty;
                if (user.wallet < totalPrice) return json(res, 400, { error: 'Insufficient wallet.' });

                const granted = [];
                let caseOpenResult = null;
                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;
                    if (target.wallet < totalPrice) return;

                    target.wallet -= totalPrice;
                    if (offer.type === 'case') {
                        const caseId = offer.caseId;
                        const canAutoOpen = autoOpenCase && qty === 1 && !!caseId;
                        if (canAutoOpen) {
                            const caseDef = getCaseById(mutable.liveops, caseId);
                            const picked = caseDef ? pickWeightedDrop(caseDef.drops || []) : null;
                            if (caseDef && picked) {
                                target.inventory.skins.push(picked.skin);
                                target.inventory.skinMeta[picked.skin] = {
                                    weaponId: `${picked.weaponId || ''}`,
                                    slot: `${picked.slot || 'primary'}`,
                                    rarity: `${picked.rarity || 'milspec'}`,
                                };
                                const spin = buildSpinTrack(caseDef.drops || [], picked);
                                caseOpenResult = {
                                    caseId,
                                    skin: {
                                        name: picked.skin,
                                        rarity: picked.rarity || 'milspec',
                                        slot: picked.slot || 'primary',
                                        weaponId: picked.weaponId || '',
                                    },
                                    rarity: picked.rarity || 'milspec',
                                    spinTrack: spin.spinTrack,
                                    stopIndex: spin.stopIndex,
                                    durationMs: spin.durationMs,
                                };
                                granted.push({ type: 'case', caseId, qty: 1 });
                                granted.push({ type: 'skin', skin: picked.skin, rarity: picked.rarity || 'milspec' });
                            } else {
                                target.inventory.cases[caseId] = (target.inventory.cases[caseId] || 0) + qty;
                                granted.push({ type: 'case', caseId, qty });
                            }
                        } else {
                            target.inventory.cases[caseId] = (target.inventory.cases[caseId] || 0) + qty;
                            granted.push({ type: 'case', caseId, qty });
                        }
                    } else if (offer.type === 'skin') {
                        const meta = findSkinMeta(mutable.liveops, offer.skin) || {
                            skin: offer.skin,
                            slot: offer.slot || 'primary',
                            rarity: offer.rarity || 'milspec',
                            weaponId: offer.weaponId || '',
                        };
                        for (let i = 0; i < qty; i++) {
                            target.inventory.skins.push(offer.skin);
                        }
                        target.inventory.skinMeta[offer.skin] = {
                            weaponId: `${meta.weaponId || ''}`,
                            slot: `${meta.slot || 'primary'}`,
                            rarity: `${meta.rarity || 'milspec'}`,
                        };
                        granted.push({ type: 'skin', skin: offer.skin, qty });
                    } else if (offer.type === 'bundle') {
                        const dropSize = toInt(offer.bundleSize, 3, 1);
                        const fallbackCase = getCasesArray(mutable.liveops)[0];
                        for (let i = 0; i < qty * dropSize; i++) {
                            const drop = pickWeightedDrop((fallbackCase && fallbackCase.drops) || []);
                            if (!drop) continue;
                            target.inventory.skins.push(drop.skin);
                            target.inventory.skinMeta[drop.skin] = {
                                weaponId: `${drop.weaponId || ''}`,
                                slot: `${drop.slot || 'primary'}`,
                                rarity: `${drop.rarity || 'milspec'}`,
                            };
                            granted.push({ type: 'skin', skin: drop.skin, rarity: drop.rarity || 'milspec' });
                        }
                    }

                    mutable.transactions.push({
                        id: crypto.randomUUID(),
                        userId: target.id,
                        type: 'purchase',
                        offerId: offer.id,
                        qty,
                        amount: totalPrice,
                        currency: mutable.liveops?.currency || 'coin',
                        granted,
                        liveopsRevision: Number(mutable.liveops?.revision) || 1,
                        createdAt: new Date().toISOString(),
                    });
                });

                const freshUser = db.read().users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    granted,
                    wallet: freshUser.wallet,
                    inventory: freshUser.inventory,
                    caseOpen: caseOpenResult,
                    currency: db.read().liveops?.currency || 'coin',
                });
            }

            if (method === 'GET' && pathname === '/api/inventory') {
                const user = requireAuth(req, res);
                if (!user) return;
                const data = db.read();
                return json(res, 200, {
                    wallet: user.wallet,
                    inventory: user.inventory,
                    currency: data.liveops?.currency || 'coin',
                });
            }

            if (method === 'GET' && pathname === '/api/cases/catalog') {
                const data = db.read();
                return json(res, 200, buildCasesCatalogResponse(data.liveops));
            }

            if (method === 'POST' && pathname === '/api/cases/open') {
                const user = requireAuth(req, res);
                if (!user) return;

                const body = await parseBody(req);
                const caseId = typeof body.caseId === 'string' && body.caseId ? body.caseId : 'falcon_case';

                const data = db.read();
                const caseDef = getCaseById(data.liveops, caseId);
                if (!caseDef) return json(res, 404, { error: 'Case not found.' });

                const openPriceCoin = toInt(caseDef.openPriceCoin, 180, 1);
                if (user.wallet < openPriceCoin) return json(res, 400, { error: 'Insufficient wallet.' });

                let dropped = null;
                let spinPayload = null;
                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;
                    const mutableCase = getCaseById(mutable.liveops, caseId);
                    if (!mutableCase) return;
                    const price = toInt(mutableCase.openPriceCoin, 180, 1);
                    if (target.wallet < price) return;

                    const picked = pickWeightedDrop(mutableCase.drops || []);
                    if (!picked) return;

                    target.wallet -= price;
                    target.inventory.skins.push(picked.skin);
                    target.inventory.skinMeta[picked.skin] = {
                        weaponId: `${picked.weaponId || ''}`,
                        slot: `${picked.slot || 'primary'}`,
                        rarity: `${picked.rarity || 'milspec'}`,
                    };
                    dropped = picked;
                    spinPayload = buildSpinTrack(mutableCase.drops || [], picked);

                    mutable.transactions.push({
                        id: crypto.randomUUID(),
                        userId: target.id,
                        type: 'open_case_coin',
                        caseId,
                        amount: price,
                        currency: mutable.liveops?.currency || 'coin',
                        droppedSkin: picked.skin,
                        droppedRarity: picked.rarity || 'milspec',
                        liveopsRevision: Number(mutable.liveops?.revision) || 1,
                        createdAt: new Date().toISOString(),
                    });
                });

                if (!dropped || !spinPayload) return json(res, 400, { error: 'Case opening failed.' });
                const freshUser = db.read().users.find((item) => item.id === user.id);

                return json(res, 200, {
                    ok: true,
                    wallet: freshUser.wallet,
                    skin: {
                        name: dropped.skin,
                        rarity: dropped.rarity || 'milspec',
                        slot: dropped.slot || 'primary',
                        weaponId: dropped.weaponId || '',
                    },
                    skinName: dropped.skin,
                    rarity: dropped.rarity || 'milspec',
                    inventory: freshUser.inventory,
                    spinTrack: spinPayload.spinTrack,
                    stopIndex: spinPayload.stopIndex,
                    durationMs: spinPayload.durationMs,
                    currency: db.read().liveops?.currency || 'coin',
                });
            }

            if (method === 'POST' && pathname === '/api/inventory/open-case') {
                const user = requireAuth(req, res);
                if (!user) return;

                const body = await parseBody(req);
                const caseId = typeof body.caseId === 'string' && body.caseId ? body.caseId : 'falcon_case';
                const data = db.read();
                const caseDef = getCaseById(data.liveops, caseId);
                if (!caseDef) return json(res, 404, { error: 'Case not found.' });

                let dropped = null;
                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;
                    const count = Number(target.inventory.cases[caseId] || 0);
                    if (count <= 0) return;
                    target.inventory.cases[caseId] = count - 1;
                    const picked = pickWeightedDrop(caseDef.drops || []);
                    if (!picked) return;

                    dropped = picked;
                    target.inventory.skins.push(picked.skin);
                    target.inventory.skinMeta[picked.skin] = {
                        weaponId: `${picked.weaponId || ''}`,
                        slot: `${picked.slot || 'primary'}`,
                        rarity: `${picked.rarity || 'milspec'}`,
                    };
                    mutable.transactions.push({
                        id: crypto.randomUUID(),
                        userId: target.id,
                        type: 'open_case',
                        caseId,
                        droppedSkin: picked.skin,
                        droppedRarity: picked.rarity || 'milspec',
                        createdAt: new Date().toISOString(),
                    });
                });

                if (!dropped) return json(res, 400, { error: 'No case available to open.' });
                const freshUser = db.read().users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    skin: dropped.skin,
                    skinItem: {
                        name: dropped.skin,
                        rarity: dropped.rarity || 'milspec',
                        slot: dropped.slot || 'primary',
                        weaponId: dropped.weaponId || '',
                    },
                    skinName: dropped.skin,
                    rarity: dropped.rarity || 'milspec',
                    inventory: freshUser.inventory,
                    currency: db.read().liveops?.currency || 'coin',
                });
            }

            if (method === 'POST' && pathname === '/api/inventory/equip') {
                const user = requireAuth(req, res);
                if (!user) return;

                const body = await parseBody(req);
                const slot = typeof body.slot === 'string' ? body.slot : '';
                const skin = typeof body.skin === 'string' ? body.skin : '';
                const validSlots = new Set(['character', 'rifle', 'pistol', 'knife']);
                if (!validSlots.has(slot)) return json(res, 400, { error: 'Invalid slot.' });
                if (!skin || !user.inventory.skins.includes(skin)) {
                    return json(res, 400, { error: 'Skin not owned.' });
                }
                const meta = (user.inventory.skinMeta && user.inventory.skinMeta[skin])
                    ? user.inventory.skinMeta[skin]
                    : findSkinMeta(db.read().liveops, skin);
                if (meta) {
                    const equipSlotMap = {
                        character: 'character',
                        rifle: 'primary',
                        pistol: 'secondary',
                        knife: 'knife',
                    };
                    const expected = equipSlotMap[slot];
                    if (meta.slot && meta.slot !== expected && meta.slot !== slot) {
                        return json(res, 400, { error: 'Skin slot mismatch.' });
                    }
                }

                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;
                    target.inventory.equipped[slot] = skin;
                });

                const freshUser = db.read().users.find((item) => item.id === user.id);
                return json(res, 200, {
                    ok: true,
                    equipped: freshUser.inventory.equipped,
                });
            }

            if (method === 'GET' && pathname === '/api/leaderboard') {
                const period = url.searchParams.get('period') || 'all';
                const metric = url.searchParams.get('metric') || 'kills';
                const limit = Number(url.searchParams.get('limit') || 20);
                const data = db.read();
                const usersById = new Map(data.users.map((user) => [user.id, user]));
                const leaderboard = buildLeaderboard({ data, usersById, period, metric, limit, now: new Date() });
                leaderboard.rows = leaderboard.rows.map((row) => ({
                    ...row,
                    premier: row.premier ? toPremierPublic(row.premier) : null,
                }));
                return json(res, 200, leaderboard);
            }

            if (method === 'GET' && pathname === '/api/leaderboard/premier') {
                const viewer = optionalAuth(req);
                const data = db.read();
                const usersById = new Map(data.users.map((item) => [item.id, item]));
                const payload = buildPremierLeaderboard({
                    premierStore: data.premier,
                    usersById,
                    viewerUserId: viewer?.id || '',
                    now: new Date(),
                });
                return json(res, 200, payload);
            }

            if (method === 'GET' && pathname === '/api/chat/lobby') {
                const afterId = toInt(url.searchParams.get('afterId'), 0, 0);
                const limit = Math.min(200, toInt(url.searchParams.get('limit'), 50, 1));
                const payload = chatService.list({ afterId, limit });
                return json(res, 200, {
                    ...payload,
                    cursor: payload.nextCursor,
                });
            }

            if (method === 'POST' && pathname === '/api/chat/lobby') {
                const user = requireAuth(req, res);
                if (!user) return;

                const body = await parseBody(req);
                const text = typeof body.message === 'string' ? body.message : '';
                const displayName = typeof body.displayName === 'string' ? body.displayName : user.username;

                const result = await chatService.post({
                    user,
                    text,
                    displayName,
                });

                if (!result.ok) {
                    return json(res, result.status || 400, {
                        error: result.error || 'chat-send-failed',
                        reason: result.reason || 'unknown',
                        retryAfterMs: result.retryAfterMs || 0,
                        blockedPhrase: result.blockedPhrase || null,
                    });
                }

                return json(res, 200, {
                    ok: true,
                    message: result.message,
                    serverTime: result.serverTime,
                });
            }

            if (method === 'POST' && pathname === '/api/matches/ffa/report') {
                const user = requireAuth(req, res);
                if (!user) return;

                const body = await parseBody(req);
                const kills = toInt(body.kills, 0, 0);
                const deaths = toInt(body.deaths, 0, 0);
                const assists = toInt(body.assists, 0, 0);
                const headshots = toInt(body.headshots, 0, 0);
                const damage = toInt(body.damage, 0, 0);
                const score = toInt(body.score, (kills * 120) + (assists * 60) + Math.floor(damage * 0.35) - (deaths * 40), 0);
                const wins = toInt(body.wins, 0, 0);
                const maxKillStreak = toInt(body.maxKillStreak, 0, 0);
                const weaponKills = toWeaponKillMap(body.weaponKills);
                const matchesPlayed = Math.max(1, toInt(body.matchesPlayed, 1, 1));
                const durationSeconds = toInt(body.durationSeconds, 0, 0);
                const mapName = typeof body.mapName === 'string' && body.mapName ? body.mapName : 'mirage';
                const placement = toInt(body.placement, 0, 0);
                const playerCount = Math.max(2, toInt(body.playerCount, 6, 2));
                const data = db.read();
                const currentPremier = resolveCurrentPremierProfile({ user, premierStore: data.premier, now: new Date() });
                const opponentAvgElo = toInt(body.opponentAvgElo, toInt(currentPremier?.rating, 10000, 0), 0, 50000);

                if (placement < 1) {
                    return json(res, 400, { error: 'placement must be >= 1.' });
                }

                const economy = data.liveops?.economy || {};
                const rewardBreakdown = computeFfaRewardBreakdown(economy, { kills, placement });
                let premierUpdate = null;
                let progressionUpdate = null;

                await db.mutate((mutable) => {
                    const target = mutable.users.find((item) => item.id === user.id);
                    if (!target) return;

                    target.stats.kills += kills;
                    target.stats.deaths += deaths;
                    target.stats.assists += assists;
                    target.stats.headshots = toInt(target.stats.headshots, 0, 0) + headshots;
                    target.stats.damage += damage;
                    target.stats.score += score;
                    target.stats.wins += wins;
                    target.stats.maxKillStreak = Math.max(toInt(target.stats.maxKillStreak, 0, 0), maxKillStreak);
                    target.stats.matchesPlayed += matchesPlayed;
                    target.stats.lastMatchAt = new Date().toISOString();
                    target.wallet += rewardBreakdown.total;

                    const seasonPremier = resolveCurrentPremierProfile({
                        user: target,
                        premierStore: mutable.premier,
                        now: new Date(),
                    });
                    premierUpdate = computePremierUpdate({
                        premier: seasonPremier,
                        kills,
                        deaths,
                        assists,
                        damage,
                        score,
                        placement,
                        playerCount,
                        opponentAvgElo,
                    });

                    setCurrentPremierProfile({
                        userId: target.id,
                        premier: {
                            rating: premierUpdate.after,
                            matchesPlayed: premierUpdate.matchesPlayed,
                            calibrationMatches: premierUpdate.calibrationMatches,
                            calibrated: premierUpdate.calibrated,
                            tier: premierUpdate.tier,
                        },
                        premierStore: mutable.premier,
                        now: new Date(),
                    });
                    syncUserPremierMirror({ user: target, premierStore: mutable.premier, now: new Date() });

                    progressionUpdate = applyProgressionFromMatch({
                        user: target,
                        liveops: mutable.liveops,
                        payload: {
                            kills,
                            deaths,
                            assists,
                            headshots,
                            damage,
                            score,
                            wins,
                            maxKillStreak,
                            weaponKills,
                        },
                        now: new Date(),
                    });

                    applyFfaProgress(mutable, target.id, {
                        kills,
                        deaths,
                        assists,
                        damage,
                        score,
                        wins,
                        matchesPlayed,
                    }, new Date());

                    mutable.matches.push({
                        id: crypto.randomUUID(),
                        mode: 'ffa',
                        userId: target.id,
                        kills,
                        deaths,
                        assists,
                        damage,
                        score,
                        wins,
                        headshots,
                        maxKillStreak,
                        weaponKills,
                        placement,
                        playerCount,
                        opponentAvgElo,
                        reward: rewardBreakdown.total,
                        rewardBreakdown,
                        questReward: progressionUpdate ? progressionUpdate.questRewardTotal : 0,
                        premierBefore: premierUpdate ? premierUpdate.before : null,
                        premierAfter: premierUpdate ? premierUpdate.after : null,
                        eloDelta: premierUpdate ? premierUpdate.delta : 0,
                        durationSeconds,
                        mapName,
                        createdAt: new Date().toISOString(),
                    });
                });

                const freshUser = db.read().users.find((item) => item.id === user.id);
                const premier = toPremierPublic(freshUser.premier);
                const tierMeta = getPremierTierMeta(premier.rating, premier.visible);
                return json(res, 200, {
                    ok: true,
                    reward: rewardBreakdown.total,
                    rewardBreakdown,
                    wallet: freshUser.wallet,
                    stats: freshUser.stats,
                    premier,
                    eloDelta: premierUpdate ? premierUpdate.delta : 0,
                    questRewardTotal: progressionUpdate ? progressionUpdate.questRewardTotal : 0,
                    questCompletions: progressionUpdate ? progressionUpdate.questCompletions : [],
                    achievementUnlocks: progressionUpdate ? progressionUpdate.achievementUnlocks : [],
                    progression: progressionUpdate
                        ? progressionUpdate.snapshot
                        : buildProgressionSnapshot({ user: freshUser, liveops: db.read().liveops, now: new Date() }),
                    premierTier: {
                        id: tierMeta.id,
                        label: tierMeta.label,
                        color: tierMeta.color,
                    },
                    currency: db.read().liveops?.currency || 'coin',
                });
            }

            if (method === 'GET' && pathname === '/api/liveops/config') {
                if (!requireAdmin(req, res)) return;
                return json(res, 200, {
                    ok: true,
                    liveops: db.read().liveops,
                });
            }

            if (method === 'GET' && pathname === '/api/liveops/assets') {
                if (!requireAdmin(req, res)) return;
                const target = `${url.searchParams.get('target') || ''}`.trim().toLowerCase();
                const entityId = sanitizeAssetName(url.searchParams.get('entityId'), 'asset');
                const folderMap = createAssetFolderMap();
                const def = folderMap[target];
                if (!def) return json(res, 400, { error: 'Unsupported asset target.' });

                await mkdir(def.folder, { recursive: true });
                const prefix = `${entityId}__`;
                const legacyPrefix = `${entityId}.`;
                const names = (await readdir(def.folder, { withFileTypes: true }))
                    .filter((entry) => entry.isFile())
                    .map((entry) => entry.name)
                    .filter((name) => {
                        const lower = name.toLowerCase();
                        const extension = path.extname(lower);
                        return def.extensions.has(extension) && (lower.startsWith(prefix) || lower.startsWith(legacyPrefix));
                    })
                    .sort((a, b) => a.localeCompare(b));

                return json(res, 200, {
                    ok: true,
                    assets: names.map((name) => ({
                        fileName: name,
                        publicPath: `${def.publicBase}/${name}`,
                    })),
                });
            }

            if (method === 'POST' && pathname === '/api/liveops/upload-asset') {
                if (!requireAdmin(req, res)) return;
                const body = await parseBody(req, { maxSizeBytes: 32 * 1024 * 1024 });
                const target = `${body?.target || ''}`.trim().toLowerCase();
                const entityId = sanitizeAssetName(body?.entityId, 'asset');
                const originalName = `${body?.fileName || ''}`.trim();
                const extension = path.extname(originalName).toLowerCase();
                const fileData = decodeBase64Payload(body?.dataBase64);
                const folderMap = createAssetFolderMap();
                const def = folderMap[target];
                if (!def) return json(res, 400, { error: 'Unsupported upload target.' });
                if (!def.extensions.has(extension)) return json(res, 400, { error: 'Unsupported file extension.' });
                if (!fileData?.length) return json(res, 400, { error: 'Missing file data.' });

                await mkdir(def.folder, { recursive: true });
                const sourceStem = sanitizeAssetName(
                    path.parse(originalName).name,
                    target.endsWith('icon') ? 'icon' : (target.endsWith('animation') ? 'anim' : 'model'),
                );
                const finalName = `${entityId}__${sourceStem}${extension}`;
                const diskPath = path.resolve(def.folder, finalName);
                await writeFile(diskPath, fileData);

                return json(res, 200, {
                    ok: true,
                    publicPath: `${def.publicBase}/${finalName}`,
                    fileName: finalName,
                    bytes: fileData.length,
                });
            }

            if (method === 'PUT' && pathname === '/api/liveops/config') {
                if (!requireAdmin(req, res)) return;

                const body = await parseBody(req);
                const incoming = normalizeLiveops(body);
                await db.mutate((mutable) => {
                    const prevRevision = Number(mutable.liveops?.revision) || 1;
                    const normalized = normalizeLiveops(incoming);
                    normalized.revision = Math.max(prevRevision + 1, Number(normalized.revision) || 1);
                    normalized.updatedAt = new Date().toISOString();
                    mutable.liveops = normalized;
                });

                return json(res, 200, {
                    ok: true,
                    liveops: db.read().liveops,
                });
            }

            if (method === 'GET' && pathname === '/api/multiplayer/bootstrap') {
                const user = requireAuth(req, res);
                if (!user) return;
                const forwardedProtoHeader = `${req.headers['x-forwarded-proto'] || ''}`.split(',')[0].trim();
                const forwardedHostHeader = `${req.headers['x-forwarded-host'] || ''}`.split(',')[0].trim();
                const hostHeader = forwardedHostHeader || req.headers.host || `localhost:${config.port}`;
                const proto = forwardedProtoHeader || (req.socket.encrypted ? 'https' : 'http');
                const wsProtocol = proto === 'https' ? 'wss' : 'ws';

                return json(res, 200, {
                    ws: {
                        url: `${wsProtocol}://${hostHeader}/ws`,
                        tickRate: config.wsTickRate,
                        protocol: 'cube-ffa-v1',
                    },
                    player: {
                        id: user.id,
                        username: user.username,
                    },
                    notes: [
                        'Server-authoritative movement recommended for production.',
                        'Use this endpoint before joining multiplayer room.',
                    ],
                });
            }

            return json(res, 404, { error: 'Route not found.' });
        } catch (error) {
            return json(res, 500, {
                error: 'Server error',
                detail: process.env.NODE_ENV === 'production' ? undefined : `${error}`,
            });
        }
    });

    const realtime = attachRealtimeGateway({ server, config, db });

    server.listen(config.port, config.host, () => {
        // eslint-disable-next-line no-console
        console.log(`[backend] listening on http://${config.host}:${config.port}`);
        // eslint-disable-next-line no-console
        console.log(`[backend] data file: ${config.dataFile}`);
    });

    const shutdown = () => {
        realtime.close();
        server.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
};

await createServer();
