const TOKEN_STORAGE_KEY = 'backend_access_token';

declare global {
    interface Window {
        __CUBE_API_BASE__?: string;
    }
}

const sanitizeBase = (value: string) => `${value || ''}`.trim().replace(/\/+$/, '');

const resolveDefaultBase = () => {
    if (typeof window === 'undefined') return 'http://localhost:8787';

    const { protocol, hostname, origin } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocal) return `${protocol}//${hostname}:8787`;
    return origin;
};

const resolveApiBase = () => {
    const runtimeBase = (typeof window !== 'undefined' && typeof window.__CUBE_API_BASE__ === 'string')
        ? sanitizeBase(window.__CUBE_API_BASE__)
        : '';
    if (runtimeBase) return runtimeBase;

    const envBase = ((import.meta as any).env && (import.meta as any).env.VITE_BACKEND_URL)
        ? sanitizeBase(`${(import.meta as any).env.VITE_BACKEND_URL}`)
        : '';
    if (envBase) return envBase;

    return resolveDefaultBase();
};

const API_BASE = resolveApiBase();

export type LeaderboardPeriod = 'daily' | 'weekly' | 'all';
export type LeaderboardMetric = 'kills' | 'wins';
export type EquipSlot = 'character' | 'rifle' | 'pistol' | 'knife';
export type LoadoutSlot = 'primary' | 'secondary' | 'knife';
export type ItemRarity = 'consumer' | 'industrial' | 'milspec' | 'restricted' | 'classified' | 'covert' | 'contraband' | string;
export type ProgressionEquipType = 'title' | 'nameColor' | 'avatar' | 'avatarFrame';

export type AvatarCatalogItem = {
    id: string;
    label: string;
};

export type SkinMeta = {
    weaponId?: string;
    slot: string;
    rarity: ItemRarity;
};

export type SkinItem = {
    name: string;
    rarity: ItemRarity;
    slot: string;
    weaponId?: string;
};

export type LoadoutProfile = {
    primary: string;
    secondary: string;
    knife: string;
};

export type WeaponCatalogItem = {
    weaponId: string;
    displayName: string;
    description?: string;
    category: string;
    priceCoin: number;
    rarity?: string;
    dropWeight?: number;
    iconPath?: string;
    modelPath?: string;
    modelPosition?: [number, number, number];
    modelRotation?: [number, number, number];
    modelScale?: [number, number, number];
    enabled?: boolean;
    slot: LoadoutSlot;
    placeholderRig: 'ak' | 'usp' | 'm9' | string;
    stats: {
        damage: number;
        fireRate: number;
        rpm?: number;
        tracerSpeed?: number;
        magazine: number;
        reserve: number;
        speed: number;
        classification: string;
        damageModel?: {
            baseDamage: number;
            rangeModifier: number;
            armorRatio: number;
            headMultiplier: number;
            stomachMultiplier: number;
            legMultiplier: number;
            effectivePellets?: number;
            isKnife?: boolean;
        };
        inaccuracyModel?: {
            standInaccuracy: number;
            moveInaccuracy: number;
            crouchMultiplier: number;
            walkMultiplier: number;
            airInaccuracy: number;
            landingPenalty: number;
            firstShotMultiplier: number;
            recoilPerShot: number;
            recoilSpreadGain: number;
            recoilMax: number;
            recoveryRate: number;
        };
        recoilModel?: {
            basePitch: number;
            patternPitch: number;
            patternYaw: number;
            movementKickScale: number;
            cameraRecoverRate: number;
            resetAfterSeconds: number;
        };
        movementModel?: {
            speed: number;
            walkSpeedMul: number;
        };
    };
};

export type PremierProfile = {
    rating: number;
    matchesPlayed: number;
    calibrationMatches: number;
    calibrated: boolean;
    visible: boolean;
    tier: string;
    tierLabel: string;
    tierColor: string;
    display: string;
};

export type FriendRelation = 'friend' | 'incoming' | 'outgoing' | 'none';

export type FriendEntry = {
    userId: string;
    username: string;
    title: string;
    nameColor: string;
    avatar: string;
    avatarFrame: string;
    premier: PremierProfile | null;
    relation: FriendRelation;
    online: boolean;
    lastSeenAt: string | null;
};

export type FriendsSnapshot = {
    friends: FriendEntry[];
    incoming: FriendEntry[];
    outgoing: FriendEntry[];
    counts: {
        friends: number;
        incoming: number;
        outgoing: number;
        online: number;
    };
};

