import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_EQUIPPED } from './catalog.mjs';
import { createDefaultLiveops, getDefaultLoadout, normalizeLiveops, normalizeLoadout } from './liveops.mjs';
import { buildEmptyFriendsSnapshot, createDefaultFriendState, reconcileFriendGraph, sanitizeFriendState } from './friends.mjs';
import {
    createDefaultPremier,
    createDefaultPremierStore,
    normalizePremierStore,
    resolveCurrentPremierProfile,
    syncUserPremierMirror,
    sanitizePremier,
    toPremierPublic,
} from './premier.mjs';
import { buildProgressionSnapshot, createDefaultUserProgression, sanitizeUserProgression } from './progression.mjs';
import { normalizeChatStore } from './chat.mjs';
import { createDefaultSocialStore, normalizeSocialStore } from './social.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

const baseUserTemplate = (starterWallet = 1200, defaultLoadout = getDefaultLoadout(createDefaultLiveops())) => ({
    wallet: Math.max(0, Math.floor(Number(starterWallet) || 0)),
    inventory: {
        cases: { falcon_case: 1, mirage_case: 0 },
        skins: [],
        skinMeta: {},
        equipped: clone(DEFAULT_EQUIPPED),
    },
    loadout: clone(defaultLoadout),
    stats: {
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        damage: 0,
        score: 0,
        wins: 0,
        maxKillStreak: 0,
        matchesPlayed: 0,
        lastMatchAt: null,
    },
    premier: createDefaultPremier(),
    progression: createDefaultUserProgression(),
    friends: createDefaultFriendState(),
    tokenVersion: 1,
});

const createDefaultDb = () => ({
    meta: {
        version: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    liveops: createDefaultLiveops(),
    premier: createDefaultPremierStore(),
    users: [],
    matches: [],
    leaderboards: {
        all: {},
        daily: {},
        weekly: {},
    },
    chat: {
        nextId: 1,
        lobby: [],
    },
    social: createDefaultSocialStore(),
    transactions: [],
});

const sanitizeUserShape = (user, liveops) => {
    const fallback = baseUserTemplate(1200, getDefaultLoadout(liveops));
    user.wallet = Number.isFinite(Number(user.wallet)) ? Math.max(0, Math.floor(user.wallet)) : fallback.wallet;
    if (!user.inventory || typeof user.inventory !== 'object') user.inventory = fallback.inventory;
    if (!user.inventory.cases || typeof user.inventory.cases !== 'object') user.inventory.cases = clone(fallback.inventory.cases);
    if (!Array.isArray(user.inventory.skins)) user.inventory.skins = [];
    if (!user.inventory.skinMeta || typeof user.inventory.skinMeta !== 'object') user.inventory.skinMeta = {};
    if (!user.inventory.equipped || typeof user.inventory.equipped !== 'object') user.inventory.equipped = clone(fallback.inventory.equipped);
    user.loadout = normalizeLoadout(user.loadout, liveops);
    if (!user.stats || typeof user.stats !== 'object') user.stats = clone(fallback.stats);
    if (!Number.isFinite(Number(user.stats.kills))) user.stats.kills = 0;
    if (!Number.isFinite(Number(user.stats.deaths))) user.stats.deaths = 0;
    if (!Number.isFinite(Number(user.stats.assists))) user.stats.assists = 0;
    if (!Number.isFinite(Number(user.stats.headshots))) user.stats.headshots = 0;
    if (!Number.isFinite(Number(user.stats.damage))) user.stats.damage = 0;
    if (!Number.isFinite(Number(user.stats.score))) user.stats.score = 0;
    if (!Number.isFinite(Number(user.stats.wins))) user.stats.wins = 0;
    if (!Number.isFinite(Number(user.stats.maxKillStreak))) user.stats.maxKillStreak = 0;
    if (!Number.isFinite(Number(user.stats.matchesPlayed))) user.stats.matchesPlayed = 0;
    user.premier = sanitizePremier(user.premier);
    sanitizeUserProgression(user, liveops);
    user.friends = sanitizeFriendState(user.friends, `${user.id || ''}`.trim());
    if (!Number.isFinite(Number(user.tokenVersion))) user.tokenVersion = fallback.tokenVersion;
};

export class JsonDb {
    constructor(filePath) {
        this.filePath = filePath;
        this.data = createDefaultDb();
        this.writeQueue = Promise.resolve();
    }

    async init() {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            this.data = this.normalize(parsed);
        } catch {
            this.data = createDefaultDb();
            await this.persist();
        }
        return this;
    }

    normalize(raw) {
        const normalized = createDefaultDb();
        if (!raw || typeof raw !== 'object') return normalized;

        normalized.liveops = normalizeLiveops(raw.liveops);

        if (Array.isArray(raw.users)) normalized.users = raw.users;
        if (Array.isArray(raw.matches)) normalized.matches = raw.matches;
        if (Array.isArray(raw.transactions)) normalized.transactions = raw.transactions;
        normalized.chat = normalizeChatStore(raw.chat);
        normalized.premier = normalizePremierStore(raw.premier, normalized.users, new Date());

        if (raw.leaderboards && typeof raw.leaderboards === 'object') {
            normalized.leaderboards.all = raw.leaderboards.all || {};
            normalized.leaderboards.daily = raw.leaderboards.daily || {};
            normalized.leaderboards.weekly = raw.leaderboards.weekly || {};
        }

        normalized.users.forEach((item) => {
            sanitizeUserShape(item, normalized.liveops);
            syncUserPremierMirror({ user: item, premierStore: normalized.premier, now: new Date() });
        });
        reconcileFriendGraph(normalized.users);
        normalized.social = normalizeSocialStore(raw.social, normalized.users, normalized.liveops, new Date());
        normalized.meta.updatedAt = new Date().toISOString();
        return normalized;
    }

    read() {
        return this.data;
    }

    snapshot() {
        return clone(this.data);
    }

    async mutate(mutator) {
        const result = await mutator(this.data);
        this.data.users.forEach((item) => {
            syncUserPremierMirror({ user: item, premierStore: this.data.premier, now: new Date() });
        });
        this.data.social = normalizeSocialStore(this.data.social, this.data.users, this.data.liveops, new Date());
        this.data.meta.updatedAt = new Date().toISOString();
        this.writeQueue = this.writeQueue.then(() => this.persist());
        await this.writeQueue;
        return result;
    }

    async persist() {
        const tmpFile = `${this.filePath}.tmp`;
        const payload = JSON.stringify(this.data, null, 2);
        await fs.writeFile(tmpFile, payload, 'utf8');
        await fs.rename(tmpFile, this.filePath);
    }
}

export const createNewUser = ({ id, username, passwordHash, passwordSalt, starterWallet = 1200, defaultLoadout }) => {
    const now = new Date().toISOString();
    return {
        id,
        username,
        passwordHash,
        passwordSalt,
        createdAt: now,
        ...baseUserTemplate(starterWallet, defaultLoadout),
    };
};

export const toPublicUser = (
    user,
    liveops = createDefaultLiveops(),
    now = new Date(),
    premierStore = createDefaultPremierStore(now),
    friendsSnapshot = buildEmptyFriendsSnapshot(),
) => ({
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    wallet: user.wallet,
    inventory: user.inventory,
    loadout: user.loadout,
    stats: user.stats,
    premier: toPremierPublic(resolveCurrentPremierProfile({ user, premierStore, now })),
    progression: buildProgressionSnapshot({ user, liveops, now }),
    friends: friendsSnapshot,
});