export type SocialUserEntry = {
    userId: string;
    username: string;
    title: string;
    nameColor: string;
    avatar: string;
    avatarFrame: string;
    premier: PremierProfile | null;
    online: boolean;
    lastSeenAt: string | null;
};

export type MatchRoomGameConfig = {
    mode: string;
    durationSeconds: number;
    fillBots: boolean;
    startedAt: string | null;
};

export type SquadRoomState = {
    id: string;
    label: string;
    partyId: string;
    visibility: 'public' | 'private' | string;
    hostUserId: string;
    capacity: number;
    memberCount: number;
    isHost: boolean;
    game?: MatchRoomGameConfig;
    members: SocialUserEntry[];
    createdAt: string;
    updatedAt: string;
};

export type SocialInviteEntry = {
    id: string;
    roomId: string;
    status: string;
    createdAt: string;
    expiresAt: string;
    isOutgoing: boolean;
    from: SocialUserEntry | null;
    room: SquadRoomState | null;
};

export type SocialGiftCatalogEntry = {
    key: string;
    type: 'coin' | 'case' | string;
    label: string;
    amount: number;
    priceCoin: number;
    caseId: string;
};

export type SocialGiftEntry = {
    id: string;
    type: 'coin' | 'case' | string;
    status: string;
    amount: number;
    caseId: string;
    caseTitle: string;
    label: string;
    note: string;
    createdAt: string;
    claimedAt: string | null;
    isIncoming: boolean;
    from: SocialUserEntry | null;
    to: SocialUserEntry | null;
};

export type SocialThreadSummary = {
    user: SocialUserEntry | null;
    lastMessageText: string;
    lastMessageAt: string;
    lastSenderId: string;
    unreadCount: number;
};

export type DirectMessageEntry = {
    id: string;
    fromUserId: string;
    toUserId: string;
    text: string;
    createdAt: string;
    readAt: string | null;
    isSelf: boolean;
    from: SocialUserEntry | null;
};

export type SocialSnapshot = {
    squad: {
        room: SquadRoomState | null;
        incomingInvites: SocialInviteEntry[];
        outgoingInvites: SocialInviteEntry[];
        capacity: number;
    };
    gifts: {
        catalog: SocialGiftCatalogEntry[];
        inbox: SocialGiftEntry[];
        sent: SocialGiftEntry[];
        claimableCount: number;
    };
    messages: {
        threads: SocialThreadSummary[];
        unreadCount: number;
    };
};

export type QuestItemState = {
    id: string;
    title: string;
    description: string;
    metric: string;
    weaponId?: string;
    progress: number;
    goal: number;
    remaining: number;
    completed: boolean;
    rewarded: boolean;
    rewardCoin: number;
};

export type QuestScopeState = {
    key: string;
    nextResetAt: string | null;
    resetInSeconds: number | null;
    items: QuestItemState[];
};

export type WeeklyLoginRewardState = {
    day: number;
    title: string;
    rewardCoin: number;
    claimed: boolean;
    claimedAt: string | null;
    claimable: boolean;
    missed: boolean;
};

export type WeeklyLoginState = {
    key: string;
    nextResetAt: string | null;
    resetInSeconds: number | null;
    todayDay: number;
    claimableCount: number;
    items: WeeklyLoginRewardState[];
};

export type AchievementItemState = {
    id: string;
    title: string;
    description: string;
    metric: string;
    current: number;
    goal: number;
    completed: boolean;
    unlocked: boolean;
    unlockedAt: string | null;
    rewardTitle?: string;
    rewardNameColor?: string;
    rewardAvatar?: string;
    rewardAvatarFrame?: string;
    rewardCoin?: number;
};

export type ProgressionCosmetics = {
    title: string;
    nameColor: string;
    avatar: string;
    avatarFrame: string;
    unlockedTitles: string[];
    unlockedNameColors: string[];
    unlockedAvatars: string[];
    unlockedAvatarFrames: string[];
    avatarCatalog: AvatarCatalogItem[];
};

export type ProgressionProfile = {
    serverTime: string;
    quests: {
        daily: QuestScopeState;
        weekly: QuestScopeState;
    };
    weeklyLogin: WeeklyLoginState;
    achievements: {
        unlockedCount: number;
        total: number;
        items: AchievementItemState[];
    };
    cosmetics: ProgressionCosmetics;
};

export type AuthUser = {
    id: string;
    username: string;
    createdAt: string;
    wallet: number;
    inventory: {
        cases: Record<string, number>;
        skins: string[];
        skinMeta: Record<string, SkinMeta>;
        equipped: {
            character: string;
            rifle: string;
            pistol: string;
            knife: string;
        };
    };
    loadout: LoadoutProfile;
    stats: {
        kills: number;
        deaths: number;
        assists: number;
        headshots: number;
        damage: number;
        score: number;
        wins: number;
        maxKillStreak: number;
        matchesPlayed: number;
        lastMatchAt: string | null;
    };
    premier: PremierProfile;
    progression: ProgressionProfile;
    friends: FriendsSnapshot;
};

export type ShopOffer = {
    id: string;
    title: string;
    type: 'case' | 'bundle' | 'skin';
    description?: string;
    priceCoin: number;
    price?: number;
    caseId?: string;
    bundleSize?: number;
    skin?: string;
    rarity?: ItemRarity;
    slot?: EquipSlot;
};

export type PurchaseCaseOpenResult = {
    caseId: string;
    skin: SkinItem;
    rarity: ItemRarity;
    spinTrack: Array<{ skin: string; rarity: ItemRarity; slot?: string; weaponId?: string }>;
    stopIndex: number;
    durationMs: number;
};

export type CaseDrop = {
    skin: string;
    rarity: ItemRarity;
    slot?: EquipSlot | string;
    weaponId?: string;
    weight?: number;
    chance?: number;
};

export type CaseCatalogItem = {
    id: string;
    title: string;
    description?: string;
    offerId?: string;
    openPriceCoin: number;
    priceCoin?: number;
    enabled?: boolean;
    drops: CaseDrop[];
};

export type CaseCatalogResponse = {
    currency: string;
    revision: number;
    serverTime: string;
    defaultLoadout?: LoadoutProfile;
    cases: CaseCatalogItem[];
};

export type LoadoutCatalogResponse = {
    weapons: WeaponCatalogItem[];
    defaultLoadout: LoadoutProfile;
    revision: number;
    currency: string;
};

export type LeaderboardRow = {
    rank: number;
    userId: string;
    username: string;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    score: number;
    wins: number;
    matchesPlayed: number;
    premier: PremierProfile | null;
    cosmetics: {
        title: string;
        nameColor: string;
        avatar: string;
        avatarFrame: string;
    } | null;
};

export type LeaderboardResponse = {
    period: LeaderboardPeriod;
    metric: LeaderboardMetric;
    generatedAt: string;
    serverTime: string;
    nextResetAt: string | null;
    resetInSeconds: number | null;
    rows: LeaderboardRow[];
};

export type FfaReportPayload = {
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    damage: number;
    score: number;
    wins: number;
    maxKillStreak: number;
    weaponKills: Record<string, number>;
    placement: number;
    opponentAvgElo?: number;
    playerCount?: number;
    matchesPlayed: number;
    durationSeconds: number;
    mapName: string;
};

export type FfaReportResult = {
    ok: boolean;
    reward: number;
    rewardBreakdown: {
        placement: number;
        win: number;
        kill: number;
        total: number;
    };
    wallet: number;
    stats: AuthUser['stats'];
    premier: PremierProfile;
    eloDelta: number;
    questRewardTotal: number;
    questCompletions: Array<{ scope: 'daily' | 'weekly' | string; id: string; title: string; rewardCoin: number }>;
    achievementUnlocks: Array<{ id: string; title: string; rewardTitle?: string; rewardNameColor?: string; rewardAvatar?: string; rewardAvatarFrame?: string; rewardCoin?: number }>;
    progression: ProgressionProfile;
    currency: string;
};

export type LobbyChatMessage = {
    id: number;
    userId: string;
    username: string;
    displayName: string;
    title: string;
    nameColor: string;
    avatar: string;
    avatarFrame: string;
    text: string;
    createdAt: string;
};

export type PremierLeaderboardRow = {
    rank: number;
    userId: string;
    username: string;
    premier: PremierProfile;
    cosmetics: {
        title: string;
        nameColor: string;
        avatar: string;
        avatarFrame: string;
    } | null;
};

export type PremierLeaderboardResponse = {
    seasonId: string;
    seasonLabel: string;
    seasonStartAt: string;
    seasonEndAt: string;
    generatedAt: string;
    serverTime: string;
    nextResetAt: string | null;
    resetInSeconds: number | null;
    totalPlayers: number;
    rankedPlayers: number;
    viewerRank: number | null;
    windowMode: string;
    rows: PremierLeaderboardRow[];
};

type RequestOptions = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    token?: string | null;
    body?: any;
    headers?: Record<string, string>;
};

const parseJsonResponse = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    try {
        return await response.json();
    } catch {
        return null;
    }
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
        'ngrok-skip-browser-warning': 'true',
        ...(options.headers || {}),
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
        const message = payload && payload.error ? payload.error : `HTTP ${response.status}`;
        throw new Error(message);
    }
    return payload as T;
};

export const backendApi = {
    getBaseUrl() {
        return API_BASE;
    },

    getStoredToken() {
        return localStorage.getItem(TOKEN_STORAGE_KEY);
    },

    storeToken(token: string) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
    },

    clearToken() {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    },

    async health() {
        return request<{ ok: boolean; service: string; time: string; multiplayerReady: boolean }>('/api/health');
    },

    async register(username: string, password: string) {
        return request<{ token: string; user: AuthUser }>('/api/auth/register', {
            method: 'POST',
            body: { username, password },
        });
    },

    async login(username: string, password: string) {
        return request<{ token: string; user: AuthUser }>('/api/auth/login', {
            method: 'POST',
            body: { username, password },
        });
    },

    async me(token: string) {
        return request<{ user: AuthUser }>('/api/auth/me', { token });
    },

    async profile(token: string) {
        return request<{ profile: AuthUser; currency?: string }>('/api/profile', { token });
    },

    async progression(token: string) {
        return request<{ progression: ProgressionProfile; currency?: string; serverTime?: string }>('/api/progression', { token });
    },

    async friends(token: string) {
        return request<{ friends: FriendsSnapshot; serverTime?: string }>('/api/friends', { token });
    },

    async searchFriends(token: string, query: string, limit = 8) {
        const safeQuery = encodeURIComponent(`${query || ''}`.trim());
        const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 8)));
        return request<{ results: FriendEntry[]; query: string; serverTime?: string }>(
            `/api/friends/search?q=${safeQuery}&limit=${safeLimit}`,
            { token },
        );
    },

    async sendFriendRequest(token: string, payload: { userId?: string; username?: string }) {
        return request<{ ok: boolean; reason: string; status: string; friends: FriendsSnapshot }>('/api/friends/request', {
            method: 'POST',
            token,
            body: payload,
        });
    },

    async acceptFriendRequest(token: string, userId: string) {
        return request<{ ok: boolean; reason: string; friends: FriendsSnapshot }>('/api/friends/accept', {
            method: 'POST',
            token,
            body: { userId },
        });
    },

    async declineFriendRequest(token: string, userId: string) {
        return request<{ ok: boolean; reason: string; friends: FriendsSnapshot }>('/api/friends/decline', {
            method: 'POST',
            token,
            body: { userId },
        });
    },

    async cancelFriendRequest(token: string, userId: string) {
        return request<{ ok: boolean; reason: string; friends: FriendsSnapshot }>('/api/friends/cancel', {
            method: 'POST',
            token,
            body: { userId },
        });
    },

    async removeFriend(token: string, userId: string) {
        return request<{ ok: boolean; reason: string; friends: FriendsSnapshot }>('/api/friends/remove', {
            method: 'POST',
            token,
            body: { userId },
        });
    },

    async social(token: string) {
        return request<{ social: SocialSnapshot; serverTime?: string }>('/api/social', { token });
    },

    async sendSquadInvite(token: string, userId: string) {
        return request<{ ok: boolean; reason: string; social: SocialSnapshot }>('/api/social/squad/invite', {
            method: 'POST',
            token,
            body: { userId },
        });
    },

    async createSquadRoom(token: string, visibility: 'public' | 'private', forceNew = false) {
        return request<{ ok: boolean; reason: string; social: SocialSnapshot }>('/api/social/squad/create', {
            method: 'POST',
            token,
            body: { visibility, forceNew },
        });
    },

    async createMatchRoom(token: string, payload: {
        visibility: 'public' | 'private';
        forceNew?: boolean;
        label?: string;
        capacity?: number;
        game?: {
            mode?: string;
            durationSeconds?: number;
            fillBots?: boolean;
        };
    }) {
        return request<{ ok: boolean; reason: string; social: SocialSnapshot }>('/api/social/squad/create', {
            method: 'POST',
            token,
            body: payload,
        });
    },

    async setSquadVisibility(token: string, visibility: 'public' | 'private') {
        return request<{ ok: boolean; reason: string; social: SocialSnapshot }>('/api/social/squad/visibility', {
            method: 'POST',
            token,
            body: { visibility },
        });
    },

    async joinSquadRoom(token: string, partyId: string) {
        return request<{ ok: boolean; reason: string; social: SocialSnapshot }>('/api/social/squad/join', {
            method: 'POST',
            token,
            body: { partyId },
        });
    },

    async listPublicMatchRooms() {
        return request<{ rooms: SquadRoomState[]; serverTime?: string }>('/api/social/squad/public');
    },

    async respondSquadInvite(token: string, inviteId: string, action: 'accept' | 'decline' | 'cancel') {
        return request<{ ok: boolean; reason: string; social: SocialSnapshot }>('/api/social/squad/respond', {
            method: 'POST',
            token,
            body: { inviteId, action },
        });
    },

    async leaveSquadRoom(token: string) {
        return request<{ ok: boolean; reason: string; social: SocialSnapshot }>('/api/social/squad/leave', {
            method: 'POST',
            token,
        });
    },

    async sendFriendGift(token: string, payload: { userId: string; giftKey: string; note?: string }) {
        return request<{
            ok: boolean;
            reason: string;
            wallet: number;
            inventory: AuthUser['inventory'];
            social: SocialSnapshot;
        }>('/api/social/gifts/send', {
            method: 'POST',
            token,
            body: payload,
        });
    },

    async claimFriendGift(token: string, giftId: string) {
        return request<{
            ok: boolean;
            reason: string;
            wallet: number;
            inventory: AuthUser['inventory'];
            social: SocialSnapshot;
        }>('/api/social/gifts/claim', {
            method: 'POST',
            token,
            body: { giftId },
        });
    },

    async directMessages(token: string, userId: string) {
        const safeUserId = encodeURIComponent(`${userId || ''}`.trim());
        return request<{
            threadUser: SocialUserEntry | null;
            messages: DirectMessageEntry[];
            social: SocialSnapshot;
            serverTime?: string;
        }>(`/api/social/messages?userId=${safeUserId}`, { token });
    },

    async sendDirectMessage(token: string, userId: string, text: string) {
        return request<{
            ok: boolean;
            reason: string;
            threadUser: SocialUserEntry | null;
            messages: DirectMessageEntry[];
            social: SocialSnapshot;
        }>('/api/social/messages', {
            method: 'POST',
            token,
            body: { userId, text },
        });
    },

    async claimWeeklyLoginReward(token: string) {
        return request<{
            ok: boolean;
            reason: string;
            rewardCoin: number;
            claimedDay: number | null;
            wallet: number;
            progression: ProgressionProfile;
            currency?: string;
        }>('/api/rewards/weekly-login/claim', {
            method: 'POST',
            token,
        });
    },

    async shopOffers() {
        return request<{ offers: ShopOffer[]; cases: CaseCatalogItem[]; currency: string; revision: number }>('/api/shop/offers');
    },

    async purchase(token: string, offerId: string, qty = 1, options?: { autoOpenCase?: boolean }) {
        return request<{
            ok: boolean;
            granted: any[];
            wallet: number;
            inventory: AuthUser['inventory'];
            currency: string;
            caseOpen?: PurchaseCaseOpenResult | null;
        }>('/api/shop/purchase', {
            method: 'POST',
            token,
            body: { offerId, qty, autoOpenCase: !!options?.autoOpenCase },
        });
    },

    async inventory(token: string) {
        return request<{ wallet: number; inventory: AuthUser['inventory']; currency: string }>('/api/inventory', { token });
    },

    async casesCatalog() {
        return request<CaseCatalogResponse>('/api/cases/catalog');
    },

    async loadoutCatalog() {
        return request<LoadoutCatalogResponse>('/api/loadout/catalog');
    },

    async equipLoadout(token: string, slot: LoadoutSlot, weaponId: string) {
        return request<{ ok: boolean; loadout: LoadoutProfile }>('/api/loadout/equip', {
            method: 'POST',
            token,
            body: { slot, weaponId },
        });
    },

    async openCaseWithCoin(token: string, caseId: string) {
        return request<{
            ok: boolean;
            wallet: number;
            skin: SkinItem;
            skinName?: string;
            rarity: ItemRarity;
            inventory: AuthUser['inventory'];
            spinTrack: Array<{ skin: string; rarity: ItemRarity; slot?: string; weaponId?: string }>;
            stopIndex: number;
            durationMs: number;
            currency: string;
        }>('/api/cases/open', {
            method: 'POST',
            token,
            body: { caseId },
        });
    },

    async openCase(token: string, caseId: string) {
        return request<{ ok: boolean; skin: SkinItem | string; skinItem?: SkinItem; skinName?: string; rarity?: ItemRarity; inventory: AuthUser['inventory']; currency?: string }>('/api/inventory/open-case', {
            method: 'POST',
            token,
            body: { caseId },
        });
    },

    async equip(token: string, slot: EquipSlot, skin: string) {
        return request<{ ok: boolean; equipped: AuthUser['inventory']['equipped'] }>('/api/inventory/equip', {
            method: 'POST',
            token,
            body: { slot, skin },
        });
    },

    async leaderboard(period: LeaderboardPeriod, metric: LeaderboardMetric, limit = 20, token?: string | null) {
        return request<LeaderboardResponse>(`/api/leaderboard?period=${period}&metric=${metric}&limit=${limit}`, { token });
    },

    async premierLeaderboard(token?: string | null) {
        return request<PremierLeaderboardResponse>('/api/leaderboard/premier', { token });
    },

    async lobbyChat(afterId = 0, limit = 40) {
        const safeAfter = Math.max(0, Math.floor(Number(afterId) || 0));
        const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit) || 40)));
        return request<{ messages: LobbyChatMessage[]; nextCursor: number; cursor?: number; serverTime: string }>(
            `/api/chat/lobby?afterId=${safeAfter}&limit=${safeLimit}`,
        );
    },

    async sendLobbyChat(token: string, message: string, displayName?: string) {
        return request<{ ok: boolean; message: LobbyChatMessage; serverTime: string }>('/api/chat/lobby', {
            method: 'POST',
            token,
            body: { message, displayName: `${displayName || ''}` },
        });
    },

    async reportFfaResult(token: string, payload: FfaReportPayload) {
        return request<FfaReportResult>('/api/matches/ffa/report', {
            method: 'POST',
            token,
            body: payload,
        });
    },

    async equipProgression(token: string, type: ProgressionEquipType, value: string) {
        return request<{ ok: boolean; progression: ProgressionProfile; currency?: string }>('/api/progression/equip', {
            method: 'POST',
            token,
            body: { type, value },
        });
    },

    async updateLiveopsConfig(adminKey: string, payload: any) {
        return request<{ ok: boolean; liveops: any }>('/api/liveops/config', {
            method: 'PUT',
            headers: {
                'x-admin-key': adminKey,
            },
            body: payload,
        });
    },

    async getLiveopsConfig(adminKey: string) {
        return request<{ ok: boolean; liveops: any }>('/api/liveops/config', {
            headers: {
                'x-admin-key': adminKey,
            },
        });
    },

    async uploadLiveopsAsset(adminKey: string, payload: {
        target: 'weapon-icon' | 'weapon-model' | 'player-icon' | 'player-model' | 'player-animation';
        entityId: string;
        fileName: string;
        mimeType?: string;
        dataBase64: string;
    }) {
        return request<{ ok: boolean; publicPath: string; fileName: string; bytes: number }>('/api/liveops/upload-asset', {
            method: 'POST',
            headers: {
                'x-admin-key': adminKey,
            },
            body: payload,
        });
    },

    async listLiveopsAssets(adminKey: string, payload: { target: 'weapon-icon' | 'weapon-model' | 'player-icon' | 'player-model' | 'player-animation'; entityId: string }) {
        const target = encodeURIComponent(`${payload?.target || ''}`.trim());
        const entityId = encodeURIComponent(`${payload?.entityId || ''}`.trim());
        return request<{ ok: boolean; assets: Array<{ fileName: string; publicPath: string }> }>(`/api/liveops/assets?target=${target}&entityId=${entityId}`, {
            headers: {
                'x-admin-key': adminKey,
            },
        });
    },

    async multiplayerBootstrap(token: string) {
        return request<{ ws: { url: string; tickRate: number; protocol: string }; player: { id: string; username: string } }>('/api/multiplayer/bootstrap', { token });
    },
};
