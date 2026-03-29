import { GameContext } from '@src/core/GameContext';
import Stats from 'three/examples/jsm/libs/stats.module';
import { DomEventPipe, PointLockEvent } from '../gameplay/pipes/DomEventPipe';
import { CycleInterface } from '../core/inferface/CycleInterface';
import { LoopInterface } from '../core/inferface/LoopInterface';
import { PointLockEventEnum } from '../gameplay/abstract/EventsEnum';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import {
    AuthUser,
    backendApi,
    CaseCatalogItem,
    DirectMessageEntry,
    EquipSlot,
    FriendEntry,
    FriendsSnapshot,
    ItemRarity,
    LobbyChatMessage,
    LeaderboardMetric,
    LeaderboardPeriod,
    LoadoutProfile,
    LoadoutSlot,
    PremierLeaderboardResponse,
    ProgressionEquipType,
    ProgressionProfile,
    SkinItem,
    SocialGiftCatalogEntry,
    SocialSnapshot,
    SocialUserEntry,
    ShopOffer,
    SquadRoomState,
    WeaponCatalogItem,
} from '@src/services/BackendApi';
import { DEFAULT_AVATAR_ID, FRONTEND_AVATAR_CATALOG, getAvatarImageUrl, getAvatarLabel } from '@src/shared/AvatarCatalog';
import forboxLogoUrl from '@assets/logo/Forbox-logo.png';
import caseTier0Url from '@assets/case/0.png';
import caseTier1Url from '@assets/case/1.png';
import caseTier2Url from '@assets/case/2.png';
import caseTier3Url from '@assets/case/3.png';
import caseTier4Url from '@assets/case/4.png';
import caseTier5Url from '@assets/case/5.png';
import caseTier6Url from '@assets/case/6.png';
import caseTier7Url from '@assets/case/7.png';
import caseTier8Url from '@assets/case/8.png';
import caseTier9Url from '@assets/case/9.png';
import caseAnimationRefUrl from '@assets/gui/CASE - ANIMATION.jpg';
import caseBuyRefUrl from '@assets/gui/CASE - BUY.jpg';
import weaponReviewRefUrl from '@assets/gui/WEAPON REVIEW - EQUIP.jpg';
import {
    getContentStudioSnapshot,
    getStudioCaseCatalogItems,
    getStudioShopOffers,
    getStudioWeaponCatalogItems,
    subscribeContentStudio,
} from '@src/content/ContentStudio';

type GunAssetEntry = {
    url: string;
    groupLabel: string;
    groupKey: string;
    weaponLabel: string;
    weaponKey: string;
    skinLabel: string;
    skinKey: string;
    isDefault: boolean;
};

type MenuTab = 'play' | 'inventory' | 'shop' | 'leaderboard' | 'rewards' | 'missions';
type ShopSubTab = 'home' | 'case' | 'weapon' | 'emotes' | 'buy_fp';
type ForboxModalType = 'none' | 'account' | 'squad' | 'create_game' | 'find_game' | 'purchase_confirm';

type CaseSpinResult = {
    skin: SkinItem;
    rarity: ItemRarity;
    spinTrack: Array<{ skin: string; rarity: ItemRarity; slot?: string; weaponId?: string }>;
    stopIndex: number;
    durationMs: number;
};

const FALLBACK_LOADOUT: LoadoutProfile = (() => {
    const loadout = getContentStudioSnapshot().defaultLoadout;
    return {
        primary: `${loadout?.primary || 'ak47'}`,
        secondary: `${loadout?.secondary || 'usp_s'}`,
        knife: `${loadout?.knife || 'm9'}`,
    };
})();

const FALLBACK_WEAPON_CATALOG: WeaponCatalogItem[] = getStudioWeaponCatalogItems();
const FALLBACK_OFFERS: ShopOffer[] = getStudioShopOffers();
const FALLBACK_CASES: CaseCatalogItem[] = getStudioCaseCatalogItems();

const FALLBACK_PROGRESSION: ProgressionProfile = {
    serverTime: new Date(0).toISOString(),
    quests: {
        daily: {
            key: '',
            nextResetAt: null,
            resetInSeconds: null,
            items: [],
        },
        weekly: {
            key: '',
            nextResetAt: null,
            resetInSeconds: null,
            items: [],
        },
    },
    weeklyLogin: {
        key: '',
        nextResetAt: null,
        resetInSeconds: null,
        todayDay: 1,
        claimableCount: 0,
        items: [],
    },
    achievements: {
        unlockedCount: 0,
        total: 0,
        items: [],
    },
    cosmetics: {
        title: 'Rookie',
        nameColor: 'default',
        avatar: DEFAULT_AVATAR_ID,
        avatarFrame: 'default',
        unlockedTitles: ['Rookie'],
        unlockedNameColors: ['default'],
        unlockedAvatars: [DEFAULT_AVATAR_ID],
        unlockedAvatarFrames: ['default'],
        avatarCatalog: FRONTEND_AVATAR_CATALOG.map((item) => ({ id: item.id, label: item.label })),
    },
};

const EMPTY_FRIENDS: FriendsSnapshot = {
    friends: [],
    incoming: [],
    outgoing: [],
    counts: {
        friends: 0,
        incoming: 0,
        outgoing: 0,
        online: 0,
    },
};

const EMPTY_SOCIAL: SocialSnapshot = {
    squad: {
        room: null,
        incomingInvites: [],
        outgoingInvites: [],
        capacity: 4,
    },
    gifts: {
        catalog: [],
        inbox: [],
        sent: [],
        claimableCount: 0,
    },
    messages: {
        threads: [],
        unreadCount: 0,
    },
};

const PARTY_JOIN_STORAGE_KEY = 'forbox.pendingPartyId';

const cloneProgression = (): ProgressionProfile => JSON.parse(JSON.stringify(FALLBACK_PROGRESSION));
const CASE_PREVIEW_IMAGES = [
    caseTier0Url,
    caseTier1Url,
    caseTier2Url,
    caseTier3Url,
    caseTier4Url,
    caseTier5Url,
    caseTier6Url,
    caseTier7Url,
    caseTier8Url,
    caseTier9Url,
];

const GUN_IMAGE_MODULES = import.meta.glob('../../assets/guns/**/*.webp', {
    eager: true,
    import: 'default',
}) as Record<string, string>;

const SLOT_SET = new Set<EquipSlot>(['character', 'rifle', 'pistol', 'knife']);

const RARITY_ORDER: Record<string, number> = {
    consumer: 1,
    industrial: 2,
    milspec: 3,
    restricted: 4,
    classified: 5,
    covert: 6,
    contraband: 7,
};

const WEEKLY_LOGIN_DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const toInt = (value: any, fallback = 0, min = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.floor(parsed));
};

const rarityClass = (rarity: ItemRarity) => {
    const key = `${rarity || 'milspec'}`.toLowerCase();
    return `rarity-${key}`;
};

const mergeWeaponCatalog = (incoming: WeaponCatalogItem[] | null | undefined): WeaponCatalogItem[] => {
    const merged = new Map<string, WeaponCatalogItem>();

    FALLBACK_WEAPON_CATALOG.forEach((item) => {
        merged.set(item.weaponId, item);
    });

    (incoming || []).forEach((item) => {
        const weaponId = `${item?.weaponId || ''}`.trim();
        if (!weaponId) return;
        merged.set(weaponId, item);
    });

    return Array.from(merged.values());
};

const escapeHtml = (value: string) => `${value || ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeGunAssetKey = (value: string) => `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const GUN_ASSET_ENTRIES: GunAssetEntry[] = Object.entries(GUN_IMAGE_MODULES).map(([path, url]) => {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileLabel = (parts[parts.length - 1] || '').replace(/\.[^.]+$/, '');
    const maybeWeaponLabel = parts[parts.length - 2] || '';
    const maybeGroupLabel = parts[parts.length - 3] || '';
    const isNestedWeaponFolder = normalizeGunAssetKey(maybeGroupLabel) !== 'guns';
    const groupLabel = isNestedWeaponFolder ? maybeGroupLabel : maybeWeaponLabel;
    const weaponLabel = isNestedWeaponFolder
        ? maybeWeaponLabel
        : (normalizeGunAssetKey(groupLabel) === 'knife' ? 'M9 Knife' : maybeWeaponLabel);

    return {
        url,
        groupLabel,
        groupKey: normalizeGunAssetKey(groupLabel),
        weaponLabel,
        weaponKey: normalizeGunAssetKey(weaponLabel),
        skinLabel: fileLabel,
        skinKey: normalizeGunAssetKey(fileLabel),
        isDefault: normalizeGunAssetKey(fileLabel) === 'default',
    };
});

/**
 * DOM interaction layer. Handles renderer mount, pointer-lock blocker and online main menu.
 */
export class DOMLayer extends EventTarget implements CycleInterface, LoopInterface {
    stats: Stats = Stats();

    private blocker: HTMLDivElement;
    private instructions: HTMLDivElement;
    private pauseResumeBtn: HTMLButtonElement;
    private pauseMainMenuBtn: HTMLButtonElement;
    private mainMenu: HTMLDivElement;

    private currentTab: MenuTab = 'play';
    private currentShopSubTab: ShopSubTab = 'case';
    private activeForboxModal: ForboxModalType = 'none';
    private currentGameMode = 'ffa';
    private activeMatchRoom: SquadRoomState | null = null;
    private publicMatchRooms: SquadRoomState[] = [];
    private boardPeriod: LeaderboardPeriod = 'daily';
    private boardMetric: LeaderboardMetric = 'kills';
    private leaderboardView: 'stats' | 'premier' = 'stats';
    private gameStarted = false;
    private intermissionActive = false;
    private devPanelOpen = false;
    private leaderboardRequestId = 0;
    private leaderboardCountdownInterval: number | null = null;
    private leaderboardServerOffsetMs = 0;
    private leaderboardResetAtMs = 0;
    private progressionCountdownInterval: number | null = null;
    private progressionServerOffsetMs = 0;
    private dailyResetAtMs = 0;
    private weeklyResetAtMs = 0;

    private menuCurrency = 'FP';
    private profileAlias = '';
    private teamTag = '';
    private pendingPurchaseOfferId: string | null = null;

    private walletValueEl: HTMLSpanElement;
    private topWalletValueEl: HTMLSpanElement;
    private squadRoomChipEl: HTMLSpanElement;
    private openSquadChipEl: HTMLSpanElement;
    private inventoryFilterInputEl: HTMLInputElement;
    private inventoryFilterButtonsEl: HTMLDivElement;
    private inventoryInfoEl: HTMLDivElement;
    private inventoryCasesEl: HTMLDivElement;
    private inventorySkinsEl: HTMLDivElement;
    private inventoryMessageEl: HTMLDivElement;
    private loadoutPrimaryEl: HTMLDivElement;
    private loadoutSecondaryEl: HTMLDivElement;
    private loadoutKnifeEl: HTMLDivElement;
    private loadoutMessageEl: HTMLDivElement;
    private leaderboardListEl: HTMLDivElement;
    private leaderboardHeaderEl: HTMLSpanElement;
    private leaderboardResetEl: HTMLSpanElement;
    private leaderboardStatsControlsEl: HTMLDivElement;
    private leaderboardStatsPanelEl: HTMLDivElement;
    private leaderboardPremierPanelEl: HTMLDivElement;
    private premierSeasonHeaderEl: HTMLSpanElement;
    private premierSeasonResetEl: HTMLSpanElement;
    private premierSeasonMetaEl: HTMLDivElement;
    private premierRatingListEl: HTMLDivElement;
    private premierRatingSummaryEl: HTMLDivElement;
    private shopStatusEl: HTMLDivElement;
    private shopGridEl: HTMLDivElement;
    private questDailyListEl: HTMLDivElement;
    private questWeeklyListEl: HTMLDivElement;
    private questDailyResetEl: HTMLSpanElement;
    private questWeeklyResetEl: HTMLSpanElement;
    private questStatusEl: HTMLDivElement;
    private achievementGridEl: HTMLDivElement;
    private titleListEl: HTMLDivElement;
    private colorListEl: HTMLDivElement;
    private frameListEl: HTMLDivElement;
    private achievementStatusEl: HTMLDivElement;
    private rewardsChipEl: HTMLSpanElement;
    private rewardWeekEl: HTMLSpanElement;
    private rewardResetEl: HTMLSpanElement;
    private rewardGridEl: HTMLDivElement;
    private rewardClaimBtn: HTMLButtonElement;
    private rewardStatusEl: HTMLDivElement;
    private playPremierValueEl: HTMLDivElement;
    private playPremierMetaEl: HTMLDivElement;
    private playMissionValueEl: HTMLDivElement;
    private playMissionMetaEl: HTMLDivElement;
    private playIdentityAvatarEl: HTMLDivElement;
    private playIdentityNameEl: HTMLDivElement;
    private playIdentityBadgeEl: HTMLDivElement;
    private playIdentityMetaEl: HTMLDivElement;
    private playStatGridEl: HTMLDivElement;
    private playLoadoutPreviewEl: HTMLDivElement;
    private playFocusPrimaryEl: HTMLDivElement;
    private playFocusSecondaryEl: HTMLDivElement;
    private chatLogEl: HTMLDivElement;
    private chatInputEl: HTMLInputElement;
    private chatSendBtn: HTMLButtonElement;
    private chatStatusEl: HTMLSpanElement;
    private chatEmojiRowEl: HTMLDivElement;

    private authFormEl: HTMLDivElement;
    private authSessionEl: HTMLDivElement;
    private authUserValueEl: HTMLSpanElement;
    private authStatusEl: HTMLDivElement;
    private usernameInputEl: HTMLInputElement;
    private passwordInputEl: HTMLInputElement;
    private shopSubtabRowEl: HTMLDivElement;

    private forboxModalHostEl: HTMLDivElement;
    private forboxModalBackdropEl: HTMLDivElement;
    private accountModalEl: HTMLDivElement;
    private squadModalEl: HTMLDivElement;
    private createGameModalEl: HTMLDivElement;
    private findGameModalEl: HTMLDivElement;
    private purchaseConfirmModalEl: HTMLDivElement;
    private accountDisplayNameEl: HTMLSpanElement;
    private accountStatsListEl: HTMLDivElement;
    private profileAliasInputEl: HTMLInputElement;
    private teamTagInputEl: HTMLInputElement;
    private accountAvatarListEl: HTMLDivElement;
    private accountTitleListEl: HTMLDivElement;
    private accountNameListEl: HTMLDivElement;
    private accountFrameListEl: HTMLDivElement;
    private accountFriendsStatusEl: HTMLDivElement;
    private accountFriendSearchInputEl: HTMLInputElement;
    private accountFriendSearchBtn: HTMLButtonElement;
    private accountFriendResultsEl: HTMLDivElement;
    private accountFriendsListEl: HTMLDivElement;
    private accountFriendsIncomingEl: HTMLDivElement;
    private accountFriendsOutgoingEl: HTMLDivElement;
    private squadSocialStatusEl: HTMLDivElement;
    private squadRoomSummaryEl: HTMLDivElement;
    private squadRoomCardEl: HTMLDivElement;
    private squadCreatePrivateBtn: HTMLButtonElement;
    private squadCreatePublicBtn: HTMLButtonElement;
    private squadPartyInputEl: HTMLInputElement;
    private squadPartyJoinBtn: HTMLButtonElement;
    private squadIncomingListEl: HTMLDivElement;
    private squadOutgoingListEl: HTMLDivElement;
    private squadGiftSummaryEl: HTMLDivElement;
    private squadMessageSummaryEl: HTMLDivElement;
    private socialTargetEl: HTMLDivElement;
    private socialGiftSelectEl: HTMLSelectElement;
    private socialGiftNoteEl: HTMLTextAreaElement;
    private socialGiftSendBtn: HTMLButtonElement;
    private socialGiftInboxEl: HTMLDivElement;
    private socialGiftSentEl: HTMLDivElement;
    private socialThreadsEl: HTMLDivElement;
    private socialThreadUserEl: HTMLDivElement;
    private socialDmLogEl: HTMLDivElement;
    private socialDmInputEl: HTMLInputElement;
    private socialDmSendBtn: HTMLButtonElement;
    private createGamePlayersEl: HTMLSelectElement;
    private createGameDurationEl: HTMLSelectElement;
    private createGameModeEl: HTMLSelectElement;
    private createGameFillBotsEl: HTMLInputElement;
    private createGameNameEl: HTMLInputElement;
    private findGameStatusEl: HTMLDivElement;
    private findGameListEl: HTMLDivElement;
    private findGameRefreshBtn: HTMLButtonElement;
    private purchaseConfirmTextEl: HTMLDivElement;
    private quickMatchOverlayEl: HTMLDivElement;
    private quickMatchCardEl: HTMLDivElement;

    private caseModalEl: HTMLDivElement;
    private caseModalTitleEl: HTMLDivElement;
    private caseModalPriceEl: HTMLSpanElement;
    private caseModalDropsEl: HTMLDivElement;
    private caseModalTrackEl: HTMLDivElement;
    private caseModalResultEl: HTMLDivElement;
    private caseModalArtEl: HTMLDivElement;
    private caseModalContextEl: HTMLDivElement;
    private caseModalOpenBtn: HTMLButtonElement;
    private caseModalCloseBtn: HTMLButtonElement;
    private weaponReviewModalEl: HTMLDivElement;
    private weaponReviewNameEl: HTMLDivElement;
    private weaponReviewMetaEl: HTMLDivElement;
    private weaponReviewArtEl: HTMLDivElement;
    private weaponReviewEquipBtn: HTMLButtonElement;
    private weaponReviewCloseBtn: HTMLButtonElement;

    private sessionToken: string | null = null;
    private currentUser: AuthUser | null = null;
    private shopOffers: ShopOffer[] = getStudioShopOffers();
    private caseCatalog: CaseCatalogItem[] = getStudioCaseCatalogItems();
    private weaponCatalog: WeaponCatalogItem[] = getStudioWeaponCatalogItems();

    private selectedCaseId: string | null = null;
    private selectedCaseOfferId: string | null = null;
    private caseSpinLocked = false;
    private pendingReviewSkin: SkinItem | null = null;
    private catalogLoaded = false;
    private catalogLoadingPromise: Promise<void> | null = null;
    private chatPollInterval: number | null = null;
    private chatPollInFlight = false;
    private chatCursor = 0;
    private chatBootstrapped = false;
    private chatRenderedIds = new Set<number>();
    private friendSearchResults: FriendEntry[] = [];
    private socialSnapshot: SocialSnapshot = JSON.parse(JSON.stringify(EMPTY_SOCIAL));
    private socialPollInterval: number | null = null;
    private socialPollInFlight = false;
    private activeDmUserId: string | null = null;
    private selectedSocialUserId: string | null = null;
    private dmThreadMessages: DirectMessageEntry[] = [];
    private pendingPartyJoinId: string | null = null;

    private skinMetaByName = new Map<string, { rarity: ItemRarity; slot?: string; weaponId?: string }>();
    private inventoryWeaponFilter = 'all';
    private inventoryFilterQuery = '';
    private loadoutPrimaryCategoryFilter = 'all';

    init(): void {
        this.buildBlocker();
        this.buildMainMenu();

        GameContext.GameView.Container.appendChild(GameContext.GameView.Renderer.domElement);
        GameContext.PointLock.pointLockListen();

        DomEventPipe.addEventListener(PointLockEvent.type, (e: CustomEvent) => {
            switch (e.detail.enum) {
                case PointLockEventEnum.LOCK:
                    this.blocker.style.display = 'none';
                    break;
                case PointLockEventEnum.UNLOCK:
                    if (this.gameStarted && !this.intermissionActive && !this.devPanelOpen) {
                        this.showPauseBlocker();
                    }
                    break;
            }
        });

        window.addEventListener('game:leaderboard-updated', () => {
            if (this.currentTab === 'leaderboard') this.renderLeaderboard();
        });

        window.addEventListener('game:round-intermission-start', () => {
            this.intermissionActive = true;
            this.blocker.style.display = 'none';
        });

        window.addEventListener('game:round-intermission-end', () => {
            this.intermissionActive = false;
        });

        window.addEventListener('game:open-main-menu', () => {
            this.openMainMenuState();
        });

        window.addEventListener('game:dev-panel-visibility', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as { open?: boolean };
            this.devPanelOpen = !!detail.open;
            if (this.devPanelOpen) this.blocker.style.display = 'none';
        });

        subscribeContentStudio((state) => {
            this.shopOffers = getStudioShopOffers();
            this.caseCatalog = getStudioCaseCatalogItems();
            this.weaponCatalog = getStudioWeaponCatalogItems();
            if (!this.currentUser) return;
            this.currentUser.loadout = {
                ...this.currentUser.loadout,
                primary: `${state.defaultLoadout?.primary || this.currentUser.loadout?.primary || FALLBACK_LOADOUT.primary}`,
                secondary: `${state.defaultLoadout?.secondary || this.currentUser.loadout?.secondary || FALLBACK_LOADOUT.secondary}`,
                knife: `${state.defaultLoadout?.knife || this.currentUser.loadout?.knife || FALLBACK_LOADOUT.knife}`,
            };
            if (this.mainMenu.style.display !== 'none') {
                this.renderInventory();
                this.renderShop();
            }
        });

        window.addEventListener('game:profile-updated', (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            if (!this.currentUser) return;
            if (typeof detail.wallet === 'number') this.currentUser.wallet = Math.max(0, Math.floor(detail.wallet));
            if (detail.stats && typeof detail.stats === 'object') {
                this.currentUser.stats = { ...this.currentUser.stats, ...detail.stats };
            }
            if (detail.premier && typeof detail.premier === 'object') {
                this.currentUser.premier = { ...this.currentUser.premier, ...detail.premier };
            }
            if (detail.loadout && typeof detail.loadout === 'object') {
                this.currentUser.loadout = { ...this.currentUser.loadout, ...detail.loadout };
            }
            if (detail.progression && typeof detail.progression === 'object') {
                this.currentUser.progression = { ...this.currentUser.progression, ...detail.progression };
            }
            this.refreshWallet();
            this.renderProgressionPanels();
        });

        GameContext.GameView.Container.appendChild(this.stats.dom);
        this.bootstrapOnlineState();
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        this.stats.update();
    }

    private buildBlocker() {
        this.blocker = document.createElement('div');
        this.blocker.id = 'blocker';
        this.blocker.style.display = 'none';

        this.instructions = document.createElement('div');
        this.instructions.id = 'instructions';
        this.instructions.innerHTML = `
            <div class="pause-menu-card">
                <h3>PAUSED</h3>
                <p>ESC pressed. Resume game or return to main menu.</p>
                <div class="pause-menu-actions">
                    <button id="pause-resume-btn">RESUME</button>
                    <button id="pause-main-menu-btn">MAIN MENU</button>
                </div>
            </div>
        `;

        this.blocker.appendChild(this.instructions);

        this.pauseResumeBtn = this.instructions.querySelector('#pause-resume-btn') as HTMLButtonElement;
        this.pauseMainMenuBtn = this.instructions.querySelector('#pause-main-menu-btn') as HTMLButtonElement;

        this.pauseResumeBtn.addEventListener('click', () => {
            this.resumeGameplay();
        });

        this.pauseMainMenuBtn.addEventListener('click', () => {
            this.returnToMainMenu();
        });

        GameContext.GameView.Container.appendChild(this.blocker);
    }

    private buildMainMenu() {
        this.mainMenu = document.createElement('div');
        this.mainMenu.id = 'main-menu';
        this.mainMenu.innerHTML = `
            <div class="menu-backdrop"></div>
            <div class="menu-shell menu-shell-cs2 forbox-shell">
                <aside class="forbox-left-rail">
                    <div class="forbox-brand">
                        <img class="forbox-logo-img" src="${forboxLogoUrl}" alt="forbox.io"/>
                        <div class="forbox-brand-subtitle">AGENTS OF THE NEW ERA</div>
                    </div>
                    <nav class="menu-tabs menu-tabs-cs2 forbox-side-nav">
                        <button class="menu-tab active" data-tab="play">PLAY</button>
                        <button class="menu-tab" data-tab="inventory">INVENTORY</button>
                        <button class="menu-tab" data-tab="shop">SHOP <span class="forbox-chip">2</span></button>
                        <button class="menu-tab" data-tab="leaderboard">LEADERBOARD</button>
                        <button class="menu-tab" data-tab="rewards">REWARDS <span class="forbox-chip hidden" id="forbox-rewards-chip">1</span></button>
                        <button class="menu-tab" data-tab="missions">MISSIONS <span class="forbox-chip">2</span></button>
                    </nav>
                    <div class="forbox-side-ad">
                        <div class="forbox-ad-label">Operation Brief</div>
                        <div class="forbox-ad-title">Premier Season Live</div>
                        <div class="forbox-ad-sub">Queue, place high, and turn weekly progression into long-season status.</div>
                    </div>
                    <div class="forbox-terms">Terms | Privacy | Contact</div>
                </aside>

                <div class="forbox-main">
                <header class="menu-topbar menu-topbar-cs2 forbox-topbar">
                    <div class="forbox-topbar-center">
                        <div class="forbox-top-chips">
                            <button class="forbox-top-chip" type="button">Live Drop <span>Daily Case</span></button>
                            <button class="forbox-top-chip" type="button">Squad Room <span id="forbox-squad-room-chip">0/4</span></button>
                            <button class="forbox-top-chip" id="forbox-open-squad" type="button">Invite Squad <span class="hidden" id="forbox-open-squad-chip">0</span></button>
                        </div>
                    </div>
                    <div class="menu-account-cs2 forbox-account-cs2">
                        <div class="forbox-top-wallet-row">
                            <div class="menu-top-wallet">FORBOX POINTS <span id="menu-top-wallet-value">----</span></div>
                            <button class="forbox-gear-btn" type="button" aria-label="settings">&#9881;</button>
                        </div>
                        <div class="menu-account-auth" id="menu-auth-form">
                            <input id="auth-username" type="text" maxlength="20" placeholder="username" autocomplete="off"/>
                            <input id="auth-password" type="password" maxlength="64" placeholder="password"/>
                            <div class="menu-account-actions">
                                <button id="auth-login-btn">SIGN IN</button>
                                <button id="auth-register-btn">REGISTER</button>
                            </div>
                        </div>
                        <div class="menu-account-session hidden" id="menu-auth-session">
                            <span id="auth-user-value"></span>
                            <div class="forbox-session-actions">
                                <button id="forbox-open-account">ACCOUNT</button>
                                <button id="auth-logout-btn">SIGN OUT</button>
                            </div>
                        </div>
                        <div class="menu-account-status" id="auth-status">Connecting...</div>
                    </div>
                </header>

                <section class="menu-panel active" data-panel="play">
                    <div class="forbox-play-command">
                        <div class="forbox-free-case-card">
                            <div class="forbox-free-case-title">SUPPLY DROP</div>
                            <div class="forbox-free-case-desc">Daily rewards, missions, and strong placements feed your next case chance.</div>
                        </div>
                        <div class="forbox-play-status-grid">
                            <div class="forbox-play-status-card">
                                <div class="forbox-play-status-label">Queue</div>
                                <div class="forbox-play-status-value">5 MIN FFA</div>
                                <div class="forbox-play-status-meta">Solo queue, fast start, and placement plus kills reward FP every round.</div>
                            </div>
                            <div class="forbox-play-status-card">
                                <div class="forbox-play-status-label">Premier</div>
                                <div class="forbox-play-status-value premier-unranked" id="play-premier-value">UNRANKED</div>
                                <div class="forbox-play-status-meta" id="play-premier-meta">Play calibration matches to appear on the current season ladder.</div>
                            </div>
                            <div class="forbox-play-status-card">
                                <div class="forbox-play-status-label">Mission Focus</div>
                                <div class="forbox-play-status-value" id="play-mission-value">LOGIN REQUIRED</div>
                                <div class="forbox-play-status-meta" id="play-mission-meta">Daily and weekly objectives will surface here once your profile is online.</div>
                            </div>
                        </div>
                    </div>
                    <div class="menu-play-layout menu-play-layout-cs2 forbox-play-layout">
                        <div class="menu-play-main">
                            <div class="menu-character-card">
                                <div class="forbox-operator-identity">
                                    <div class="forbox-operator-avatar" id="play-identity-avatar"></div>
                                    <div class="forbox-operator-copy">
                                        <div class="forbox-operator-kicker">Current Operator</div>
                                        <div class="forbox-operator-name-row">
                                            <div class="menu-character-title" id="play-identity-name">GUEST OPERATOR</div>
                                            <div class="menu-character-meta" id="play-identity-badge">UNASSIGNED</div>
                                        </div>
                                        <div class="forbox-operator-sub" id="play-identity-meta">Login to sync your profile, cosmetics, and seasonal progress.</div>
                                    </div>
                                </div>
                                <img class="menu-character-image" src="/role/role.TF2.heavy.png" alt="Current Character"/>
                                <div class="forbox-play-stat-grid" id="forbox-play-stat-grid"></div>
                                <div class="forbox-play-loadout" id="forbox-play-loadout"></div>
                            </div>
                        </div>
                        <div class="menu-play-aside">
                            <div class="menu-play-side">
                                <div class="menu-ffa-box menu-ffa-box-cs2">
                                    <div class="forbox-queue-kicker">Combat Queue</div>
                                    <h3>PLAY NOW</h3>
                                    <p>Jump into a 5-minute free-for-all. Every match moves your quests, rewards, and current season standing.</p>
                                    <div class="forbox-play-queue-facts">
                                        <span>5 MINUTES</span>
                                        <span>SOLO FFA</span>
                                        <span>SEASON RATING LIVE</span>
                                    </div>
                                    <button class="menu-play-now" id="menu-play-now">PLAY</button>
                                    <div class="forbox-play-secondary-actions">
                                        <button id="forbox-find-game-btn">FIND GAME</button>
                                        <button id="forbox-create-game-btn">CREATE GAME</button>
                                    </div>
                                </div>
                                <div class="forbox-play-brief-card">
                                    <div class="forbox-play-brief-head">Next Objective</div>
                                    <div class="forbox-play-brief-value" id="play-focus-primary">Sign in to queue and sync progression.</div>
                                    <div class="forbox-play-brief-copy" id="play-focus-secondary">Titles, avatars, frames, and season standing update here after each match.</div>
                                </div>
                            </div>
                            <aside class="forbox-right-panel">
                                <div class="forbox-play-brief-card forbox-play-brief-card--comms">
                                    <div class="forbox-play-brief-head">Lobby Comms</div>
                                    <div class="forbox-play-brief-copy">Quick callouts stay thumb-friendly on mobile, while full chat remains visible without crowding the queue area.</div>
                                </div>
                                <div class="forbox-chat-card">
                                    <div class="forbox-chat-head">
                                        <span>CHAT</span>
                                        <span id="forbox-chat-status">Connecting...</span>
                                    </div>
                                    <div class="forbox-chat-log" id="forbox-chat-log">
                                        <div class="forbox-chat-placeholder">Lobby chat loading...</div>
                                    </div>
                                    <div class="forbox-chat-emoji-row" id="forbox-chat-emoji-row">
                                        <button type="button" data-emoji="GLHF">GLHF</button>
                                        <button type="button" data-emoji="NT">NT</button>
                                        <button type="button" data-emoji="Rush A">Rush A</button>
                                        <button type="button" data-emoji="Rush B">Rush B</button>
                                        <button type="button" data-emoji="Hold">Hold</button>
                                        <button type="button" data-emoji="Eco">Eco</button>
                                        <button type="button" data-emoji="Clutch">Clutch</button>
                                        <button type="button" data-emoji="GG">GG</button>
                                    </div>
                                    <div class="forbox-chat-input-row">
                                        <input
                                            id="forbox-chat-input"
                                            class="forbox-chat-input"
                                            type="text"
                                            maxlength="220"
                                            autocomplete="off"
                                            spellcheck="false"
                                            placeholder="Type message..."
                                        />
                                        <button id="forbox-chat-send" type="button">SEND</button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </section>

                <section class="menu-panel" data-panel="inventory">
                    <div class="forbox-inventory-layout">
                        <div class="forbox-inventory-content">
                            <div class="menu-section-title">INVENTORY</div>
                            <div class="forbox-inventory-toolbar">
                                <div>
                                    <div class="menu-subheading">WEAPON BROWSER</div>
                                    <div class="forbox-inventory-toolbar-copy">Select a weapon. Matching skins will load below.</div>
                                </div>
                                <input id="inventory-filter-input" class="forbox-filter-input" type="text" placeholder="Search selected weapon skins..." />
                            </div>
                            <div class="forbox-weapon-browser" id="inventory-filter-buttons"></div>
                            <div class="menu-inventory-head">
                                <div id="inventory-info">Login required</div>
                            </div>
                            <div class="forbox-inventory-callout" id="inventory-cases"></div>
                            <div class="menu-subheading">SKINS</div>
                            <div class="menu-skin-grid" id="inventory-skins"></div>
                            <div class="menu-inline-msg" id="inventory-msg"></div>
                        </div>
                    </div>
                </section>

                <section class="menu-panel" data-panel="shop">
                    <div class="menu-section-title">SHOP</div>
                    <div class="forbox-shop-subtabs" id="forbox-shop-subtabs">
                        <button class="forbox-shop-subtab active" data-shop-tab="case">CASES</button>
                    </div>
                    <div class="forbox-shop-cases-note">Case economy is live. Direct weapon or emote purchase stays offline in this phase.</div>
                    <div class="menu-shop-head">Balance: <span id="menu-wallet-value">----</span></div>
                    <div class="menu-shop-grid forbox-shop-grid" id="menu-shop-grid"></div>
                    <div class="menu-inline-msg" id="shop-msg"></div>
                </section>

                <section class="menu-panel" data-panel="leaderboard">
                    <div class="menu-section-title">LEADERBOARD</div>
                    <div class="forbox-leaderboard-layout">
                        <div class="forbox-leaderboard-main">
                            <div class="menu-leader-filters">
                                <div class="menu-filter-stack">
                                    <div class="menu-filter-label">VIEW</div>
                                    <div class="menu-filter-group" id="board-view-group">
                                        <button class="filter-btn active" data-view="stats">Stats</button>
                                        <button class="filter-btn" data-view="premier">Premier Rating</button>
                                    </div>
                                </div>
                                <div class="menu-filter-stack" id="leaderboard-stats-controls">
                                    <div class="menu-filter-label">METRIC</div>
                                    <div class="menu-filter-group" id="board-metric-group">
                                        <button class="filter-btn active" data-metric="kills">Kills</button>
                                        <button class="filter-btn" data-metric="wins">Wins</button>
                                    </div>
                                    <div class="menu-filter-label" style="margin-top:8px;">PERIOD</div>
                                    <div class="menu-filter-group" id="board-period-group">
                                        <button class="filter-btn active" data-period="daily">Daily</button>
                                        <button class="filter-btn" data-period="weekly">Weekly</button>
                                        <button class="filter-btn" data-period="all">All</button>
                                    </div>
                                </div>
                            </div>
                            <div id="leaderboard-stats-panel">
                                <div class="menu-leader-head">
                                    <span id="leaderboard-header"></span>
                                    <span id="leaderboard-reset" class="leaderboard-reset"></span>
                                </div>
                                <div class="menu-leader-list" id="leaderboard-list"></div>
                            </div>
                            <div id="leaderboard-premier-panel" class="hidden">
                                <div class="menu-leader-head">
                                    <span id="premier-season-header"></span>
                                    <span id="premier-season-reset" class="leaderboard-reset"></span>
                                </div>
                                <div class="forbox-premier-season-meta" id="premier-season-meta"></div>
                                <div class="forbox-premier-list forbox-premier-list--main" id="premier-rating-list"></div>
                            </div>
                        </div>
                        <aside class="forbox-leaderboard-side">
                            <div class="menu-ranks-panel">
                                <div class="menu-ranks-title">Premier Rating</div>
                                <div class="forbox-premier-caption">Seasons reset every 3 months. Ranked players are ordered by current season rating.</div>
                                <div class="rank-bar rank-silver">&lt; 4,999</div>
                                <div class="rank-bar rank-cyan">5,000 - 9,999</div>
                                <div class="rank-bar rank-blue">10,000 - 14,999</div>
                                <div class="rank-bar rank-purple">15,000 - 19,999</div>
                                <div class="rank-bar rank-pink">20,000 - 24,999</div>
                                <div class="rank-bar rank-red">25,000 - 29,999</div>
                                <div class="rank-bar rank-gold">30,000+</div>
                                <div class="forbox-premier-summary" id="premier-rating-summary">Premier season summary will appear here.</div>
                            </div>
                        </aside>
                    </div>
                </section>

                <section class="menu-panel" data-panel="rewards">
                    <div class="menu-section-title">WEEKLY LOGIN REWARDS</div>
                    <div class="forbox-reward-meta-row">
                        <span id="forbox-reward-week">Week: --</span>
                        <span id="forbox-reward-reset">Reset in --:--:--</span>
                    </div>
                    <div class="forbox-reward-grid" id="forbox-reward-grid"></div>
                    <div class="forbox-reward-claim-row">
                        <button class="menu-play-now forbox-reward-claim-btn" id="forbox-reward-claim-btn">CLAIM TODAY REWARD</button>
                    </div>
                    <div class="menu-inline-msg" id="forbox-reward-msg"></div>
                    <div class="forbox-reward-note">
                        Monday starts the cycle, Sunday ends it. Missed days cannot be claimed later.
                    </div>
                </section>

                <section class="menu-panel" data-panel="missions">
                    <div class="menu-section-title">MISSIONS</div>
                    <div class="forbox-missions-layout">
                        <div class="forbox-missions-column">
                            <div class="menu-subheading">DAILY & WEEKLY QUESTS</div>
                            <div class="menu-quests-panel">
                                <div class="menu-quests-head">
                                    <span>Daily Quests</span>
                                    <span id="quest-daily-reset">--:--:--</span>
                                </div>
                                <div class="menu-quests-list" id="quest-daily-list"></div>
                                <div class="menu-quests-head">
                                    <span>Weekly Quests</span>
                                    <span id="quest-weekly-reset">--:--:--</span>
                                </div>
                                <div class="menu-quests-list" id="quest-weekly-list"></div>
                                <div class="menu-inline-msg" id="quest-msg"></div>
                            </div>
                        </div>
                        <div class="forbox-missions-column">
                            <div class="menu-subheading">ACHIEVEMENTS</div>
                            <div class="menu-achievement-grid" id="achievement-grid"></div>
                            <div class="menu-subheading">TITLE & NAMEPLATE</div>
                            <div class="menu-cosmetic-grid">
                                <div class="menu-cosmetic-slot">
                                    <div class="menu-cosmetic-title">TITLE</div>
                                    <div class="menu-cosmetic-options" id="title-options"></div>
                                </div>
                                <div class="menu-cosmetic-slot">
                                    <div class="menu-cosmetic-title">NAME COLOR</div>
                                    <div class="menu-cosmetic-options" id="name-color-options"></div>
                                </div>
                                <div class="menu-cosmetic-slot">
                                    <div class="menu-cosmetic-title">AVATAR FRAME</div>
                                    <div class="menu-cosmetic-options" id="avatar-frame-options"></div>
                                </div>
                            </div>
                            <div class="menu-inline-msg" id="achievement-msg"></div>
                        </div>
                    </div>
                </section>

                <div class="forbox-bottom-banner">Premier Season Live | Weekly Missions Active | Mobile Browser Ready</div>
                </div>
            </div>

            <div class="case-modal hidden" id="case-modal">
                <div class="case-modal-backdrop" id="case-modal-backdrop"></div>
                <div class="case-modal-shell">
                    <div class="case-modal-head">
                        <div>
                            <div class="case-modal-title" id="case-modal-title">CASE</div>
                            <div class="case-modal-price">PRICE: <span id="case-modal-price">0</span> FP</div>
                        </div>
                        <button class="case-modal-close" id="case-modal-close">X</button>
                    </div>
                    <div class="case-modal-art" id="case-modal-art"></div>
                    <div class="case-modal-context" id="case-modal-context">Inspect drops, then buy and open.</div>
                    <div class="case-modal-drops" id="case-modal-drops"></div>
                    <div class="case-reel-wrap">
                        <div class="case-reel-pointer"></div>
                        <div class="case-reel-viewport" id="case-reel-viewport">
                            <div class="case-reel-track" id="case-reel-track"></div>
                        </div>
                    </div>
                    <div class="case-modal-actions">
                        <button class="case-open-btn" id="case-open-btn">BUY & OPEN CASE</button>
                    </div>
                    <div class="case-modal-result" id="case-modal-result"></div>
                </div>
            </div>

            <div class="weapon-review-modal hidden" id="weapon-review-modal">
                <div class="weapon-review-backdrop" id="weapon-review-backdrop"></div>
                <div class="weapon-review-shell">
                    <div class="weapon-review-head">
                        <div class="weapon-review-title">WEAPON REVIEW</div>
                        <button class="weapon-review-close" id="weapon-review-close">X</button>
                    </div>
                    <div class="weapon-review-art" id="weapon-review-art"></div>
                    <div class="weapon-review-name" id="weapon-review-name">UNKNOWN</div>
                    <div class="weapon-review-meta" id="weapon-review-meta">RARITY | SLOT</div>
                    <div class="weapon-review-actions">
                        <button class="weapon-review-equip" id="weapon-review-equip">EQUIP</button>
                        <button class="weapon-review-dismiss" id="weapon-review-dismiss">CLOSE</button>
                    </div>
                </div>
            </div>

            <div class="forbox-modal-host hidden" id="forbox-modal-host">
                <div class="forbox-modal-backdrop" id="forbox-modal-backdrop"></div>
                <div class="forbox-modal forbox-account-modal hidden" id="forbox-account-modal">
                    <h3>ACCOUNT</h3>
                    <p class="forbox-account-subtitle">Stats for <span id="forbox-account-display-name">GUEST</span></p>
                    <div class="forbox-account-grid">
                        <div class="forbox-account-stats" id="forbox-account-stats-list"></div>
                        <div class="forbox-account-edit">
                            <label>Display Name
                                <input id="forbox-account-username-input" type="text" maxlength="20" placeholder="type your username..." />
                            </label>
                            <label>Team Tag
                                <input id="forbox-account-teamtag-input" type="text" maxlength="4" placeholder="type your team tag..." />
                            </label>
                            <div class="forbox-account-cosmetics">
                                <div class="menu-cosmetic-slot">
                                    <div class="menu-cosmetic-title">AVATAR</div>
                                    <div class="menu-cosmetic-options menu-cosmetic-options--avatars" id="forbox-account-avatar-options"></div>
                                </div>
                                <div class="menu-cosmetic-slot">
                                    <div class="menu-cosmetic-title">TITLE</div>
                                    <div class="menu-cosmetic-options" id="forbox-account-title-options"></div>
                                </div>
                                <div class="menu-cosmetic-slot">
                                    <div class="menu-cosmetic-title">NAME</div>
                                    <div class="menu-cosmetic-options" id="forbox-account-name-options"></div>
                                </div>
                                <div class="menu-cosmetic-slot">
                                    <div class="menu-cosmetic-title">FRAME</div>
                                    <div class="menu-cosmetic-options" id="forbox-account-frame-options"></div>
                                </div>
                            </div>
                            <div class="forbox-account-actions">
                                <button id="forbox-account-clear-tag" type="button">REMOVE TEAM TAG</button>
                                <button id="forbox-account-save" class="ok" type="button">SAVE ACCOUNT</button>
                            </div>
                        </div>
                    </div>
                    <div class="forbox-modal-actions forbox-modal-actions-single">
                        <button data-modal-cancel type="button">CLOSE</button>
                    </div>
                </div>
                <div class="forbox-modal forbox-squad-modal hidden" id="forbox-squad-modal">
                    <h3>INVITE SQUAD</h3>
                    <p>Manage your friend list, pending requests, and online squad before you queue.</p>
                    <div class="menu-inline-msg forbox-squad-inline-msg" id="forbox-squad-social-status"></div>
                    <div class="forbox-social-grid">
                        <div class="forbox-social-main">
                            <div class="forbox-social-summary">
                                <div class="forbox-social-summary-card">
                                    <div class="forbox-play-brief-head">Squad Room</div>
                                    <div class="forbox-social-summary-value" id="forbox-squad-room-summary">No active room.</div>
                                    <div class="forbox-social-summary-copy">Invite a friend to start a room or accept an incoming room invite.</div>
                                </div>
                                <div class="forbox-social-summary-card">
                                    <div class="forbox-play-brief-head">Gift Queue</div>
                                    <div class="forbox-social-summary-value" id="forbox-squad-gift-summary">0 claimable gifts</div>
                                    <div class="forbox-social-summary-copy">Send FP or case packages to friends and claim incoming rewards here.</div>
                                </div>
                                <div class="forbox-social-summary-card">
                                    <div class="forbox-play-brief-head">Private Msg</div>
                                    <div class="forbox-social-summary-value" id="forbox-squad-message-summary">0 unread messages</div>
                                    <div class="forbox-social-summary-copy">Open a direct thread with any online friend and keep queue comms private.</div>
                                </div>
                            </div>
                            <div class="forbox-account-friends forbox-squad-friends">
                                <div class="forbox-account-friends-head">
                                    <div class="menu-subheading">FRIENDS</div>
                                    <div class="menu-inline-msg" id="forbox-account-friends-status"></div>
                                </div>
                                <div class="forbox-account-friend-search">
                                    <input id="forbox-account-friend-search" type="text" maxlength="20" placeholder="search username..." />
                                    <button id="forbox-account-friend-search-btn" type="button">FIND PLAYER</button>
                                </div>
                                <div class="forbox-account-friend-results" id="forbox-account-friend-results"></div>
                                <div class="forbox-account-friend-columns">
                                    <div class="forbox-account-friend-column forbox-account-friend-column--wide">
                                        <div class="menu-cosmetic-title">FRIEND LIST</div>
                                        <div class="forbox-account-friend-list" id="forbox-account-friends-list"></div>
                                    </div>
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title">REQUESTS</div>
                                        <div class="forbox-account-friend-list" id="forbox-account-friends-incoming"></div>
                                    </div>
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title">SENT</div>
                                        <div class="forbox-account-friend-list" id="forbox-account-friends-outgoing"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <aside class="forbox-social-side">
                            <div class="forbox-social-panel">
                                <div class="forbox-account-friends-head">
                                    <div class="menu-subheading">ROOM INVITES</div>
                                </div>
                                <div class="forbox-social-room-card" id="forbox-squad-room-card"></div>
                                <div class="forbox-social-room-toolbar">
                                    <div class="forbox-social-room-actions">
                                        <button id="forbox-squad-create-private" type="button">PRIVATE ROOM</button>
                                        <button id="forbox-squad-create-public" type="button">PUBLIC ROOM</button>
                                    </div>
                                    <div class="forbox-social-party-join">
                                        <input id="forbox-squad-party-id-input" type="text" maxlength="10" placeholder="enter party id..." />
                                        <button id="forbox-squad-party-id-join" type="button">JOIN PARTY</button>
                                    </div>
                                </div>
                                <div class="forbox-social-dual">
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title">INCOMING</div>
                                        <div class="forbox-account-friend-list" id="forbox-squad-incoming-list"></div>
                                    </div>
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title">OUTGOING</div>
                                        <div class="forbox-account-friend-list" id="forbox-squad-outgoing-list"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="forbox-social-panel">
                                <div class="forbox-account-friends-head">
                                    <div class="menu-subheading">GIFT RELAY</div>
                                </div>
                                <div class="forbox-social-target" id="forbox-social-target">Select a friend from the list to prepare a gift or open a direct thread.</div>
                                <div class="forbox-social-compose">
                                    <label>Gift Package
                                        <select id="forbox-social-gift-select"></select>
                                    </label>
                                    <label>Gift Note
                                        <textarea id="forbox-social-gift-note" maxlength="120" placeholder="optional note for your friend"></textarea>
                                    </label>
                                    <button id="forbox-social-gift-send" class="ok" type="button">SEND GIFT</button>
                                </div>
                                <div class="forbox-social-dual">
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title">INBOX</div>
                                        <div class="forbox-account-friend-list" id="forbox-social-gift-inbox"></div>
                                    </div>
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title">SENT</div>
                                        <div class="forbox-account-friend-list" id="forbox-social-gift-sent"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="forbox-social-panel">
                                <div class="forbox-account-friends-head">
                                    <div class="menu-subheading">PRIVATE MESSAGES</div>
                                </div>
                                <div class="forbox-social-dual forbox-social-dual--messages">
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title">THREADS</div>
                                        <div class="forbox-account-friend-list" id="forbox-social-threads"></div>
                                    </div>
                                    <div class="forbox-account-friend-column">
                                        <div class="menu-cosmetic-title" id="forbox-social-thread-user">NO THREAD SELECTED</div>
                                        <div class="forbox-social-dm-log" id="forbox-social-dm-log"></div>
                                        <div class="forbox-social-dm-compose">
                                            <input id="forbox-social-dm-input" type="text" maxlength="240" placeholder="send a private message..." />
                                            <button id="forbox-social-dm-send" type="button">SEND</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="forbox-modal-actions forbox-modal-actions-single">
                        <button data-modal-cancel type="button">CLOSE</button>
                    </div>
                </div>
                <div class="forbox-modal hidden" id="forbox-create-game-modal">
                    <h3>Create Match</h3>
                    <p>Set up a quick combat room. FFA is live now, other modes stay staged here.</p>
                    <div class="forbox-form-grid">
                        <label>Max Players<select id="forbox-create-players"><option value="4">4 players</option><option value="6">6 players</option><option value="8">8 players</option></select></label>
                        <label>Game Duration<select id="forbox-create-duration"><option value="120">2 minutes</option><option value="300" selected>5 minutes</option><option value="600">10 minutes</option></select></label>
                        <label>Game Mode<select id="forbox-create-mode"><option value="ffa" selected>Free For All</option><option value="tdm">Team Deathmatch</option></select></label>
                        <label>Fill With Bots<input id="forbox-create-bots" type="checkbox" checked /></label>
                        <label class="forbox-wide">Lobby Name<input id="forbox-create-name" type="text" maxlength="24" placeholder="enter lobby name..." /></label>
                    </div>
                    <div class="forbox-modal-actions">
                        <button data-modal-cancel type="button">CANCEL</button>
                        <button id="forbox-create-confirm" class="ok" type="button">CREATE GAME</button>
                    </div>
                </div>
                <div class="forbox-modal hidden" id="forbox-find-game-modal">
                    <h3>Find Match</h3>
                    <p>Browse public online rooms and join by party id.</p>
                    <div class="menu-inline-msg" id="forbox-find-game-status">Loading public rooms...</div>
                    <div class="forbox-modal-actions">
                        <button id="forbox-find-game-refresh" type="button">REFRESH</button>
                    </div>
                    <div class="forbox-account-friend-list" id="forbox-find-game-list"></div>
                    <div class="forbox-modal-actions">
                        <button data-modal-cancel type="button">CLOSE</button>
                    </div>
                </div>
                <div class="forbox-modal hidden" id="forbox-purchase-modal">
                    <h3>Confirm Purchase</h3>
                    <p id="forbox-purchase-text">Are you sure you want to purchase this item?</p>
                    <div class="forbox-modal-actions">
                        <button data-modal-cancel type="button">CANCEL</button>
                        <button id="forbox-purchase-confirm" class="ok" type="button">OKAY</button>
                    </div>
                </div>
            </div>
        `;

        GameContext.GameView.Container.appendChild(this.mainMenu);
        this.quickMatchOverlayEl = document.createElement('div');
        this.quickMatchOverlayEl.className = 'forbox-modal-host hidden';
        this.quickMatchOverlayEl.innerHTML = '<div class="forbox-modal-backdrop"></div>';
        this.quickMatchCardEl = document.createElement('div');
        this.quickMatchCardEl.className = 'forbox-modal';
        this.quickMatchOverlayEl.appendChild(this.quickMatchCardEl);
        GameContext.GameView.Container.appendChild(this.quickMatchOverlayEl);
        this.quickMatchOverlayEl.querySelector('.forbox-modal-backdrop')?.addEventListener('click', () => {
            this.hideQuickMatchOverlay();
        });

        this.walletValueEl = this.mainMenu.querySelector('#menu-wallet-value') as HTMLSpanElement;
        this.topWalletValueEl = this.mainMenu.querySelector('#menu-top-wallet-value') as HTMLSpanElement;
        this.inventoryFilterInputEl = this.mainMenu.querySelector('#inventory-filter-input') as HTMLInputElement;
        this.inventoryFilterButtonsEl = this.mainMenu.querySelector('#inventory-filter-buttons') as HTMLDivElement;
        this.inventoryInfoEl = this.mainMenu.querySelector('#inventory-info') as HTMLDivElement;
        this.inventoryCasesEl = this.mainMenu.querySelector('#inventory-cases') as HTMLDivElement;
        this.inventorySkinsEl = this.mainMenu.querySelector('#inventory-skins') as HTMLDivElement;
        this.inventoryMessageEl = this.mainMenu.querySelector('#inventory-msg') as HTMLDivElement;
        this.loadoutPrimaryEl = this.mainMenu.querySelector('#loadout-primary-options') as HTMLDivElement;
        this.loadoutSecondaryEl = this.mainMenu.querySelector('#loadout-secondary-options') as HTMLDivElement;
        this.loadoutKnifeEl = this.mainMenu.querySelector('#loadout-knife-options') as HTMLDivElement;
        this.loadoutMessageEl = this.mainMenu.querySelector('#loadout-msg') as HTMLDivElement;
        this.leaderboardListEl = this.mainMenu.querySelector('#leaderboard-list') as HTMLDivElement;
        this.leaderboardHeaderEl = this.mainMenu.querySelector('#leaderboard-header') as HTMLSpanElement;
        this.leaderboardResetEl = this.mainMenu.querySelector('#leaderboard-reset') as HTMLSpanElement;
        this.leaderboardStatsControlsEl = this.mainMenu.querySelector('#leaderboard-stats-controls') as HTMLDivElement;
        this.leaderboardStatsPanelEl = this.mainMenu.querySelector('#leaderboard-stats-panel') as HTMLDivElement;
        this.leaderboardPremierPanelEl = this.mainMenu.querySelector('#leaderboard-premier-panel') as HTMLDivElement;
        this.premierSeasonHeaderEl = this.mainMenu.querySelector('#premier-season-header') as HTMLSpanElement;
        this.premierSeasonResetEl = this.mainMenu.querySelector('#premier-season-reset') as HTMLSpanElement;
        this.premierSeasonMetaEl = this.mainMenu.querySelector('#premier-season-meta') as HTMLDivElement;
        this.premierRatingListEl = this.mainMenu.querySelector('#premier-rating-list') as HTMLDivElement;
        this.premierRatingSummaryEl = this.mainMenu.querySelector('#premier-rating-summary') as HTMLDivElement;
        this.shopStatusEl = this.mainMenu.querySelector('#shop-msg') as HTMLDivElement;
        this.shopGridEl = this.mainMenu.querySelector('#menu-shop-grid') as HTMLDivElement;
        this.questDailyListEl = this.mainMenu.querySelector('#quest-daily-list') as HTMLDivElement;
        this.questWeeklyListEl = this.mainMenu.querySelector('#quest-weekly-list') as HTMLDivElement;
        this.questDailyResetEl = this.mainMenu.querySelector('#quest-daily-reset') as HTMLSpanElement;
        this.questWeeklyResetEl = this.mainMenu.querySelector('#quest-weekly-reset') as HTMLSpanElement;
        this.questStatusEl = this.mainMenu.querySelector('#quest-msg') as HTMLDivElement;
        this.achievementGridEl = this.mainMenu.querySelector('#achievement-grid') as HTMLDivElement;
        this.titleListEl = this.mainMenu.querySelector('#title-options') as HTMLDivElement;
        this.colorListEl = this.mainMenu.querySelector('#name-color-options') as HTMLDivElement;
        this.frameListEl = this.mainMenu.querySelector('#avatar-frame-options') as HTMLDivElement;
        this.achievementStatusEl = this.mainMenu.querySelector('#achievement-msg') as HTMLDivElement;
        this.rewardsChipEl = this.mainMenu.querySelector('#forbox-rewards-chip') as HTMLSpanElement;
        this.rewardWeekEl = this.mainMenu.querySelector('#forbox-reward-week') as HTMLSpanElement;
        this.rewardResetEl = this.mainMenu.querySelector('#forbox-reward-reset') as HTMLSpanElement;
        this.rewardGridEl = this.mainMenu.querySelector('#forbox-reward-grid') as HTMLDivElement;
        this.rewardClaimBtn = this.mainMenu.querySelector('#forbox-reward-claim-btn') as HTMLButtonElement;
        this.rewardStatusEl = this.mainMenu.querySelector('#forbox-reward-msg') as HTMLDivElement;
        this.squadRoomChipEl = this.mainMenu.querySelector('#forbox-squad-room-chip') as HTMLSpanElement;
        this.openSquadChipEl = this.mainMenu.querySelector('#forbox-open-squad-chip') as HTMLSpanElement;
        this.playPremierValueEl = this.mainMenu.querySelector('#play-premier-value') as HTMLDivElement;
        this.playPremierMetaEl = this.mainMenu.querySelector('#play-premier-meta') as HTMLDivElement;
        this.playMissionValueEl = this.mainMenu.querySelector('#play-mission-value') as HTMLDivElement;
        this.playMissionMetaEl = this.mainMenu.querySelector('#play-mission-meta') as HTMLDivElement;
        this.playIdentityAvatarEl = this.mainMenu.querySelector('#play-identity-avatar') as HTMLDivElement;
        this.playIdentityNameEl = this.mainMenu.querySelector('#play-identity-name') as HTMLDivElement;
        this.playIdentityBadgeEl = this.mainMenu.querySelector('#play-identity-badge') as HTMLDivElement;
        this.playIdentityMetaEl = this.mainMenu.querySelector('#play-identity-meta') as HTMLDivElement;
        this.playStatGridEl = this.mainMenu.querySelector('#forbox-play-stat-grid') as HTMLDivElement;
        this.playLoadoutPreviewEl = this.mainMenu.querySelector('#forbox-play-loadout') as HTMLDivElement;
        this.playFocusPrimaryEl = this.mainMenu.querySelector('#play-focus-primary') as HTMLDivElement;
        this.playFocusSecondaryEl = this.mainMenu.querySelector('#play-focus-secondary') as HTMLDivElement;
        this.chatLogEl = this.mainMenu.querySelector('#forbox-chat-log') as HTMLDivElement;
        this.chatInputEl = this.mainMenu.querySelector('#forbox-chat-input') as HTMLInputElement;
        this.chatSendBtn = this.mainMenu.querySelector('#forbox-chat-send') as HTMLButtonElement;
        this.chatStatusEl = this.mainMenu.querySelector('#forbox-chat-status') as HTMLSpanElement;
        this.chatEmojiRowEl = this.mainMenu.querySelector('#forbox-chat-emoji-row') as HTMLDivElement;

        this.authFormEl = this.mainMenu.querySelector('#menu-auth-form') as HTMLDivElement;
        this.authSessionEl = this.mainMenu.querySelector('#menu-auth-session') as HTMLDivElement;
        this.authUserValueEl = this.mainMenu.querySelector('#auth-user-value') as HTMLSpanElement;
        this.authStatusEl = this.mainMenu.querySelector('#auth-status') as HTMLDivElement;
        this.usernameInputEl = this.mainMenu.querySelector('#auth-username') as HTMLInputElement;
        this.passwordInputEl = this.mainMenu.querySelector('#auth-password') as HTMLInputElement;
        this.shopSubtabRowEl = this.mainMenu.querySelector('#forbox-shop-subtabs') as HTMLDivElement;

        this.caseModalEl = this.mainMenu.querySelector('#case-modal') as HTMLDivElement;
        this.caseModalTitleEl = this.mainMenu.querySelector('#case-modal-title') as HTMLDivElement;
        this.caseModalPriceEl = this.mainMenu.querySelector('#case-modal-price') as HTMLSpanElement;
        this.caseModalArtEl = this.mainMenu.querySelector('#case-modal-art') as HTMLDivElement;
        this.caseModalContextEl = this.mainMenu.querySelector('#case-modal-context') as HTMLDivElement;
        this.caseModalDropsEl = this.mainMenu.querySelector('#case-modal-drops') as HTMLDivElement;
        this.caseModalTrackEl = this.mainMenu.querySelector('#case-reel-track') as HTMLDivElement;
        this.caseModalResultEl = this.mainMenu.querySelector('#case-modal-result') as HTMLDivElement;
        this.caseModalOpenBtn = this.mainMenu.querySelector('#case-open-btn') as HTMLButtonElement;
        this.caseModalCloseBtn = this.mainMenu.querySelector('#case-modal-close') as HTMLButtonElement;
        this.weaponReviewModalEl = this.mainMenu.querySelector('#weapon-review-modal') as HTMLDivElement;
        this.weaponReviewNameEl = this.mainMenu.querySelector('#weapon-review-name') as HTMLDivElement;
        this.weaponReviewMetaEl = this.mainMenu.querySelector('#weapon-review-meta') as HTMLDivElement;
        this.weaponReviewArtEl = this.mainMenu.querySelector('#weapon-review-art') as HTMLDivElement;
        this.weaponReviewEquipBtn = this.mainMenu.querySelector('#weapon-review-equip') as HTMLButtonElement;
        this.weaponReviewCloseBtn = this.mainMenu.querySelector('#weapon-review-close') as HTMLButtonElement;

        this.forboxModalHostEl = this.mainMenu.querySelector('#forbox-modal-host') as HTMLDivElement;
        this.forboxModalBackdropEl = this.mainMenu.querySelector('#forbox-modal-backdrop') as HTMLDivElement;
        this.accountModalEl = this.mainMenu.querySelector('#forbox-account-modal') as HTMLDivElement;
        this.squadModalEl = this.mainMenu.querySelector('#forbox-squad-modal') as HTMLDivElement;
        this.createGameModalEl = this.mainMenu.querySelector('#forbox-create-game-modal') as HTMLDivElement;
        this.findGameModalEl = this.mainMenu.querySelector('#forbox-find-game-modal') as HTMLDivElement;
        this.purchaseConfirmModalEl = this.mainMenu.querySelector('#forbox-purchase-modal') as HTMLDivElement;
        this.accountDisplayNameEl = this.mainMenu.querySelector('#forbox-account-display-name') as HTMLSpanElement;
        this.accountStatsListEl = this.mainMenu.querySelector('#forbox-account-stats-list') as HTMLDivElement;
        this.profileAliasInputEl = this.mainMenu.querySelector('#forbox-account-username-input') as HTMLInputElement;
        this.teamTagInputEl = this.mainMenu.querySelector('#forbox-account-teamtag-input') as HTMLInputElement;
        this.accountAvatarListEl = this.mainMenu.querySelector('#forbox-account-avatar-options') as HTMLDivElement;
        this.accountTitleListEl = this.mainMenu.querySelector('#forbox-account-title-options') as HTMLDivElement;
        this.accountNameListEl = this.mainMenu.querySelector('#forbox-account-name-options') as HTMLDivElement;
        this.accountFrameListEl = this.mainMenu.querySelector('#forbox-account-frame-options') as HTMLDivElement;
        this.accountFriendsStatusEl = this.mainMenu.querySelector('#forbox-account-friends-status') as HTMLDivElement;
        this.accountFriendSearchInputEl = this.mainMenu.querySelector('#forbox-account-friend-search') as HTMLInputElement;
        this.accountFriendSearchBtn = this.mainMenu.querySelector('#forbox-account-friend-search-btn') as HTMLButtonElement;
        this.accountFriendResultsEl = this.mainMenu.querySelector('#forbox-account-friend-results') as HTMLDivElement;
        this.accountFriendsListEl = this.mainMenu.querySelector('#forbox-account-friends-list') as HTMLDivElement;
        this.accountFriendsIncomingEl = this.mainMenu.querySelector('#forbox-account-friends-incoming') as HTMLDivElement;
        this.accountFriendsOutgoingEl = this.mainMenu.querySelector('#forbox-account-friends-outgoing') as HTMLDivElement;
        this.squadSocialStatusEl = this.mainMenu.querySelector('#forbox-squad-social-status') as HTMLDivElement;
        this.squadRoomSummaryEl = this.mainMenu.querySelector('#forbox-squad-room-summary') as HTMLDivElement;
        this.squadRoomCardEl = this.mainMenu.querySelector('#forbox-squad-room-card') as HTMLDivElement;
        this.squadCreatePrivateBtn = this.mainMenu.querySelector('#forbox-squad-create-private') as HTMLButtonElement;
        this.squadCreatePublicBtn = this.mainMenu.querySelector('#forbox-squad-create-public') as HTMLButtonElement;
        this.squadPartyInputEl = this.mainMenu.querySelector('#forbox-squad-party-id-input') as HTMLInputElement;
        this.squadPartyJoinBtn = this.mainMenu.querySelector('#forbox-squad-party-id-join') as HTMLButtonElement;
        this.squadIncomingListEl = this.mainMenu.querySelector('#forbox-squad-incoming-list') as HTMLDivElement;
        this.squadOutgoingListEl = this.mainMenu.querySelector('#forbox-squad-outgoing-list') as HTMLDivElement;
        this.squadGiftSummaryEl = this.mainMenu.querySelector('#forbox-squad-gift-summary') as HTMLDivElement;
        this.squadMessageSummaryEl = this.mainMenu.querySelector('#forbox-squad-message-summary') as HTMLDivElement;
        this.socialTargetEl = this.mainMenu.querySelector('#forbox-social-target') as HTMLDivElement;
        this.socialGiftSelectEl = this.mainMenu.querySelector('#forbox-social-gift-select') as HTMLSelectElement;
        this.socialGiftNoteEl = this.mainMenu.querySelector('#forbox-social-gift-note') as HTMLTextAreaElement;
        this.socialGiftSendBtn = this.mainMenu.querySelector('#forbox-social-gift-send') as HTMLButtonElement;
        this.socialGiftInboxEl = this.mainMenu.querySelector('#forbox-social-gift-inbox') as HTMLDivElement;
        this.socialGiftSentEl = this.mainMenu.querySelector('#forbox-social-gift-sent') as HTMLDivElement;
        this.socialThreadsEl = this.mainMenu.querySelector('#forbox-social-threads') as HTMLDivElement;
        this.socialThreadUserEl = this.mainMenu.querySelector('#forbox-social-thread-user') as HTMLDivElement;
        this.socialDmLogEl = this.mainMenu.querySelector('#forbox-social-dm-log') as HTMLDivElement;
        this.socialDmInputEl = this.mainMenu.querySelector('#forbox-social-dm-input') as HTMLInputElement;
        this.socialDmSendBtn = this.mainMenu.querySelector('#forbox-social-dm-send') as HTMLButtonElement;
        this.createGamePlayersEl = this.mainMenu.querySelector('#forbox-create-players') as HTMLSelectElement;
        this.createGameDurationEl = this.mainMenu.querySelector('#forbox-create-duration') as HTMLSelectElement;
        this.createGameModeEl = this.mainMenu.querySelector('#forbox-create-mode') as HTMLSelectElement;
        this.createGameFillBotsEl = this.mainMenu.querySelector('#forbox-create-bots') as HTMLInputElement;
        this.createGameNameEl = this.mainMenu.querySelector('#forbox-create-name') as HTMLInputElement;
        this.findGameStatusEl = this.mainMenu.querySelector('#forbox-find-game-status') as HTMLDivElement;
        this.findGameListEl = this.mainMenu.querySelector('#forbox-find-game-list') as HTMLDivElement;
        this.findGameRefreshBtn = this.mainMenu.querySelector('#forbox-find-game-refresh') as HTMLButtonElement;
        this.purchaseConfirmTextEl = this.mainMenu.querySelector('#forbox-purchase-text') as HTMLDivElement;

        this.loadIdentityState();
        this.profileAliasInputEl.value = this.profileAlias;
        this.teamTagInputEl.value = this.teamTag;
        this.renderAccountPanel();

        this.bindMenuEvents();
        this.refreshWallet();
        this.renderProgressionPanels();
        this.updateAuthUi();
        this.initLobbyChat();
        this.initSocialState();
    }

    private bindMenuEvents() {
        this.mainMenu.querySelectorAll('.menu-tab').forEach(button => {
            button.addEventListener('click', () => {
                const tab = (button as HTMLButtonElement).dataset.tab as MenuTab;
                this.showTab(tab);
            });
        });

        const playNowButton = this.mainMenu.querySelector('#menu-play-now') as HTMLButtonElement;
        const findGameButton = this.mainMenu.querySelector('#forbox-find-game-btn') as HTMLButtonElement;
        const createGameButton = this.mainMenu.querySelector('#forbox-create-game-btn') as HTMLButtonElement;
        playNowButton.addEventListener('click', () => {
            if (!this.isAuthenticated()) {
                this.setAuthStatus('Login required to start online FFA.');
                this.showTab('play');
                return;
            }
            this.startGameSession('ffa', 300);
        });
        findGameButton.addEventListener('click', () => {
            if (!this.isAuthenticated()) {
                this.setAuthStatus('Login required to start online FFA.');
                this.showTab('play');
                return;
            }
            this.openFindGameOverlay();
        });
        createGameButton.addEventListener('click', () => {
            this.openCreateGameOverlay();
        });

        this.mainMenu.querySelectorAll('[data-slot]').forEach(slotEl => {
            slotEl.addEventListener('click', () => {
                const slot = (slotEl as HTMLButtonElement).dataset.slot as EquipSlot;
                this.autoEquipFromOwned(slot);
            });
        });

        this.inventoryFilterInputEl.addEventListener('input', () => {
            this.inventoryFilterQuery = `${this.inventoryFilterInputEl.value || ''}`.trim().toLowerCase();
            if (this.currentTab === 'inventory') this.renderInventory();
        });

        this.inventoryFilterButtonsEl.addEventListener('click', (e: Event) => {
            const target = (e.target as HTMLElement).closest('button[data-filter-weapon-id]') as HTMLButtonElement | null;
            if (!target) return;
            this.inventoryWeaponFilter = `${target.dataset.filterWeaponId || 'all'}`.trim().toLowerCase() || 'all';
            this.inventoryFilterButtonsEl.querySelectorAll('.forbox-filter-btn').forEach((btn) => {
                btn.classList.toggle('active', (btn as HTMLButtonElement).dataset.filterWeaponId === this.inventoryWeaponFilter);
            });
            if (this.currentTab === 'inventory') this.renderInventory();
        });

        const boardViewGroup = this.mainMenu.querySelector('#board-view-group') as HTMLDivElement;
        boardViewGroup.addEventListener('click', (e: Event) => {
            const target = (e.target as HTMLElement).closest('button[data-view]') as HTMLButtonElement | null;
            if (!target) return;
            this.leaderboardView = target.dataset.view === 'premier' ? 'premier' : 'stats';
            boardViewGroup.querySelectorAll('.filter-btn').forEach((btn) => {
                btn.classList.toggle('active', btn === target);
            });
            this.renderLeaderboard();
        });

        const periodGroup = this.mainMenu.querySelector('#board-period-group') as HTMLDivElement;
        periodGroup.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;
            if (!target || !target.dataset.period) return;
            this.boardPeriod = target.dataset.period as LeaderboardPeriod;
            periodGroup.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            this.renderLeaderboard();
        });

        const metricGroup = this.mainMenu.querySelector('#board-metric-group') as HTMLDivElement;
        metricGroup.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;
            if (!target || !target.dataset.metric) return;
            this.boardMetric = target.dataset.metric as LeaderboardMetric;
            metricGroup.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            this.renderLeaderboard();
        });

        const loginButton = this.mainMenu.querySelector('#auth-login-btn') as HTMLButtonElement;
        const registerButton = this.mainMenu.querySelector('#auth-register-btn') as HTMLButtonElement;
        const logoutButton = this.mainMenu.querySelector('#auth-logout-btn') as HTMLButtonElement;
        const openAccountButton = this.mainMenu.querySelector('#forbox-open-account') as HTMLButtonElement;
        const openSquadButton = this.mainMenu.querySelector('#forbox-open-squad') as HTMLButtonElement;

        loginButton.addEventListener('click', () => { this.handleLogin(); });
        registerButton.addEventListener('click', () => { this.handleRegister(); });
        logoutButton.addEventListener('click', () => { this.handleLogout(); });
        openAccountButton.addEventListener('click', () => {
            this.profileAliasInputEl.value = this.profileAlias || this.currentUser?.username || '';
            this.teamTagInputEl.value = this.teamTag;
            this.renderAccountPanel();
            this.showForboxModal('account');
        });
        openSquadButton.addEventListener('click', () => {
            this.showForboxModal('squad');
        });

        this.shopSubtabRowEl.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;
            if (!target || !target.dataset.shopTab) return;
            this.currentShopSubTab = 'case';
            this.shopSubtabRowEl.querySelectorAll('.forbox-shop-subtab').forEach((btn) => {
                btn.classList.toggle('active', (btn as HTMLButtonElement).dataset.shopTab === 'case');
            });
            this.renderShop();
        });

        this.forboxModalBackdropEl.addEventListener('click', () => {
            if (this.activeForboxModal !== 'none') this.hideForboxModal();
        });
        this.mainMenu.querySelectorAll('[data-modal-cancel]').forEach((btn) => {
            btn.addEventListener('click', () => this.hideForboxModal());
        });
        const accountSaveBtn = this.mainMenu.querySelector('#forbox-account-save') as HTMLButtonElement;
        accountSaveBtn.addEventListener('click', () => {
            const cleanedAlias = `${this.profileAliasInputEl.value || ''}`.trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
            this.profileAlias = cleanedAlias;
            const cleanedTag = `${this.teamTagInputEl.value || ''}`.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
            this.teamTag = cleanedTag;
            this.persistIdentityState();
            this.updateAuthUi();
            this.renderLeaderboard();
            this.renderAccountPanel();
            this.hideForboxModal();
        });
        const accountClearTagBtn = this.mainMenu.querySelector('#forbox-account-clear-tag') as HTMLButtonElement;
        accountClearTagBtn.addEventListener('click', () => {
            this.teamTag = '';
            this.teamTagInputEl.value = '';
            this.persistIdentityState();
            this.updateAuthUi();
            this.renderLeaderboard();
            this.renderAccountPanel();
        });
        this.accountFriendSearchBtn.addEventListener('click', () => {
            void this.runFriendSearch();
        });
        this.accountFriendSearchInputEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void this.runFriendSearch();
        });
        [
            this.accountFriendResultsEl,
            this.accountFriendsListEl,
            this.accountFriendsIncomingEl,
            this.accountFriendsOutgoingEl,
        ].forEach((host) => {
            host.addEventListener('click', (event: Event) => {
                const target = (event.target as HTMLElement).closest('button[data-friend-action]') as HTMLButtonElement | null;
                if (!target) return;
                const action = `${target.dataset.friendAction || ''}`.trim();
                const userId = `${target.dataset.friendUserId || ''}`.trim();
                if (!action || !userId) return;
                if (['invite', 'gift', 'message'].includes(action)) {
                    void this.handleSocialFriendAction(action, userId);
                    return;
                }
                void this.handleFriendAction(action, userId);
            });
        });
        [
            this.squadRoomCardEl,
            this.squadIncomingListEl,
            this.squadOutgoingListEl,
            this.socialGiftInboxEl,
            this.socialGiftSentEl,
            this.socialThreadsEl,
        ].forEach((host) => {
            host.addEventListener('click', (event: Event) => {
                const target = (event.target as HTMLElement).closest('button[data-social-action]') as HTMLButtonElement | null;
                if (!target) return;
                const action = `${target.dataset.socialAction || ''}`.trim();
                const userId = `${target.dataset.socialUserId || ''}`.trim();
                const inviteId = `${target.dataset.socialInviteId || ''}`.trim();
                const giftId = `${target.dataset.socialGiftId || ''}`.trim();
                if (!action) return;
                void this.handleSocialAction(action, { userId, inviteId, giftId });
            });
        });
        this.socialGiftSendBtn.addEventListener('click', () => {
            void this.submitSocialGift();
        });
        this.squadCreatePrivateBtn.addEventListener('click', () => {
            void this.createOrUpdateSquadRoom('private');
        });
        this.squadCreatePublicBtn.addEventListener('click', () => {
            void this.createOrUpdateSquadRoom('public');
        });
        this.squadPartyJoinBtn.addEventListener('click', () => {
            void this.joinPartyFromInput();
        });
        this.squadPartyInputEl.addEventListener('input', () => {
            const safePartyId = this.sanitizePartyId(this.squadPartyInputEl.value);
            if (this.squadPartyInputEl.value !== safePartyId) this.squadPartyInputEl.value = safePartyId;
            this.squadPartyJoinBtn.disabled = !safePartyId;
        });
        this.squadPartyInputEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void this.joinPartyFromInput();
        });
        this.socialDmSendBtn.addEventListener('click', () => {
            void this.submitDirectMessage();
        });
        this.socialDmInputEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void this.submitDirectMessage();
        });
        const createConfirmBtn = this.mainMenu.querySelector('#forbox-create-confirm') as HTMLButtonElement;
        createConfirmBtn.addEventListener('click', () => {
            void this.handleCreateMatchRoom();
        });
        this.findGameRefreshBtn.addEventListener('click', () => {
            void this.refreshPublicMatchRooms();
        });
        const purchaseConfirmBtn = this.mainMenu.querySelector('#forbox-purchase-confirm') as HTMLButtonElement;
        purchaseConfirmBtn.addEventListener('click', () => {
            const offerId = `${this.pendingPurchaseOfferId || ''}`.trim();
            this.hideForboxModal();
            if (!offerId) return;
            void this.executeOfferPurchase(offerId);
        });
        this.rewardClaimBtn.addEventListener('click', () => {
            void this.claimWeeklyLoginReward();
        });

        this.chatSendBtn.addEventListener('click', () => {
            void this.submitLobbyChat();
        });
        this.chatInputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void this.submitLobbyChat();
        });
        this.chatInputEl.addEventListener('focus', () => {
            if (GameContext.PointLock.isLocked) GameContext.PointLock.unlock();
        });
        this.chatEmojiRowEl.addEventListener('click', (e: Event) => {
            const target = (e.target as HTMLElement).closest('button[data-emoji]') as HTMLButtonElement | null;
            if (!target) return;
            const emoji = `${target.dataset.emoji || ''}`.trim();
            if (!emoji) return;
            const before = this.chatInputEl.value || '';
            const joiner = before && !before.endsWith(' ') ? ' ' : '';
            const next = `${before}${joiner}${emoji}`.slice(0, 220);
            this.chatInputEl.value = next;
            this.chatInputEl.focus();
        });

        const caseModalBackdrop = this.mainMenu.querySelector('#case-modal-backdrop') as HTMLDivElement;
        caseModalBackdrop.addEventListener('click', () => {
            if (!this.caseSpinLocked) this.hideCaseModal();
        });

        this.caseModalCloseBtn.addEventListener('click', () => {
            if (!this.caseSpinLocked) this.hideCaseModal();
        });

        this.caseModalOpenBtn.addEventListener('click', () => {
            this.handleOpenCaseWithAnimation();
        });

        const weaponReviewBackdrop = this.mainMenu.querySelector('#weapon-review-backdrop') as HTMLDivElement;
        const weaponReviewDismissBtn = this.mainMenu.querySelector('#weapon-review-dismiss') as HTMLButtonElement;
        weaponReviewBackdrop.addEventListener('click', () => this.hideWeaponReviewModal());
        weaponReviewDismissBtn.addEventListener('click', () => this.hideWeaponReviewModal());
        this.weaponReviewCloseBtn.addEventListener('click', () => this.hideWeaponReviewModal());
        this.weaponReviewEquipBtn.addEventListener('click', () => {
            void this.applyWeaponReviewEquip();
        });
    }

    private async bootstrapOnlineState() {
        this.setAuthStatus('Connecting backend...');
        try {
            await backendApi.health();
            this.setAuthStatus(`Backend online @ ${backendApi.getBaseUrl()}`);
        } catch {
            this.setAuthStatus(`Backend offline @ ${backendApi.getBaseUrl()}`);
        }

        const storedToken = backendApi.getStoredToken();
        if (storedToken) {
            this.sessionToken = storedToken;
            const ok = await this.fetchProfile();
            if (!ok) this.handleLogout(false);
        }

        this.updateAuthUi();
        this.refreshWallet();
        this.renderProgressionPanels();
    }

    private initLobbyChat() {
        this.chatCursor = 0;
        this.chatBootstrapped = false;
        this.chatRenderedIds.clear();
        this.chatLogEl.innerHTML = '<div class="forbox-chat-placeholder">Lobby chat loading...</div>';
        this.updateChatAuthState();
        void this.pullLobbyChat(true);

        if (this.chatPollInterval) {
            window.clearInterval(this.chatPollInterval);
            this.chatPollInterval = null;
        }
        this.chatPollInterval = window.setInterval(() => {
            void this.pullLobbyChat(false);
        }, 1500);
    }

    private updateChatAuthState() {
        const canSend = this.isAuthenticated();
        this.chatInputEl.disabled = !canSend;
        this.chatSendBtn.disabled = !canSend;
        this.chatInputEl.placeholder = canSend
            ? 'Write a message... (Enter to send)'
            : 'Sign in to send messages';
        if (!this.chatPollInFlight) {
            this.chatStatusEl.textContent = canSend ? 'ONLINE' : 'READ ONLY';
        }
    }

    private formatChatTime(iso: string) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '--:--';
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    private appendLobbyMessages(messages: LobbyChatMessage[], replace = false) {
        if (!Array.isArray(messages) || !messages.length) return;
        if (replace) {
            this.chatLogEl.innerHTML = '';
            this.chatRenderedIds.clear();
        } else {
            const placeholder = this.chatLogEl.querySelector('.forbox-chat-placeholder');
            if (placeholder) placeholder.remove();
        }

        const currentUserId = this.currentUser?.id || '';

        messages.forEach((item) => {
            const id = toInt(item?.id, 0, 0);
            if (id <= 0 || this.chatRenderedIds.has(id)) return;
            this.chatRenderedIds.add(id);

            const owner = `${item.displayName || item.username || 'Player'}`.trim() || 'Player';
            const text = `${item.text || ''}`.trim();
            const row = document.createElement('div');
            row.className = 'forbox-chat-msg';
            if (currentUserId && `${item.userId || ''}` === currentUserId) row.classList.add('is-self');

            row.innerHTML = `
                <div class="forbox-chat-msg-avatar">
                    ${this.renderAvatarMarkup(item.avatar || DEFAULT_AVATAR_ID, item.avatarFrame || 'default', owner)}
                </div>
                <div class="forbox-chat-msg-body">
                    <div class="forbox-chat-msg-meta">
                        <span class="forbox-chat-msg-owner">
                            ${item.title ? `<span class="leader-title">${escapeHtml(item.title)}</span>` : ''}
                            <span class="leader-player-name name-${item.nameColor || 'default'}">${escapeHtml(owner)}</span>
                        </span>
                        <span class="forbox-chat-msg-time">${this.formatChatTime(item.createdAt)}</span>
                    </div>
                    <div class="forbox-chat-msg-text">${escapeHtml(text)}</div>
                </div>
            `;
            this.chatLogEl.appendChild(row);
        });

        const rows = this.chatLogEl.querySelectorAll('.forbox-chat-msg');
        if (rows.length > 50) {
            for (let i = 0; i < rows.length - 50; i += 1) {
                rows[i].remove();
            }
        }

        // Always keep latest message visible at the bottom.
        requestAnimationFrame(() => {
            this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
        });
    }

    private async pullLobbyChat(bootstrap: boolean) {
        if (this.chatPollInFlight) return;
        this.chatPollInFlight = true;
        this.chatStatusEl.textContent = 'SYNC...';
        try {
            const afterId = bootstrap && !this.chatBootstrapped ? 0 : this.chatCursor;
            const limit = 50;
            const payload = await backendApi.lobbyChat(afterId, limit);
            const messages = Array.isArray(payload.messages) ? payload.messages : [];
            if (messages.length) {
                this.appendLobbyMessages(messages, bootstrap && !this.chatBootstrapped);
                const last = messages[messages.length - 1];
                this.chatCursor = Math.max(this.chatCursor, toInt(last?.id, this.chatCursor, 0));
            } else if (bootstrap && !this.chatBootstrapped) {
                this.chatLogEl.innerHTML = '<div class="forbox-chat-placeholder">No messages yet. Start the conversation.</div>';
            }
            this.chatBootstrapped = true;
            this.chatStatusEl.textContent = this.isAuthenticated() ? 'ONLINE' : 'READ ONLY';
        } catch {
            this.chatStatusEl.textContent = 'OFFLINE';
        } finally {
            this.chatPollInFlight = false;
        }
    }

    private async submitLobbyChat() {
        if (!this.isAuthenticated() || !this.sessionToken) {
            this.chatStatusEl.textContent = 'SIGN IN REQUIRED';
            return;
        }

        const message = `${this.chatInputEl.value || ''}`.replace(/\s+/g, ' ').trim();
        if (!message) return;
        const maxLength = 220;
        const finalMessage = Array.from(message).slice(0, maxLength).join('');
        if (!finalMessage) return;

        this.chatSendBtn.disabled = true;
        this.chatStatusEl.textContent = 'SENDING...';

        try {
            const payload = await backendApi.sendLobbyChat(this.sessionToken, finalMessage, this.getDisplayName());
            if (payload.message) {
                this.appendLobbyMessages([payload.message], false);
                this.chatCursor = Math.max(this.chatCursor, toInt(payload.message.id, this.chatCursor, 0));
            }
            this.chatInputEl.value = '';
            this.chatStatusEl.textContent = 'ONLINE';
        } catch (error: any) {
            this.chatStatusEl.textContent = `${error?.message || 'Message failed'}`;
        } finally {
            this.chatSendBtn.disabled = !this.isAuthenticated();
            this.chatInputEl.focus();
        }
    }

    private async fetchCatalogAndShop() {
        try {
            const [shop, catalog, loadoutCatalog] = await Promise.all([
                backendApi.shopOffers(),
                backendApi.casesCatalog(),
                backendApi.loadoutCatalog(),
            ]);

            if (Array.isArray(shop.offers) && shop.offers.length) this.shopOffers = shop.offers;
            if (Array.isArray(catalog.cases) && catalog.cases.length) {
                this.caseCatalog = catalog.cases;
            } else if (Array.isArray(shop.cases) && shop.cases.length) {
                this.caseCatalog = shop.cases;
            }
            if (Array.isArray(loadoutCatalog.weapons) && loadoutCatalog.weapons.length) {
                this.weaponCatalog = mergeWeaponCatalog(loadoutCatalog.weapons);
            } else {
                this.weaponCatalog = [...FALLBACK_WEAPON_CATALOG];
            }

            const currency = `${catalog.currency || shop.currency || 'coin'}`.toUpperCase();
            this.menuCurrency = this.toUiCurrencyLabel(currency);
            this.rebuildSkinMetaIndex();
        } catch {
            this.rebuildSkinMetaIndex();
        }

        this.catalogLoaded = true;
        this.refreshWallet();
    }

    private async ensureCatalogAndShopLoaded() {
        if (this.catalogLoaded) return;
        if (this.catalogLoadingPromise) {
            await this.catalogLoadingPromise;
            return;
        }

        this.catalogLoadingPromise = this.fetchCatalogAndShop().finally(() => {
            this.catalogLoadingPromise = null;
        });

        await this.catalogLoadingPromise;
    }

    private showTab(tab: MenuTab) {
        this.hideForboxModal();
        this.currentTab = tab;
        this.mainMenu.querySelectorAll('.menu-tab').forEach(btn => {
            btn.classList.toggle('active', (btn as HTMLButtonElement).dataset.tab === tab);
        });
        this.mainMenu.querySelectorAll('.menu-panel').forEach(panel => {
            panel.classList.toggle('active', (panel as HTMLDivElement).dataset.panel === tab);
        });

        if (tab === 'leaderboard') this.renderLeaderboard();
        if (tab === 'inventory') {
            this.inventoryInfoEl.textContent = 'Loading inventory...';
            void this.ensureCatalogAndShopLoaded().then(() => {
                if (this.currentTab !== 'inventory') return;
                this.inventoryInfoEl.textContent = '';
                this.renderInventory();
            });
        }
        if (tab === 'play') this.renderProgressionPanels();
        if (tab === 'rewards') {
            this.renderProgressionPanels();
            if (this.isAuthenticated()) {
                void this.fetchProgressionState().then(() => {
                    if (this.currentTab !== 'rewards') return;
                    this.renderProgressionPanels();
                    this.refreshWallet();
                });
            }
        }
        if (tab === 'shop') {
            this.refreshWallet();
            this.shopStatusEl.textContent = 'Loading shop...';
            void this.ensureCatalogAndShopLoaded().then(() => {
                if (this.currentTab !== 'shop') return;
                this.shopStatusEl.textContent = '';
                this.shopSubtabRowEl.querySelectorAll('.forbox-shop-subtab').forEach((btn) => {
                    btn.classList.toggle('active', (btn as HTMLButtonElement).dataset.shopTab === this.currentShopSubTab);
                });
                this.renderShop();
            });
        }
    }

    private renderShop() {
        const currency = this.menuCurrency;
        this.currentShopSubTab = 'case';
        this.shopSubtabRowEl.querySelectorAll('.forbox-shop-subtab').forEach((btn) => {
            btn.classList.toggle('active', (btn as HTMLButtonElement).dataset.shopTab === 'case');
        });

        const caseOffers = this.shopOffers.filter((item) => item.type === 'case' && !!item.caseId);
        const byCaseId = new Map(caseOffers.map((item) => [`${item.caseId}`, item]));
        const cards = this.caseCatalog.map((caseDef, idx) => {
            const offer = byCaseId.get(caseDef.id) || null;
            const price = toInt(offer?.priceCoin ?? offer?.price ?? caseDef.openPriceCoin, toInt(caseDef.openPriceCoin, 0, 0), 0);
            const caseImage = this.getCasePreviewImage(caseDef.id, idx);
            const featuredWeapon = this.getCaseFeaturedWeapon(caseDef);
            const artStyle = featuredWeapon?.imageUrl
                ? `background-image:linear-gradient(180deg, rgba(7, 11, 17, 0.22), rgba(7, 11, 17, 0.64)), url('${featuredWeapon.imageUrl}'), url('${caseImage}');background-size:cover, auto 78%, cover;background-position:center, center, center;`
                : `background-image:url('${caseImage}')`;
            return `
                <div class="shop-card shop-card-case" data-case-id="${caseDef.id}" data-offer-id="${offer?.id || ''}">
                    <div class="shop-card-case-art ${featuredWeapon?.imageUrl ? 'has-weapon' : ''}" style="${artStyle}"></div>
                    <div class="shop-card-top">
                        <div class="shop-card-title">${caseDef.title}</div>
                        <div class="shop-card-type">CASE</div>
                    </div>
                    <div class="shop-card-desc">${offer?.description || 'Inspect drops and buy to open.'}</div>
                    <div class="shop-card-tags">
                        <span class="shop-tag">${caseDef.id}</span>
                        <span class="shop-tag">Drops: ${(caseDef.drops || []).length}</span>
                        ${featuredWeapon ? `<span class="shop-tag shop-tag--weapon">${escapeHtml(featuredWeapon.label)}</span>` : ''}
                    </div>
                    <div class="shop-card-bottom">
                        <span class="shop-card-price">${price} ${currency}</span>
                        <button class="shop-buy-btn shop-inspect-btn">INSPECT</button>
                    </div>
                </div>
            `;
        });

        this.shopGridEl.innerHTML = cards.join('') || '<div class="inventory-empty">No cases configured.</div>';

        this.shopGridEl.querySelectorAll('.shop-card-case').forEach((cardEl) => {
            cardEl.addEventListener('click', (e: Event) => {
                const card = (e.currentTarget as HTMLDivElement) || (e.target as HTMLElement).closest('.shop-card-case') as HTMLDivElement;
                if (!card) return;
                const caseId = `${card.dataset.caseId || ''}`;
                const offerId = `${card.dataset.offerId || ''}`;
                this.openCaseInspectModal(caseId, offerId || null);
            });
        });
    }

    private getCasePreviewImage(caseId: string, fallbackIndex = 0) {
        const safeId = `${caseId || ''}`.trim().toLowerCase();
        const hash = safeId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const index = ((hash || fallbackIndex) % CASE_PREVIEW_IMAGES.length + CASE_PREVIEW_IMAGES.length) % CASE_PREVIEW_IMAGES.length;
        return CASE_PREVIEW_IMAGES[index];
    }

    private openPurchaseConfirm(offerId: string) {
        const offer = this.shopOffers.find((item) => item.id === offerId);
        if (!offer) {
            this.setInlineMessage(this.shopStatusEl, 'Offer not found.');
            return;
        }
        this.pendingPurchaseOfferId = offerId;
        const price = toInt(offer.priceCoin ?? offer.price, 0, 0);
        this.purchaseConfirmTextEl.textContent = `Purchase ${offer.title} for ${price} ${this.menuCurrency}?`;
        this.showForboxModal('purchase_confirm');
    }

    private async executeOfferPurchase(offerId: string) {
        if (!this.sessionToken) {
            this.setInlineMessage(this.shopStatusEl, 'Login required.');
            return;
        }
        const offer = this.shopOffers.find(item => item.id === offerId);
        if (!offer) {
            this.setInlineMessage(this.shopStatusEl, 'Offer not found.');
            return;
        }
        if (offer.type === 'case' && offer.caseId) {
            this.openCaseInspectModal(offer.caseId, offer.id);
            return;
        }
        try {
            const payload = await backendApi.purchase(this.sessionToken, offerId, 1);
            if (this.currentUser) {
                this.currentUser.wallet = payload.wallet;
                this.currentUser.inventory = payload.inventory;
            }
            if (payload.currency) this.menuCurrency = this.toUiCurrencyLabel(payload.currency);
            this.refreshWallet();
            this.renderInventory();
            this.setInlineMessage(this.shopStatusEl, `${offer ? offer.title : 'Item'} purchased.`);
        } catch (error: any) {
            this.setInlineMessage(this.shopStatusEl, error?.message || 'Purchase failed.');
        }
    }

    private buildLegacyCaseSpinResult(caseId: string, skinName: string, rarity: ItemRarity, skinItem?: SkinItem): CaseSpinResult {
        const caseDef = this.caseCatalog.find((item) => item.id === caseId) || FALLBACK_CASES[0];
        const track = this.buildPreviewTrack(caseDef);
        const safeTrack = track.length ? track : [{ skin: skinName, rarity }];
        const stopIndex = Math.max(0, Math.min(safeTrack.length - 1, 18));
        safeTrack[stopIndex] = { skin: skinName, rarity };
        return {
            skin: skinItem || { name: skinName, rarity, slot: 'primary' },
            rarity,
            spinTrack: safeTrack,
            stopIndex,
            durationMs: 4200,
        };
    }

    private async buyAndOpenCaseOffer(offer: ShopOffer) {
        if (!this.sessionToken || !this.currentUser) {
            this.setInlineMessage(this.shopStatusEl, 'Login required.');
            return;
        }
        const caseId = `${offer.caseId || ''}`;
        if (!caseId) {
            this.setInlineMessage(this.shopStatusEl, 'Case config is missing.');
            return;
        }

        this.openCaseInspectModal(caseId);
        this.caseSpinLocked = true;
        this.caseModalOpenBtn.disabled = true;
        this.caseModalCloseBtn.disabled = true;
        this.caseModalResultEl.className = 'case-modal-result';
        this.caseModalResultEl.textContent = 'Purchasing and opening...';

        try {
            const purchasePayload = await backendApi.purchase(this.sessionToken, offer.id, 1, { autoOpenCase: true });
            if (this.currentUser) {
                this.currentUser.wallet = purchasePayload.wallet;
                this.currentUser.inventory = purchasePayload.inventory;
            }
            if (purchasePayload.currency) this.menuCurrency = this.toUiCurrencyLabel(purchasePayload.currency);
            this.refreshWallet();
            this.renderInventory();

            let spinResult: CaseSpinResult;
            if (purchasePayload.caseOpen) {
                spinResult = {
                    skin: purchasePayload.caseOpen.skin,
                    rarity: purchasePayload.caseOpen.rarity,
                    spinTrack: purchasePayload.caseOpen.spinTrack,
                    stopIndex: purchasePayload.caseOpen.stopIndex,
                    durationMs: purchasePayload.caseOpen.durationMs,
                };
            } else {
                // Backward compatibility: if backend does not support autoOpenCase yet.
                const legacyOpen = await backendApi.openCase(this.sessionToken, caseId);
                if (this.currentUser) this.currentUser.inventory = legacyOpen.inventory;
                if (legacyOpen.currency) this.menuCurrency = this.toUiCurrencyLabel(legacyOpen.currency);
                this.refreshWallet();
                this.renderInventory();

                const legacySkin = legacyOpen.skinItem && typeof legacyOpen.skinItem === 'object'
                    ? legacyOpen.skinItem
                    : (typeof legacyOpen.skin === 'object'
                        ? legacyOpen.skin as SkinItem
                        : {
                            name: `${legacyOpen.skinName || legacyOpen.skin || 'UNKNOWN'}`,
                            rarity: (legacyOpen.rarity || 'milspec') as ItemRarity,
                            slot: 'primary',
                        });
                const legacyName = legacySkin.name || `${legacyOpen.skinName || legacyOpen.skin || 'UNKNOWN'}`;
                const legacyRarity = (legacySkin.rarity || legacyOpen.rarity || 'milspec') as ItemRarity;
                spinResult = this.buildLegacyCaseSpinResult(caseId, legacyName, legacyRarity, legacySkin);
            }

            await this.playCaseReel(spinResult);
            const wonSkinName = spinResult.skin?.name || 'UNKNOWN';
            this.caseModalResultEl.className = `case-modal-result ${rarityClass(spinResult.rarity)}`;
            this.caseModalResultEl.textContent = `UNBOXED: ${wonSkinName} (${`${spinResult.rarity}`.toUpperCase()})`;
            this.setInlineMessage(this.shopStatusEl, `${offer.title} opened: ${wonSkinName}`);
            this.setInlineMessage(this.inventoryMessageEl, `Unboxed ${wonSkinName}`);
        } catch (error: any) {
            this.caseModalResultEl.className = 'case-modal-result is-error';
            this.caseModalResultEl.textContent = error?.message || 'Buy & open failed.';
            this.setInlineMessage(this.shopStatusEl, error?.message || 'Buy & open failed.');
        } finally {
            this.caseSpinLocked = false;
            this.caseModalOpenBtn.disabled = false;
            this.caseModalCloseBtn.disabled = false;
        }
    }

    private normalizeWeaponId(raw: string) {
        const key = `${raw || ''}`.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!key) return '';
        if (key === 'm4a1' || key === 'm4a1s') return 'm4a1_s';
        if (key === 'usp' || key === 'usps') return 'usp_s';
        if (key === 'deserteagle' || key === 'deagle') return 'deagle';
        if (key === 'mac10') return 'mac10';
        if (key === 'ak' || key === 'ak47') return 'ak47';
        if (key === 'sg553') return 'sg553';
        if (key === 'xm' || key === 'xm1014') return 'xm1014';
        if (key === 'knife' || key === 'm9knife' || key === 'm9') return 'm9';
        return key;
    }

    private inferWeaponIdFromSkinName(skin: string, knownWeaponId?: string) {
        const normalizedKnown = this.normalizeWeaponId(`${knownWeaponId || ''}`);
        if (normalizedKnown && this.weaponCatalog.some((item) => item.weaponId === normalizedKnown)) return normalizedKnown;

        const lower = `${skin || ''}`.toLowerCase();
        if (/ak[\s\-_]?47/.test(lower) || /\bak\b/.test(lower)) return 'ak47';
        if (/m4a1[\s\-_]?s?/.test(lower)) return 'm4a1_s';
        if (/usp[\s\-_]?s?/.test(lower)) return 'usp_s';
        if (/glock[\s\-_]?18/.test(lower) || /\bglock\b/.test(lower)) return 'glock18';
        if (/desert[\s\-_]?eagle/.test(lower) || /\bdeagle\b/.test(lower)) return 'deagle';
        if (/mac[\s\-_]?10/.test(lower)) return 'mac10';
        if (/\bmp9\b/.test(lower)) return 'mp9';
        if (/\bp90\b/.test(lower)) return 'p90';
        if (/sg[\s\-_]?553/.test(lower)) return 'sg553';
        if (/\baug\b/.test(lower)) return 'aug';
        if (/\bawp\b/.test(lower)) return 'awp';
        if (/xm[\s\-_]?1014/.test(lower) || /\bxm1014\b/.test(lower)) return 'xm1014';
        if (/\bnegev\b/.test(lower)) return 'negev';
        if (/\bm9\b/.test(lower) || /\bknife\b/.test(lower)) return 'm9';
        if (/operator|outfit|agent|character|heavy|gloves/.test(lower)) return 'character';
        return '';
    }

    private getWeaponDisplayName(weaponId: string, fallbackSlot?: EquipSlot) {
        if (weaponId === 'character') return 'CHARACTER';
        const found = this.weaponCatalog.find((item) => item.weaponId === weaponId);
        if (found) return found.displayName;
        if (fallbackSlot === 'knife') return 'M9 Knife';
        if (fallbackSlot === 'pistol') return 'Pistol';
        if (fallbackSlot === 'rifle') return 'Primary';
        return weaponId ? weaponId.toUpperCase() : 'UNASSIGNED';
    }

    private getWeaponBrowserCategory(weaponId: string, fallbackSlot?: EquipSlot) {
        const normalizedId = this.normalizeWeaponId(weaponId);
        if (normalizedId === 'character' || fallbackSlot === 'character') return 'OPERATOR';
        if (normalizedId === 'usp_s' || normalizedId === 'glock18') return 'STARTING PISTOL';
        if (normalizedId === 'deagle') return 'OTHER PISTOL';
        if (normalizedId === 'm9' || fallbackSlot === 'knife') return 'KNIFE';
        const meta = this.weaponCatalog.find((item) => this.normalizeWeaponId(item.weaponId) === normalizedId);
        const category = `${meta?.category || ''}`.trim().toLowerCase();
        if (category.includes('smg')) return 'MID-TIER';
        if (category.includes('shotgun')) return 'MID-TIER';
        if (category.includes('rifle')) return 'RIFLES';
        if (category.includes('sniper')) return 'SNIPER';
        if (category.includes('machine')) return 'HEAVY';
        if (category.includes('pistol') || fallbackSlot === 'pistol') return 'PISTOLS';
        if (fallbackSlot === 'rifle') return 'RIFLES';
        return `${meta?.category || 'WEAPON'}`.toUpperCase();
    }

    private getWeaponBrowserRank(weaponId: string) {
        const order = ['character', 'usp_s', 'glock18', 'deagle', 'xm1014', 'mac10', 'mp9', 'p90', 'ak47', 'm4a1_s', 'sg553', 'aug', 'awp', 'negev', 'm9'];
        const idx = order.indexOf(this.normalizeWeaponId(weaponId));
        return idx === -1 ? order.length + 1 : idx;
    }

    private getWeaponImageUrl(weaponId: string, skinName?: string) {
        const normalizedId = this.normalizeWeaponId(weaponId);
        if (normalizedId === 'character') return weaponReviewRefUrl;
        const weaponMeta = this.weaponCatalog.find((item) => this.normalizeWeaponId(item.weaponId) === normalizedId);
        if (weaponMeta?.iconPath) return weaponMeta.iconPath;
        const slot = weaponMeta?.slot || (normalizedId === 'm9' ? 'knife' : undefined);
        const candidateKeys = new Set([
            normalizeGunAssetKey(normalizedId),
            normalizeGunAssetKey(weaponMeta?.displayName || ''),
            normalizedId === 'deagle' ? 'deserteagle' : '',
            normalizedId === 'usp_s' ? 'usps' : '',
            normalizedId === 'm4a1_s' ? 'm4a1s' : '',
            normalizedId === 'glock18' ? 'glock18' : '',
            normalizedId === 'sg553' ? 'sg553' : '',
            normalizedId === 'm9' ? 'm9knife' : '',
        ].filter(Boolean));
        const skinKey = normalizeGunAssetKey(skinName || '');

        const pool = GUN_ASSET_ENTRIES.filter((entry) => {
            if (slot === 'knife') return entry.groupKey === 'knife';
            return candidateKeys.has(entry.weaponKey);
        });

        if (!pool.length) return '';

        const exact = skinKey ? pool.find((entry) => entry.skinKey === skinKey) : null;
        if (exact?.url) return exact.url;

        const defaultEntry = pool.find((entry) => entry.isDefault);
        if (defaultEntry?.url) return defaultEntry.url;

        return pool[0]?.url || '';
    }

    private getCaseFeaturedWeapon(caseDef: CaseCatalogItem) {
        const rows = [...(caseDef.drops || [])]
            .map((drop) => {
                const weaponId = this.inferWeaponIdFromSkinName(drop.skin, `${drop.weaponId || ''}`);
                if (!weaponId || weaponId === 'character') return null;
                const imageUrl = this.getWeaponImageUrl(weaponId, drop.skin);
                if (!imageUrl) return null;
                return {
                    weaponId,
                    label: this.getWeaponDisplayName(weaponId),
                    imageUrl,
                    rarityScore: RARITY_ORDER[`${drop.rarity || 'milspec'}`.toLowerCase()] || 0,
                };
            })
            .filter(Boolean) as Array<{ weaponId: string; label: string; imageUrl: string; rarityScore: number }>;

        rows.sort((a, b) => b.rarityScore - a.rarityScore);
        return rows[0] || null;
    }

    private getInventoryFilterWeapons() {
        const seen = new Set<string>();
        const order: Array<{ weaponId: string; label: string; category: string; slot: EquipSlot }> = [];
        const inventorySkins = this.currentUser?.inventory?.skins || [];
        const hasCharacterSkin = inventorySkins.some((skin) => this.resolveSlotForSkin(skin, this.currentUser?.inventory?.skinMeta?.[skin]?.slot) === 'character');
        if (hasCharacterSkin) {
            seen.add('character');
            order.push({ weaponId: 'character', label: 'Operator', category: 'Operator', slot: 'character' });
        }
        this.weaponCatalog.forEach((item) => {
            const weaponId = this.normalizeWeaponId(item.weaponId);
            if (!weaponId || seen.has(weaponId)) return;
            seen.add(weaponId);
            const slot = item.slot === 'secondary'
                ? 'pistol'
                : (item.slot === 'knife' ? 'knife' : 'rifle');
            order.push({ weaponId, label: item.displayName, category: item.category, slot });
        });
        return order.sort((a, b) => this.getWeaponBrowserRank(a.weaponId) - this.getWeaponBrowserRank(b.weaponId));
    }

    private renderInventoryFilterMenu(skins: string[]) {
        const options = this.getInventoryFilterWeapons();
        const owned = Array.isArray(skins) ? skins : [];
        const counts = new Map<string, number>();
        this.inventoryFilterInputEl.value = this.inventoryFilterQuery;

        owned.forEach((skin) => {
            const invMeta = this.currentUser?.inventory?.skinMeta?.[skin];
            const meta = invMeta || this.skinMetaByName.get(skin);
            const weaponId = this.inferWeaponIdFromSkinName(skin, `${meta?.weaponId || ''}`);
            if (!weaponId) return;
            counts.set(weaponId, (counts.get(weaponId) || 0) + 1);
        });

        const preferredWeaponId = options.find((item) => (counts.get(item.weaponId) || 0) > 0)?.weaponId
            || options[0]?.weaponId
            || '';
        const validIds = new Set(options.map((item) => item.weaponId));
        if (!validIds.has(this.inventoryWeaponFilter)) this.inventoryWeaponFilter = preferredWeaponId;
        if (this.inventoryWeaponFilter === 'all') this.inventoryWeaponFilter = preferredWeaponId;

        this.inventoryFilterButtonsEl.innerHTML = options.map((option) => {
            const count = counts.get(option.weaponId) || 0;
            const imageUrl = this.getWeaponImageUrl(option.weaponId);
            return `
                <button class="forbox-filter-btn inventory-weapon-card ${this.inventoryWeaponFilter === option.weaponId ? 'active' : ''}" type="button" data-filter-weapon-id="${option.weaponId}">
                    <span class="inventory-weapon-card-kicker">${escapeHtml(this.getWeaponBrowserCategory(option.weaponId, option.slot))}</span>
                    <span class="inventory-weapon-card-art" style="background-image:url('${imageUrl}')"></span>
                    <span class="inventory-weapon-card-name">${escapeHtml(option.label)}</span>
                    <span class="inventory-weapon-card-meta"><strong>${count}</strong> skins owned</span>
                </button>
            `;
        }).join('') || '<div class="inventory-empty">No weapons configured.</div>';
    }

    private renderInventory() {
        if (!this.currentUser) {
            this.inventoryInfoEl.textContent = 'Login required for online inventory.';
            this.renderInventoryFilterMenu([]);
            this.inventoryCasesEl.innerHTML = '<div class="forbox-inventory-callout-card">Loadout editing is offline here. Match-specific loadouts will be handled inside the game later. Cases stay in Shop.</div>';
            this.inventorySkinsEl.innerHTML = '<div class="inventory-empty">Login to load your skins.</div>';
            this.renderProgressionPanels();
            return;
        }

        const inv = this.currentUser.inventory;
        const skins = inv.skins || [];
        this.renderInventoryFilterMenu(skins);
        const summary = this.renderSkinCards(skins, inv.equipped);
        const activeFilterLabel = this.getWeaponDisplayName(this.inventoryWeaponFilter);
        this.inventoryInfoEl.textContent = `Selected: ${activeFilterLabel} | Skins ${summary.shown}/${summary.total} | Shop handles cases, in-match rules will handle loadouts`;
        this.inventoryCasesEl.innerHTML = '<div class="forbox-inventory-callout-card">Weapon loadout selection was removed from inventory. Pick your skins here; map-driven loadout rules will be added in-match later.</div>';
        this.renderProgressionPanels();
    }

    private renderProgressionPanels() {
        const progression = this.currentUser?.progression as ProgressionProfile | undefined;
        if (!progression) {
            this.questDailyListEl.innerHTML = '<div class="inventory-empty">Login to load daily quests.</div>';
            this.questWeeklyListEl.innerHTML = '<div class="inventory-empty">Login to load weekly quests.</div>';
            this.questDailyResetEl.textContent = '--:--:--';
            this.questWeeklyResetEl.textContent = '--:--:--';
            this.questStatusEl.textContent = '';
            this.achievementGridEl.innerHTML = '<div class="inventory-empty">Login to view achievements.</div>';
            this.titleListEl.innerHTML = '<div class="inventory-empty">No unlocked titles.</div>';
            this.colorListEl.innerHTML = '<div class="inventory-empty">No unlocked colors.</div>';
            this.frameListEl.innerHTML = '<div class="inventory-empty">No unlocked frames.</div>';
            this.achievementStatusEl.textContent = '';
            this.rewardWeekEl.textContent = 'Week: --';
            this.rewardResetEl.textContent = 'Reset in --:--:--';
            this.rewardGridEl.innerHTML = '<div class="inventory-empty">Login to claim weekly rewards.</div>';
            this.rewardClaimBtn.disabled = true;
            this.rewardStatusEl.textContent = '';
            this.rewardsChipEl.classList.add('hidden');
            this.applyProgressionClock(new Date().toISOString(), null, null);
            this.renderPlayOverview();
            this.renderAccountCosmetics();
            return;
        }

        const daily = progression.quests?.daily;
        const weekly = progression.quests?.weekly;
        const weeklyLogin = progression.weeklyLogin;
        const cosmetics = progression.cosmetics;
        const achievements = progression.achievements?.items || [];

        const renderQuestList = (host: HTMLDivElement, items: any[]) => {
            if (!Array.isArray(items) || !items.length) {
                host.innerHTML = '<div class="inventory-empty">No quest configured.</div>';
                return;
            }

            host.innerHTML = items.map((quest) => {
                const progress = toInt(quest.progress, 0, 0);
                const goal = Math.max(1, toInt(quest.goal, 1, 1));
                const pct = Math.max(0, Math.min(100, Math.floor((progress / goal) * 100)));
                const stateClass = quest.rewarded ? 'is-rewarded' : (quest.completed ? 'is-complete' : '');
                const reward = toInt(quest.rewardCoin, 0, 0);
                return `
                    <div class="menu-quest-item ${stateClass}">
                        <div class="menu-quest-top">
                            <span class="menu-quest-title">${quest.title}</span>
                            <span class="menu-quest-reward">+${reward} ${this.menuCurrency}</span>
                        </div>
                        <div class="menu-quest-desc">${quest.description || ''}</div>
                        <div class="menu-quest-bar">
                            <span style="width:${pct}%"></span>
                        </div>
                        <div class="menu-quest-progress">${Math.min(progress, goal)} / ${goal}</div>
                    </div>
                `;
            }).join('');
        };

        renderQuestList(this.questDailyListEl, daily?.items || []);
        renderQuestList(this.questWeeklyListEl, weekly?.items || []);

        const completedDaily = (daily?.items || []).filter((item: any) => !!item.rewarded).length;
        const completedWeekly = (weekly?.items || []).filter((item: any) => !!item.rewarded).length;
        this.questStatusEl.textContent = `Completed: Daily ${completedDaily}/${(daily?.items || []).length} | Weekly ${completedWeekly}/${(weekly?.items || []).length}`;

        this.achievementGridEl.innerHTML = achievements.length
            ? achievements.map((item: any) => {
                const current = toInt(item.current, 0, 0);
                const goal = Math.max(1, toInt(item.goal, 1, 1));
                const progress = Math.max(0, Math.min(100, Math.floor((current / goal) * 100)));
                const unlocked = !!item.unlocked;
                const rewardCoin = Math.max(0, toInt(item.rewardCoin, 0, 0));
                const rewardNameColorToken = `${item.rewardNameColor || ''}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                const rewardAvatarToken = `${item.rewardAvatar || ''}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                const rewardFrameToken = `${item.rewardAvatarFrame || ''}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                const rewardParts: string[] = [];
                if (item.rewardTitle) {
                    rewardParts.push(`<span class="menu-achievement-reward-chip">TITLE: ${escapeHtml(`${item.rewardTitle}`)}</span>`);
                }
                if (rewardNameColorToken) {
                    rewardParts.push(`<span class="menu-achievement-reward-chip name-${rewardNameColorToken}">NAME: ${escapeHtml(`${item.rewardNameColor}`)}</span>`);
                }
                if (rewardAvatarToken) {
                    rewardParts.push(`<span class="menu-achievement-reward-chip">AVATAR: ${escapeHtml(getAvatarLabel(item.rewardAvatar))}</span>`);
                }
                if (rewardFrameToken) {
                    rewardParts.push(`<span class="menu-achievement-reward-chip frame-${rewardFrameToken}">FRAME: ${escapeHtml(`${item.rewardAvatarFrame}`)}</span>`);
                }
                if (rewardCoin > 0) {
                    rewardParts.push(`<span class="menu-achievement-reward-chip is-coin">+${rewardCoin} ${escapeHtml(this.menuCurrency)}</span>`);
                }
                return `
                    <div class="menu-achievement-item ${unlocked ? 'is-unlocked' : ''}">
                        <div class="menu-achievement-title">${item.title}</div>
                        <div class="menu-achievement-desc">${item.description || ''}</div>
                        <div class="menu-achievement-meta">${Math.min(current, goal)} / ${goal}</div>
                        <div class="menu-achievement-bar"><span style="width:${progress}%"></span></div>
                        <div class="menu-achievement-reward">
                            ${rewardParts.length ? rewardParts.join('') : '<span class="menu-achievement-reward-chip">No cosmetic reward</span>'}
                        </div>
                    </div>
                `;
            }).join('')
            : '<div class="inventory-empty">No achievements configured.</div>';

        this.renderCosmeticOptions(this.titleListEl, 'title', cosmetics?.unlockedTitles || [], cosmetics?.title || '');
        this.renderCosmeticOptions(this.colorListEl, 'nameColor', cosmetics?.unlockedNameColors || [], cosmetics?.nameColor || '');
        this.renderCosmeticOptions(this.frameListEl, 'avatarFrame', cosmetics?.unlockedAvatarFrames || [], cosmetics?.avatarFrame || '');

        const weeklyItems = Array.isArray(weeklyLogin?.items) ? weeklyLogin.items : [];
        const claimableCount = Math.max(0, toInt(weeklyLogin?.claimableCount, 0, 0));
        this.rewardWeekEl.textContent = `Week: ${weeklyLogin?.key || '--'}`;
        const hasWeeklyReset = !!weeklyLogin?.nextResetAt;
        const weeklyResetSec = toInt(weeklyLogin?.resetInSeconds, 0, 0);
        const hr = Math.floor(weeklyResetSec / 3600);
        const min = Math.floor((weeklyResetSec % 3600) / 60);
        const sec = weeklyResetSec % 60;
        const weeklyResetClock = hasWeeklyReset
            ? `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
            : '--:--:--';
        this.rewardResetEl.textContent = `Reset in ${weeklyResetClock}`;

        this.rewardGridEl.innerHTML = weeklyItems.length
            ? weeklyItems.map((item: any) => {
                const dayNum = Math.max(1, Math.min(7, toInt(item.day, 1, 1)));
                const label = WEEKLY_LOGIN_DAY_LABELS[dayNum - 1] || `DAY ${dayNum}`;
                const rewardCoin = toInt(item.rewardCoin, 0, 0);
                const stateClass = item.claimed ? 'is-claimed' : (item.claimable ? 'is-claimable' : (item.missed ? 'is-missed' : 'is-locked'));
                const stateText = item.claimed ? 'CLAIMED' : (item.claimable ? 'READY' : (item.missed ? 'MISSED' : 'LOCKED'));
                return `
                    <div class="forbox-reward-card ${stateClass}">
                        <div class="forbox-reward-card-day">${label}</div>
                        <div class="forbox-reward-card-coin">+${rewardCoin} ${this.menuCurrency}</div>
                        <div class="forbox-reward-card-state">${stateText}</div>
                    </div>
                `;
            }).join('')
            : '<div class="inventory-empty">No weekly login rewards configured.</div>';

        this.rewardClaimBtn.disabled = !this.isAuthenticated() || claimableCount < 1;
        if (!this.isAuthenticated()) {
            this.rewardStatusEl.textContent = 'Login required to claim rewards.';
        } else if (claimableCount > 0) {
            this.rewardStatusEl.textContent = 'Today reward is ready. Click CLAIM.';
        } else {
            this.rewardStatusEl.textContent = 'No claimable reward for now.';
        }

        this.rewardsChipEl.textContent = `${claimableCount}`;
        this.rewardsChipEl.classList.toggle('hidden', claimableCount < 1);

        this.applyProgressionClock(progression.serverTime, daily?.nextResetAt || null, weekly?.nextResetAt || null);
        this.renderPlayOverview();
        this.renderAccountCosmetics();
    }

    private applyProgressionClock(serverTimeIso: string, dailyResetIso: string | null, weeklyResetIso: string | null) {
        if (this.progressionCountdownInterval !== null) {
            window.clearInterval(this.progressionCountdownInterval);
            this.progressionCountdownInterval = null;
        }

        if (!dailyResetIso && !weeklyResetIso) {
            this.progressionServerOffsetMs = 0;
            this.dailyResetAtMs = 0;
            this.weeklyResetAtMs = 0;
            this.questDailyResetEl.textContent = '--:--:--';
            this.questWeeklyResetEl.textContent = '--:--:--';
            this.rewardResetEl.textContent = 'Reset in --:--:--';
            return;
        }

        const serverTimeMs = Number(new Date(serverTimeIso).getTime()) || Date.now();
        this.progressionServerOffsetMs = serverTimeMs - Date.now();
        this.dailyResetAtMs = dailyResetIso ? (Number(new Date(dailyResetIso).getTime()) || 0) : 0;
        this.weeklyResetAtMs = weeklyResetIso ? (Number(new Date(weeklyResetIso).getTime()) || 0) : 0;

        this.updateProgressionCountdownText();
        this.progressionCountdownInterval = window.setInterval(() => {
            this.updateProgressionCountdownText();
        }, 1000);
    }

    private updateProgressionCountdownText() {
        const serverNow = Date.now() + this.progressionServerOffsetMs;
        const toClock = (target: number) => {
            if (!target) return '--:--:--';
            const remainSec = Math.max(0, Math.floor((target - serverNow) / 1000));
            const h = Math.floor(remainSec / 3600);
            const m = Math.floor((remainSec % 3600) / 60);
            const s = remainSec % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        this.questDailyResetEl.textContent = toClock(this.dailyResetAtMs);
        const weeklyClock = toClock(this.weeklyResetAtMs);
        this.questWeeklyResetEl.textContent = weeklyClock;
        this.rewardResetEl.textContent = `Reset in ${weeklyClock}`;
    }

    private async claimWeeklyLoginReward() {
        if (!this.sessionToken || !this.currentUser) {
            this.setInlineMessage(this.rewardStatusEl, 'Login required.');
            return;
        }

        this.rewardClaimBtn.disabled = true;
        try {
            const payload = await backendApi.claimWeeklyLoginReward(this.sessionToken);
            this.currentUser.wallet = Math.max(0, toInt(payload.wallet, this.currentUser.wallet, 0));
            this.currentUser.progression = payload.progression;
            if (payload.currency) this.menuCurrency = this.toUiCurrencyLabel(payload.currency);
            this.refreshWallet();
            this.renderProgressionPanels();
            this.setInlineMessage(this.rewardStatusEl, `Claimed +${toInt(payload.rewardCoin, 0, 0)} ${this.menuCurrency}`);
        } catch (error: any) {
            const message = `${error?.message || 'Claim failed.'}`;
            if (message.toLowerCase().includes('already-claimed')) {
                this.setInlineMessage(this.rewardStatusEl, 'Today reward already claimed.');
            } else {
                this.setInlineMessage(this.rewardStatusEl, message);
            }
            this.renderProgressionPanels();
        } finally {
            if (this.currentTab === 'rewards') {
                this.rewardClaimBtn.disabled = !this.isAuthenticated()
                    || Math.max(0, toInt(this.currentUser?.progression?.weeklyLogin?.claimableCount, 0, 0)) < 1;
            }
        }
    }

    private async equipProgression(type: ProgressionEquipType, value: string) {
        if (!this.sessionToken || !this.currentUser) {
            this.setInlineMessage(this.achievementStatusEl, 'Login required.');
            return;
        }
        if (!type || !value) return;

        try {
            const payload = await backendApi.equipProgression(this.sessionToken, type, value);
            this.currentUser.progression = payload.progression;
            this.renderProgressionPanels();
            this.setInlineMessage(this.achievementStatusEl, `${type} equipped: ${value}`);
            window.dispatchEvent(new CustomEvent('game:profile-updated', {
                detail: {
                    progression: payload.progression,
                },
            }));
            window.dispatchEvent(new CustomEvent('game:leaderboard-updated'));
        } catch (error: any) {
            const message = `${error?.message || ''}`.toLowerCase();
            if (message.includes('route not found')) {
                const cosmetics = this.currentUser.progression?.cosmetics;
                if (!cosmetics) return;
                const allowed = type === 'title'
                    ? (cosmetics.unlockedTitles || [])
                    : type === 'nameColor'
                        ? (cosmetics.unlockedNameColors || [])
                        : type === 'avatar'
                            ? (cosmetics.unlockedAvatars || [])
                            : (cosmetics.unlockedAvatarFrames || []);
                if (!allowed.includes(value)) {
                    this.setInlineMessage(this.achievementStatusEl, 'Cosmetic is not unlocked.');
                    return;
                }
                if (type === 'title') cosmetics.title = value;
                if (type === 'nameColor') cosmetics.nameColor = value;
                if (type === 'avatar') cosmetics.avatar = value;
                if (type === 'avatarFrame') cosmetics.avatarFrame = value;
                this.renderProgressionPanels();
                this.setInlineMessage(this.achievementStatusEl, 'Applied locally (backend route missing).');
                window.dispatchEvent(new CustomEvent('game:profile-updated', {
                    detail: {
                        progression: this.currentUser.progression,
                    },
                }));
                return;
            }
            this.setInlineMessage(this.achievementStatusEl, error?.message || 'Equip failed.');
        }
    }

    private renderCaseCards(cases: Record<string, number>) {
        const rows = this.caseCatalog.map((caseDef) => {
            const count = toInt(cases[caseDef.id], 0, 0);
            return `
                <button class="inventory-case-card ${count > 0 ? 'has-case' : ''}" data-case-id="${caseDef.id}">
                    <div class="case-card-top">
                        <span class="case-card-title">${caseDef.title}</span>
                        <span class="case-card-count">x${count}</span>
                    </div>
                    <div class="case-card-price">Open: ${toInt(caseDef.openPriceCoin, 0, 0)} ${this.menuCurrency}</div>
                    <div class="case-card-action">Inspect & Open</div>
                </button>
            `;
        }).join('');

        this.inventoryCasesEl.innerHTML = rows || '<div class="inventory-empty">No cases configured.</div>';

        this.inventoryCasesEl.querySelectorAll('.inventory-case-card').forEach((el) => {
            el.addEventListener('click', () => {
                const caseId = (el as HTMLButtonElement).dataset.caseId || '';
                this.openCaseInspectModal(caseId);
            });
        });
    }

    private renderSkinCards(skins: string[], equipped: AuthUser['inventory']['equipped']) {
        if (!skins.length) {
            this.inventorySkinsEl.innerHTML = '<div class="inventory-empty">No skins yet. Buy from shop or open cases.</div>';
            return { shown: 0, total: 0 };
        }

        const query = `${this.inventoryFilterQuery || ''}`.trim().toLowerCase();
        const selectedWeapon = `${this.inventoryWeaponFilter || ''}`.trim().toLowerCase();
        const equippedSet = new Set(Object.values(equipped || {}));

        const rows = skins.map((skin, idx) => {
            const invMeta = this.currentUser?.inventory?.skinMeta?.[skin];
            const catalogMeta = this.skinMetaByName.get(skin);
            const rarity = (invMeta?.rarity || catalogMeta?.rarity || 'milspec') as ItemRarity;
            const slot = this.resolveSlotForSkin(skin, `${invMeta?.slot || catalogMeta?.slot || ''}`);
            const inferredWeaponId = this.inferWeaponIdFromSkinName(skin, `${invMeta?.weaponId || catalogMeta?.weaponId || ''}`);
            const fallbackWeaponId = slot === 'knife'
                ? 'm9'
                : (slot === 'pistol' ? 'usp_s' : (slot === 'character' ? 'character' : 'ak47'));
            const weaponId = inferredWeaponId || fallbackWeaponId;
            const weaponLabel = this.getWeaponDisplayName(weaponId, slot);
            const imageUrl = this.getWeaponImageUrl(weaponId, skin);
            return {
                idx,
                skin,
                rarity,
                slot,
                weaponId,
                weaponLabel,
                isEquipped: equippedSet.has(skin),
                imageUrl,
            };
        });

        const weaponRows = rows.filter((item) => !selectedWeapon || item.weaponId === selectedWeapon);
        const filtered = weaponRows.filter((item) => {
            const matchQuery = !query
                || item.skin.toLowerCase().includes(query)
                || item.weaponLabel.toLowerCase().includes(query)
                || item.slot.toLowerCase().includes(query);
            return matchQuery;
        });

        if (!filtered.length) {
            const filterLabel = selectedWeapon ? this.getWeaponDisplayName(selectedWeapon) : 'selected weapon';
            const emptyCopy = weaponRows.length
                ? `No skins match your search for ${filterLabel}.`
                : `No skins unlocked yet for ${filterLabel}.`;
            this.inventorySkinsEl.innerHTML = `<div class="inventory-empty">${emptyCopy}</div>`;
            return { shown: 0, total: weaponRows.length };
        }

        filtered.sort((a, b) => {
            if (a.isEquipped !== b.isEquipped) return a.isEquipped ? -1 : 1;
            const rarityDiff = (RARITY_ORDER[`${b.rarity}`.toLowerCase()] || 0) - (RARITY_ORDER[`${a.rarity}`.toLowerCase()] || 0);
            if (rarityDiff) return rarityDiff;
            return a.skin.localeCompare(b.skin, 'en', { sensitivity: 'base' });
        });

        this.inventorySkinsEl.innerHTML = filtered.map((item) => `
            <button class="inventory-skin-card ${rarityClass(item.rarity)} ${item.isEquipped ? 'is-equipped' : ''}" data-skin="${escapeHtml(item.skin)}" data-slot="${item.slot}" data-weapon-id="${item.weaponId}">
                <span class="inventory-skin-art" style="background-image:url('${item.imageUrl}')"></span>
                <span class="skin-index">#${item.idx + 1}</span>
                <span class="skin-name">${escapeHtml(item.skin)}</span>
                <span class="skin-meta">${item.weaponLabel.toUpperCase()} | ${`${item.rarity}`.toUpperCase()}</span>
                ${item.isEquipped ? '<span class="skin-badge">EQUIPPED</span>' : ''}
            </button>
        `).join('');

        this.inventorySkinsEl.querySelectorAll('.inventory-skin-card').forEach((el) => {
            el.addEventListener('click', () => {
                const skin = (el as HTMLButtonElement).dataset.skin || '';
                const slot = (el as HTMLButtonElement).dataset.slot as EquipSlot;
                this.equipSkin(slot, skin);
            });
        });

        return { shown: filtered.length, total: weaponRows.length };
    }

    private renderLoadoutSelectors(loadout: LoadoutProfile, locked: boolean) {
        const normalizePrimaryCategory = (rawCategory: string) => {
            const value = `${rawCategory || ''}`.trim().toLowerCase();
            if (value.includes('smg')) return 'smg';
            if (value.includes('sniper')) return 'sniper';
            if (value.includes('shotgun')) return 'shotgun';
            if (value.includes('machine') || value.includes('mg')) return 'mg';
            if (value.includes('rifle')) return 'rifle';
            return 'other';
        };

        const categoryLabels: Record<string, string> = {
            all: 'ALL',
            smg: 'SMG',
            rifle: 'RIFLE',
            sniper: 'SNIPER',
            shotgun: 'SHOTGUN',
            mg: 'MG',
        };

        const renderSlot = (host: HTMLDivElement, slot: LoadoutSlot) => {
            const allOptions = this.weaponCatalog.filter((item) => item.slot === slot);
            let options = allOptions;
            let categoryBar = '';

            if (slot === 'primary') {
                const categories = ['all', 'smg', 'rifle', 'sniper', 'shotgun', 'mg'];
                if (!categories.includes(this.loadoutPrimaryCategoryFilter)) this.loadoutPrimaryCategoryFilter = 'all';
                options = this.loadoutPrimaryCategoryFilter === 'all'
                    ? allOptions
                    : allOptions.filter((item) => normalizePrimaryCategory(item.category) === this.loadoutPrimaryCategoryFilter);
                categoryBar = `
                    <div class="menu-loadout-category-row">
                        ${categories.map((category) => `
                            <button
                                type="button"
                                class="menu-loadout-cat-btn ${this.loadoutPrimaryCategoryFilter === category ? 'is-active' : ''}"
                                data-loadout-primary-category="${category}"
                            >${categoryLabels[category]}</button>
                        `).join('')}
                    </div>
                `;
            }

            const optionsHtml = options.map((item) => `
                <button
                    class="menu-loadout-btn ${loadout[slot] === item.weaponId ? 'is-active' : ''}"
                    data-loadout-slot="${slot}"
                    data-weapon-id="${item.weaponId}"
                    ${locked ? 'disabled' : ''}
                >
                    <span class="menu-loadout-btn-name">${item.displayName}</span>
                    <span class="menu-loadout-btn-price">$${toInt(item.priceCoin, 0, 0)}</span>
                </button>
            `).join('') || '<div class="inventory-empty">No weapons configured.</div>';

            host.innerHTML = `${categoryBar}<div class="menu-loadout-option-list">${optionsHtml}</div>`;

            if (slot === 'primary') {
                host.querySelectorAll('.menu-loadout-cat-btn').forEach((el) => {
                    el.addEventListener('click', () => {
                        this.loadoutPrimaryCategoryFilter = `${(el as HTMLButtonElement).dataset.loadoutPrimaryCategory || 'all'}`.trim().toLowerCase();
                        this.renderLoadoutSelectors(this.currentUser?.loadout || loadout, this.isLoadoutLocked());
                    });
                });
            }

            host.querySelectorAll('.menu-loadout-btn').forEach((el) => {
                el.addEventListener('click', () => {
                    const target = el as HTMLButtonElement;
                    const selectedSlot = (target.dataset.loadoutSlot || '') as LoadoutSlot;
                    const weaponId = `${target.dataset.weaponId || ''}`;
                    this.equipLoadout(selectedSlot, weaponId);
                });
            });
        };

        renderSlot(this.loadoutPrimaryEl, 'primary');
        renderSlot(this.loadoutSecondaryEl, 'secondary');
        renderSlot(this.loadoutKnifeEl, 'knife');

        if (locked) {
            this.loadoutMessageEl.textContent = 'Loadout locked during active FFA round.';
        } else if (!this.loadoutMessageEl.textContent) {
            this.loadoutMessageEl.textContent = '';
        }
    }

    private isLoadoutLocked() {
        return this.gameStarted;
    }

    private async equipLoadout(slot: LoadoutSlot, weaponId: string) {
        if (!this.sessionToken || !this.currentUser) {
            this.setInlineMessage(this.loadoutMessageEl, 'Login required.');
            return;
        }
        if (this.isLoadoutLocked()) {
            this.setInlineMessage(this.loadoutMessageEl, 'Loadout is locked until match ends.');
            return;
        }
        try {
            const payload = await backendApi.equipLoadout(this.sessionToken, slot, weaponId);
            this.currentUser.loadout = payload.loadout;
            this.renderInventory();
            const picked = this.weaponCatalog.find((item) => item.weaponId === weaponId);
            this.setInlineMessage(this.loadoutMessageEl, `${slot.toUpperCase()} set: ${picked ? picked.displayName : weaponId}`);
        } catch (error: any) {
            const message = `${error?.message || ''}`;
            if (/route not found/i.test(message)) {
                this.currentUser.loadout = {
                    ...(this.currentUser.loadout || { ...FALLBACK_LOADOUT }),
                    [slot]: weaponId,
                };
                this.renderInventory();
                this.setInlineMessage(this.loadoutMessageEl, 'Backend loadout endpoint missing. Applied locally.');
                return;
            }
            this.setInlineMessage(this.loadoutMessageEl, error?.message || 'Loadout update failed.');
        }
    }

    private openCaseInspectModal(caseId: string, offerId: string | null = null) {
        if (!caseId) return;
        const caseDef = this.caseCatalog.find((item) => item.id === caseId);
        if (!caseDef) return;

        this.selectedCaseId = caseId;
        this.selectedCaseOfferId = offerId && `${offerId}`.trim() ? `${offerId}`.trim() : null;
        this.caseModalResultEl.textContent = '';
        this.caseModalResultEl.className = 'case-modal-result';
        this.caseModalTitleEl.textContent = caseDef.title;
        const offer = this.selectedCaseOfferId
            ? this.shopOffers.find((item) => item.type === 'case' && item.id === this.selectedCaseOfferId)
            : null;
        const displayPrice = toInt(offer?.priceCoin ?? offer?.price ?? caseDef.openPriceCoin, 0, 0);
        this.caseModalPriceEl.textContent = `${displayPrice}`;
        this.caseModalOpenBtn.disabled = false;
        this.caseModalOpenBtn.textContent = 'BUY & OPEN CASE';
        const featuredWeapon = this.getCaseFeaturedWeapon(caseDef);
        this.caseModalContextEl.textContent = featuredWeapon
            ? `Inspect ${featuredWeapon.label} and the rest of the drop pool, then buy to roll this case.`
            : 'Inspect all possible drops, then buy to roll this case.';
        const caseImage = this.getCasePreviewImage(caseDef.id, 0);
        if (featuredWeapon?.imageUrl) {
            this.caseModalArtEl.style.backgroundImage = `linear-gradient(180deg, rgba(7, 11, 17, 0.32), rgba(7, 11, 17, 0.72)), url('${featuredWeapon.imageUrl}'), url('${caseImage}'), url('${caseBuyRefUrl}')`;
            this.caseModalArtEl.style.backgroundPosition = 'center, center, center, center';
            this.caseModalArtEl.style.backgroundSize = 'cover, auto 72%, contain, cover';
            this.caseModalArtEl.style.backgroundRepeat = 'no-repeat, no-repeat, no-repeat, no-repeat';
        } else {
            this.caseModalArtEl.style.backgroundImage = `linear-gradient(180deg, rgba(7, 11, 17, 0.38), rgba(7, 11, 17, 0.68)), url('${caseImage}'), url('${caseBuyRefUrl}')`;
            this.caseModalArtEl.style.backgroundPosition = 'center, center, center';
            this.caseModalArtEl.style.backgroundSize = 'contain, cover, cover';
            this.caseModalArtEl.style.backgroundRepeat = 'no-repeat, no-repeat, no-repeat';
        }

        const sortedDrops = [...(caseDef.drops || [])].sort((a, b) => {
            const av = RARITY_ORDER[`${a.rarity}`.toLowerCase()] || 0;
            const bv = RARITY_ORDER[`${b.rarity}`.toLowerCase()] || 0;
            return bv - av;
        });

        this.caseModalDropsEl.innerHTML = sortedDrops.map(drop => {
            const chanceText = typeof drop.chance === 'number' ? `${drop.chance.toFixed(2)}%` : `${toInt(drop.weight, 0, 0)} wt`;
            return `
                <div class="case-drop-item ${rarityClass(drop.rarity)}">
                    <span class="case-drop-skin">${drop.skin}</span>
                    <span class="case-drop-rarity">${`${drop.rarity || 'milspec'}`.toUpperCase()}</span>
                    <span class="case-drop-chance">${chanceText}</span>
                </div>
            `;
        }).join('');

        const previewTrack = this.buildPreviewTrack(caseDef);
        this.renderCaseTrack(previewTrack, 5);

        this.caseModalEl.classList.remove('hidden');
    }

    private hideCaseModal() {
        this.selectedCaseId = null;
        this.selectedCaseOfferId = null;
        this.caseModalEl.classList.add('hidden');
    }

    private buildPreviewTrack(caseDef: CaseCatalogItem) {
        const source = caseDef.drops || [];
        const output: Array<{ skin: string; rarity: ItemRarity }> = [];
        if (!source.length) return output;
        for (let i = 0; i < 28; i++) {
            const item = source[i % source.length];
            output.push({ skin: item.skin, rarity: item.rarity || 'milspec' });
        }
        return output;
    }

    private async handleOpenCaseWithAnimation() {
        if (!this.sessionToken || !this.currentUser) {
            this.caseModalResultEl.textContent = 'Login required.';
            return;
        }
        if (!this.selectedCaseId) {
            this.caseModalResultEl.textContent = 'Select a case first.';
            return;
        }
        if (this.caseSpinLocked) return;

        this.caseSpinLocked = true;
        this.caseModalOpenBtn.disabled = true;
        this.caseModalCloseBtn.disabled = true;
        this.caseModalArtEl.style.backgroundImage = `linear-gradient(180deg, rgba(5, 8, 13, 0.3), rgba(5, 8, 13, 0.7)), url('${caseAnimationRefUrl}')`;
        this.caseModalArtEl.style.backgroundPosition = 'center';
        this.caseModalArtEl.style.backgroundSize = 'cover';
        this.caseModalArtEl.style.backgroundRepeat = 'no-repeat';
        this.caseModalResultEl.textContent = 'Buying and opening case...';

        try {
            let spinResult: CaseSpinResult;
            if (this.selectedCaseOfferId) {
                const purchasePayload = await backendApi.purchase(this.sessionToken, this.selectedCaseOfferId, 1, { autoOpenCase: true });
                if (this.currentUser) {
                    this.currentUser.wallet = purchasePayload.wallet;
                    this.currentUser.inventory = purchasePayload.inventory;
                }
                this.menuCurrency = this.toUiCurrencyLabel(purchasePayload.currency || 'coin');
                if (!purchasePayload.caseOpen) {
                    throw new Error('Case opening result missing from purchase.');
                }
                spinResult = {
                    skin: purchasePayload.caseOpen.skin,
                    rarity: purchasePayload.caseOpen.rarity,
                    spinTrack: purchasePayload.caseOpen.spinTrack,
                    stopIndex: purchasePayload.caseOpen.stopIndex,
                    durationMs: purchasePayload.caseOpen.durationMs,
                };
            } else {
                const payload = await backendApi.openCaseWithCoin(this.sessionToken, this.selectedCaseId);
                if (this.currentUser) {
                    this.currentUser.wallet = payload.wallet;
                    this.currentUser.inventory = payload.inventory;
                }
                this.menuCurrency = this.toUiCurrencyLabel(payload.currency || 'coin');
                spinResult = {
                    skin: payload.skin,
                    rarity: payload.rarity,
                    spinTrack: payload.spinTrack,
                    stopIndex: payload.stopIndex,
                    durationMs: payload.durationMs,
                };
            }

            this.refreshWallet();
            this.renderInventory();

            await this.playCaseReel(spinResult);

            const wonSkinName = spinResult.skin?.name || 'UNKNOWN';
            this.caseModalResultEl.className = `case-modal-result ${rarityClass(spinResult.rarity)}`;
            this.caseModalResultEl.textContent = `UNBOXED: ${wonSkinName} (${`${spinResult.rarity}`.toUpperCase()})`;
            this.setInlineMessage(this.inventoryMessageEl, `Unboxed ${wonSkinName}`);
            this.showWeaponReviewModal(spinResult.skin, spinResult.rarity);
        } catch (error: any) {
            this.caseModalResultEl.className = 'case-modal-result is-error';
            this.caseModalResultEl.textContent = error?.message || 'Case opening failed.';
        } finally {
            this.caseSpinLocked = false;
            this.caseModalOpenBtn.disabled = false;
            this.caseModalCloseBtn.disabled = false;
        }
    }

    private renderCaseTrack(track: Array<{ skin: string; rarity: ItemRarity }>, highlightIndex: number) {
        this.caseModalTrackEl.innerHTML = track.map((item, idx) => `
            <div class="case-reel-item ${rarityClass(item.rarity)} ${idx === highlightIndex ? 'is-target' : ''}">
                <div class="case-reel-name">${item.skin}</div>
                <div class="case-reel-rarity">${`${item.rarity}`.toUpperCase()}</div>
            </div>
        `).join('');
    }

    private async playCaseReel(result: CaseSpinResult) {
        const track = Array.isArray(result.spinTrack) && result.spinTrack.length
            ? result.spinTrack
            : this.buildPreviewTrack(this.caseCatalog.find((item) => item.id === this.selectedCaseId) || FALLBACK_CASES[0]);
        const stopIndex = Math.max(0, Math.min(track.length - 1, toInt(result.stopIndex, 0, 0)));
        const durationMs = Math.max(2200, toInt(result.durationMs, 4600, 1200));

        this.renderCaseTrack(track, stopIndex);

        const viewport = this.mainMenu.querySelector('#case-reel-viewport') as HTMLDivElement;
        const sampleItem = this.caseModalTrackEl.querySelector('.case-reel-item') as HTMLDivElement;
        const itemWidth = sampleItem ? sampleItem.getBoundingClientRect().width + 10 : 170;
        const viewportWidth = viewport ? viewport.getBoundingClientRect().width : 760;

        const centerOffset = (viewportWidth / 2) - ((stopIndex * itemWidth) + (itemWidth / 2));
        const startOffset = centerOffset + (itemWidth * 8);

        this.caseModalTrackEl.style.transition = 'none';
        this.caseModalTrackEl.style.transform = `translateX(${startOffset}px)`;
        this.caseModalTrackEl.getBoundingClientRect();

        requestAnimationFrame(() => {
            this.caseModalTrackEl.style.transition = `transform ${durationMs}ms cubic-bezier(0.08, 0.72, 0.16, 1)`;
            this.caseModalTrackEl.style.transform = `translateX(${centerOffset}px)`;
        });

        await this.wait(durationMs + 90);
    }

    private wait(ms: number) {
        return new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), ms);
        });
    }

    private toEquipSlotFromSkinSlot(rawSlot: string | undefined, skinName: string): EquipSlot {
        const key = `${rawSlot || ''}`.trim().toLowerCase();
        if (key === 'primary' || key === 'rifle') return 'rifle';
        if (key === 'secondary' || key === 'pistol') return 'pistol';
        if (key === 'knife') return 'knife';
        if (key === 'character') return 'character';
        return this.resolveSlotForSkin(skinName, key);
    }

    private showWeaponReviewModal(skin: SkinItem, rarity: ItemRarity) {
        if (!skin) return;
        const skinName = `${skin.name || 'UNKNOWN'}`.trim();
        const equipSlot = this.toEquipSlotFromSkinSlot(`${skin.slot || ''}`, skinName);
        this.pendingReviewSkin = {
            ...skin,
            name: skinName,
            rarity: rarity || skin.rarity || 'milspec',
            slot: equipSlot,
        };

        this.weaponReviewNameEl.textContent = skinName;
        const weaponId = `${skin.weaponId || ''}`.toUpperCase();
        this.weaponReviewMetaEl.textContent = `${`${rarity || skin.rarity || 'milspec'}`.toUpperCase()} | ${equipSlot.toUpperCase()}${weaponId ? ` | ${weaponId}` : ''}`;
        this.weaponReviewArtEl.style.backgroundImage = `linear-gradient(180deg, rgba(8, 12, 19, 0.26), rgba(8, 12, 19, 0.72)), url('${weaponReviewRefUrl}')`;
        this.weaponReviewArtEl.style.backgroundPosition = 'center';
        this.weaponReviewArtEl.style.backgroundSize = 'cover';
        this.weaponReviewArtEl.style.backgroundRepeat = 'no-repeat';
        this.weaponReviewEquipBtn.disabled = !this.isAuthenticated();
        this.weaponReviewModalEl.classList.remove('hidden');
    }

    private hideWeaponReviewModal() {
        this.pendingReviewSkin = null;
        this.weaponReviewModalEl.classList.add('hidden');
    }

    private async applyWeaponReviewEquip() {
        if (!this.pendingReviewSkin) {
            this.hideWeaponReviewModal();
            return;
        }
        const equipSlot = this.toEquipSlotFromSkinSlot(`${this.pendingReviewSkin.slot || ''}`, this.pendingReviewSkin.name);
        const skinName = `${this.pendingReviewSkin.name || ''}`;
        await this.equipSkin(equipSlot, skinName);
        this.hideWeaponReviewModal();
    }

    private async equipSkin(slot: EquipSlot, skin: string) {
        if (!this.sessionToken || !this.currentUser) {
            this.setInlineMessage(this.inventoryMessageEl, 'Login required.');
            return;
        }
        if (this.isLoadoutLocked()) {
            this.setInlineMessage(this.inventoryMessageEl, 'Skin changes are locked during active FFA round.');
            return;
        }
        if (!SLOT_SET.has(slot)) {
            this.setInlineMessage(this.inventoryMessageEl, 'Invalid slot.');
            return;
        }

        try {
            const payload = await backendApi.equip(this.sessionToken, slot, skin);
            this.currentUser.inventory.equipped = payload.equipped;
            this.renderInventory();
            this.setInlineMessage(this.inventoryMessageEl, `${slot.toUpperCase()} equipped: ${skin}`);
        } catch (error: any) {
            const message = `${error?.message || ''}`;
            if (/route not found/i.test(message)) {
                this.currentUser.inventory.equipped[slot] = skin;
                this.renderInventory();
                this.setInlineMessage(this.inventoryMessageEl, 'Backend equip endpoint missing. Applied locally.');
                return;
            }
            this.setInlineMessage(this.inventoryMessageEl, error?.message || 'Equip failed.');
        }
    }

    private async autoEquipFromOwned(slot: EquipSlot) {
        if (!this.sessionToken || !this.currentUser) {
            this.setInlineMessage(this.inventoryMessageEl, 'Login required.');
            return;
        }
        if (this.isLoadoutLocked()) {
            this.setInlineMessage(this.inventoryMessageEl, 'Skin changes are locked during active FFA round.');
            return;
        }

        const skins = this.currentUser.inventory.skins || [];
        if (!skins.length) {
            this.setInlineMessage(this.inventoryMessageEl, 'No skins in inventory.');
            return;
        }

        const matching = [...skins].reverse().find((skin) => this.resolveSlotForSkin(skin, this.skinMetaByName.get(skin)?.slot) === slot);
        const skin = matching || skins[skins.length - 1];
        this.equipSkin(slot, skin);
    }

    private resolveSlotForSkin(skin: string, knownSlot?: string): EquipSlot {
        const normalized = `${knownSlot || ''}`.trim().toLowerCase();
        if (normalized === 'primary') return 'rifle';
        if (normalized === 'secondary') return 'pistol';
        if (normalized === 'rifle' || normalized === 'pistol' || normalized === 'knife' || normalized === 'character') {
            return normalized as EquipSlot;
        }

        const lower = `${skin}`.toLowerCase();
        if (lower.includes('usp') || lower.includes('pistol')) return 'pistol';
        if (lower.includes('knife') || lower.includes('m9')) return 'knife';
        if (lower.includes('operator') || lower.includes('outfit') || lower.includes('heavy') || lower.includes('gloves')) return 'character';
        return 'rifle';
    }

    private rebuildSkinMetaIndex() {
        this.skinMetaByName.clear();

        this.caseCatalog.forEach((caseDef) => {
            (caseDef.drops || []).forEach((drop) => {
                this.skinMetaByName.set(drop.skin, {
                    rarity: drop.rarity || 'milspec',
                    slot: `${drop.slot || ''}`,
                    weaponId: `${drop.weaponId || ''}`,
                });
            });
        });

        this.shopOffers.forEach((offer) => {
            if (offer.type !== 'skin' || !offer.skin) return;
            this.skinMetaByName.set(offer.skin, {
                rarity: offer.rarity || 'milspec',
                slot: offer.slot,
                weaponId: (offer as any).weaponId,
            });
        });

        const inventoryMeta = this.currentUser?.inventory?.skinMeta;
        if (inventoryMeta && typeof inventoryMeta === 'object') {
            Object.entries(inventoryMeta).forEach(([skinName, meta]) => {
                if (!skinName || !meta) return;
                this.skinMetaByName.set(skinName, {
                    rarity: (meta as any).rarity || 'milspec',
                    slot: `${(meta as any).slot || ''}`,
                    weaponId: `${(meta as any).weaponId || ''}`,
                });
            });
        }
    }

    private async renderLeaderboard() {
        this.leaderboardStatsControlsEl.classList.toggle('hidden', this.leaderboardView === 'premier');
        this.leaderboardStatsPanelEl.classList.toggle('hidden', this.leaderboardView !== 'stats');
        this.leaderboardPremierPanelEl.classList.toggle('hidden', this.leaderboardView !== 'premier');
        if (this.leaderboardView === 'premier') {
            await this.renderPremierSeasonLeaderboard();
            return;
        }

        const requestId = ++this.leaderboardRequestId;
        const periodLabel = this.boardPeriod.toUpperCase();
        const metricLabel = this.boardMetric.toUpperCase();
        this.leaderboardHeaderEl.textContent = `${periodLabel} | ${metricLabel} | LOADING`;
        this.leaderboardResetEl.textContent = '';

        try {
            const payload = await backendApi.leaderboard(this.boardPeriod, this.boardMetric, 20, this.sessionToken);
            if (requestId !== this.leaderboardRequestId) return;

            this.leaderboardHeaderEl.textContent = `${payload.period.toUpperCase()} | ${payload.metric.toUpperCase()}`;
            this.applyResetClock(payload.serverTime, payload.nextResetAt, payload.resetInSeconds);

            if (!payload.rows.length) {
                this.leaderboardListEl.innerHTML = '<div class="inventory-empty">No data yet.</div>';
                return;
            }

            const localUserId = this.currentUser?.id || '';
            this.leaderboardListEl.innerHTML = payload.rows.map(row => `
                <div class="leader-row ${row.userId === localUserId ? 'is-local' : ''}">
                    <span class="leader-rank">${row.rank}.</span>
                    <span class="leader-name frame-${row.cosmetics ? row.cosmetics.avatarFrame : 'default'}">
                        ${this.renderAvatarMarkup(row.cosmetics?.avatar || DEFAULT_AVATAR_ID, row.cosmetics?.avatarFrame || 'default', row.username)}
                        ${row.cosmetics && row.cosmetics.title ? `<span class="leader-title">${escapeHtml(row.cosmetics.title)}</span>` : ''}
                        <span class="leader-player-name name-${row.cosmetics ? row.cosmetics.nameColor : 'default'}">${row.userId === localUserId ? this.getDisplayName() : row.username}</span>
                    </span>
                    <span class="leader-premier ${row.premier ? `premier-${row.premier.tier}` : 'premier-unranked'}">${row.premier ? row.premier.display : '?'}</span>
                    <span class="leader-value">${this.boardMetric === 'kills' ? row.kills : row.wins} ${this.boardMetric}</span>
                </div>
            `).join('');
        } catch {
            if (requestId !== this.leaderboardRequestId) return;
            this.leaderboardHeaderEl.textContent = `${periodLabel} | ${metricLabel} | OFFLINE`;
            this.leaderboardResetEl.textContent = '';
            this.leaderboardListEl.innerHTML = '<div class="inventory-empty">Leaderboard unavailable.</div>';
        }
    }

    private async renderPremierSeasonLeaderboard() {
        const requestId = ++this.leaderboardRequestId;
        this.premierSeasonHeaderEl.textContent = 'CURRENT SEASON | LOADING';
        this.premierSeasonResetEl.textContent = '';
        this.premierSeasonMetaEl.textContent = '';
        this.premierRatingListEl.innerHTML = '<div class="inventory-empty">Loading...</div>';
        this.premierRatingSummaryEl.textContent = 'Loading current premier season...';

        try {
            const payload = await backendApi.premierLeaderboard(this.sessionToken);
            if (requestId !== this.leaderboardRequestId) return;
            this.premierSeasonHeaderEl.textContent = `PREMIER | ${payload.seasonLabel.toUpperCase()}`;
            this.applyResetClock(payload.serverTime, payload.nextResetAt, payload.resetInSeconds);
            this.renderPremierRatingList(payload);
        } catch {
            if (requestId !== this.leaderboardRequestId) return;
            this.premierSeasonHeaderEl.textContent = 'PREMIER | OFFLINE';
            this.premierSeasonResetEl.textContent = '';
            this.premierSeasonMetaEl.textContent = '';
            this.premierRatingListEl.innerHTML = '<div class="inventory-empty">Premier rating unavailable.</div>';
            this.premierRatingSummaryEl.textContent = 'Premier season data unavailable.';
        }
    }

    private renderPremierRatingList(payload: PremierLeaderboardResponse) {
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const viewerText = payload.viewerRank
            ? `Your seasonal rank is #${payload.viewerRank}. Showing 24 above and 25 below when available.`
            : 'You are not ranked yet. Showing the top 50 seasonal ratings.';
        this.premierSeasonMetaEl.textContent = `${payload.rankedPlayers} ranked players | Season ${payload.seasonId} | ${viewerText}`;
        this.premierRatingSummaryEl.textContent = `${payload.seasonLabel}: ${payload.rankedPlayers} ranked players, ${payload.totalPlayers} tracked players.`;

        if (!rows.length) {
            this.premierRatingListEl.innerHTML = '<div class="inventory-empty">No rating data.</div>';
            return;
        }

        const localUserId = this.currentUser?.id || '';
        this.premierRatingListEl.innerHTML = rows.map((row) => `
            <div class="forbox-premier-list-row ${row.userId === localUserId ? 'is-local' : ''}">
                <span class="forbox-premier-list-rank">#${row.rank}</span>
                <span class="forbox-premier-list-name">
                    ${this.renderAvatarMarkup(row.cosmetics?.avatar || DEFAULT_AVATAR_ID, row.cosmetics?.avatarFrame || 'default', row.username)}
                    ${row.cosmetics?.title ? `<span class="leader-title">${escapeHtml(row.cosmetics.title)}</span>` : ''}
                    <span class="leader-player-name name-${row.cosmetics?.nameColor || 'default'}">${escapeHtml(row.userId === localUserId ? this.getDisplayName() : row.username)}</span>
                </span>
                <span class="forbox-premier-list-rating premier-${row.premier.tier}">${escapeHtml(row.premier.display)}</span>
            </div>
        `).join('');
    }

    private applyResetClock(serverTimeIso: string, nextResetIso: string | null, resetInSeconds: number | null) {
        if (this.leaderboardCountdownInterval !== null) {
            window.clearInterval(this.leaderboardCountdownInterval);
            this.leaderboardCountdownInterval = null;
        }

        if (!nextResetIso || resetInSeconds === null) {
            this.leaderboardServerOffsetMs = 0;
            this.leaderboardResetAtMs = 0;
            this.getActiveLeaderboardResetHost().textContent = 'No reset';
            return;
        }

        const serverTimeMs = Number(new Date(serverTimeIso).getTime()) || Date.now();
        const nextResetMs = Number(new Date(nextResetIso).getTime()) || 0;
        this.leaderboardServerOffsetMs = serverTimeMs - Date.now();
        this.leaderboardResetAtMs = nextResetMs;

        this.updateResetCountdownText();
        this.leaderboardCountdownInterval = window.setInterval(() => {
            this.updateResetCountdownText();
        }, 1000);
    }

    private updateResetCountdownText() {
        if (!this.leaderboardResetAtMs) {
            this.getActiveLeaderboardResetHost().textContent = 'No reset';
            return;
        }

        const serverNow = Date.now() + this.leaderboardServerOffsetMs;
        const remainSec = Math.max(0, Math.floor((this.leaderboardResetAtMs - serverNow) / 1000));
        const h = Math.floor(remainSec / 3600);
        const m = Math.floor((remainSec % 3600) / 60);
        const s = remainSec % 60;
        this.getActiveLeaderboardResetHost().textContent = `Reset in ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} UTC`;
    }

    private async handleLogin() {
        const username = this.usernameInputEl.value.trim();
        const password = this.passwordInputEl.value;
        if (!username || !password) {
            this.setAuthStatus('Username and password required.');
            return;
        }
        this.setAuthStatus('Logging in...');
        try {
            const payload = await backendApi.login(username, password);
            this.sessionToken = payload.token;
            this.currentUser = payload.user;
            this.ensureCurrentUserShape();
            await this.fetchProgressionState();
            await this.refreshSocialState(false);
            await this.consumePendingPartyJoin(true);
            backendApi.storeToken(payload.token);
            this.updateAuthUi();
            this.refreshWallet();
            this.renderInventory();
            this.syncPlayerFromProfile();
            this.setAuthStatus(`Logged in as ${payload.user.username}`);
            void this.pullLobbyChat(false);
        } catch (error: any) {
            this.setAuthStatus(error?.message || 'Login failed.');
        }
    }

    private async handleRegister() {
        const username = this.usernameInputEl.value.trim();
        const password = this.passwordInputEl.value;
        if (!username || !password) {
            this.setAuthStatus('Username and password required.');
            return;
        }
        this.setAuthStatus('Creating account...');
        try {
            const payload = await backendApi.register(username, password);
            this.sessionToken = payload.token;
            this.currentUser = payload.user;
            this.ensureCurrentUserShape();
            await this.fetchProgressionState();
            await this.refreshSocialState(false);
            await this.consumePendingPartyJoin(true);
            backendApi.storeToken(payload.token);
            this.updateAuthUi();
            this.refreshWallet();
            this.renderInventory();
            this.syncPlayerFromProfile();
            this.setAuthStatus(`Account ready: ${payload.user.username}`);
            void this.pullLobbyChat(false);
        } catch (error: any) {
            this.setAuthStatus(error?.message || 'Register failed.');
        }
    }

    private handleLogout(notify = true) {
        this.sessionToken = null;
        this.currentUser = null;
        this.resetSocialState();
        backendApi.clearToken();
        this.updateAuthUi();
        this.refreshWallet();
        this.renderInventory();
        this.chatStatusEl.textContent = 'READ ONLY';
        if (notify) this.setAuthStatus('Logged out.');
    }

    private async fetchProfile() {
        if (!this.sessionToken) return false;
        try {
            const payload = await backendApi.profile(this.sessionToken);
            this.currentUser = payload.profile;
            this.ensureCurrentUserShape();
            await this.fetchProgressionState();
            await this.refreshSocialState(false);
            await this.consumePendingPartyJoin(true);
            if (payload.currency) this.menuCurrency = this.toUiCurrencyLabel(payload.currency);
            this.updateAuthUi();
            this.refreshWallet();
            this.renderInventory();
            this.syncPlayerFromProfile();
            return true;
        } catch {
            return false;
        }
    }

    private async fetchProgressionState() {
        if (!this.sessionToken || !this.currentUser) return;
        try {
            const payload = await backendApi.progression(this.sessionToken);
            if (payload.progression) this.currentUser.progression = payload.progression;
        } catch {
            // Older backend may not expose progression endpoints yet.
        }
    }

    private updateAuthUi() {
        const loggedIn = this.isAuthenticated();
        this.authFormEl.classList.toggle('hidden', loggedIn);
        this.authSessionEl.classList.toggle('hidden', !loggedIn);
        if (loggedIn) {
            this.authUserValueEl.textContent = this.getDisplayName();
        } else {
            this.authUserValueEl.textContent = '';
        }
        this.renderPlayOverview();
        this.renderAccountPanel();
        this.renderSocialPanel();
        this.updateChatAuthState();
    }

    private renderPlayOverview() {
        const user = this.currentUser;
        const progression = user?.progression as ProgressionProfile | undefined;
        const cosmetics = progression?.cosmetics;
        const displayName = user ? this.getDisplayName() : 'Guest Operator';
        const avatarId = cosmetics?.avatar || DEFAULT_AVATAR_ID;
        const avatarFrame = cosmetics?.avatarFrame || 'default';
        const stats = user?.stats;
        const premier = user?.premier;
        const matchesPlayed = Math.max(0, stats?.matchesPlayed || 0);
        const wins = Math.max(0, stats?.wins || 0);
        const kills = Math.max(0, stats?.kills || 0);
        const deaths = Math.max(0, stats?.deaths || 0);
        const kdRatio = deaths > 0 ? kills / deaths : kills;
        const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;
        const dailyItems = progression?.quests?.daily?.items || [];
        const weeklyItems = progression?.quests?.weekly?.items || [];
        const rewardClaimable = Math.max(0, progression?.weeklyLogin?.claimableCount || 0);
        const objective = [...dailyItems, ...weeklyItems].find((item: any) => item.completed && !item.rewarded)
            || [...dailyItems, ...weeklyItems].find((item: any) => !item.rewarded)
            || null;
        const title = `${cosmetics?.title || ''}`.trim();
        const badgeParts = this.teamTag ? [`[${this.teamTag}]`] : [];
        badgeParts.push(title || 'UNASSIGNED');

        this.playIdentityAvatarEl.innerHTML = this.renderAvatarMarkup(avatarId, avatarFrame, displayName);
        this.playIdentityNameEl.innerHTML = `<span class="name-${`${cosmetics?.nameColor || 'default'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '')}">${escapeHtml((user ? displayName : 'Guest Operator').toUpperCase())}</span>`;
        this.playIdentityBadgeEl.textContent = badgeParts.join(' | ');
        this.playIdentityMetaEl.textContent = user
            ? `${premier?.tierLabel || 'Unranked'} operator record. ${matchesPlayed} matches played, ${wins} wins, ${kills} kills.`
            : 'Login to sync your profile, cosmetics, and seasonal progress.';

        const premierValue = !user
            ? 'UNRANKED'
            : premier?.visible
                ? premier.display
                : 'CALIBRATING';
        this.playPremierValueEl.className = `forbox-play-status-value ${user && premier?.visible ? `premier-${premier.tier}` : 'premier-unranked'}`;
        this.playPremierValueEl.textContent = premierValue;
        this.playPremierMetaEl.textContent = user
            ? `${Math.max(0, premier?.matchesPlayed || 0)} season matches | ${premier?.tierLabel || 'Calibration matches pending'}`
            : 'Play calibration matches to appear on the current season ladder.';

        this.playMissionValueEl.textContent = !user
            ? 'LOGIN REQUIRED'
            : rewardClaimable > 0
                ? `${rewardClaimable} REWARD READY`
                : objective
                    ? `${Math.min(Math.max(0, objective.progress || 0), Math.max(1, objective.goal || 1))}/${Math.max(1, objective.goal || 1)}`
                    : 'ALL CLEAR';
        this.playMissionMetaEl.textContent = !user
            ? 'Daily and weekly objectives will surface here once your profile is online.'
            : rewardClaimable > 0
                ? 'Weekly reward is claimable right now from the rewards tab.'
                : objective
                    ? `${objective.title} | ${objective.description || 'Push this objective in your next match.'}`
                    : 'Daily and weekly mission cycle cleared. Queue more matches to keep climbing.';

        this.playFocusPrimaryEl.textContent = !user
            ? 'Sign in to queue and sync progression.'
            : rewardClaimable > 0
                ? 'Claim today reward before your next queue.'
                : objective
                    ? `Focus: ${objective.title}`
                    : 'All tracked objectives are clear.';
        this.playFocusSecondaryEl.textContent = !user
            ? 'Titles, avatars, frames, and season standing update here after each match.'
            : objective
                ? `${Math.min(Math.max(0, objective.progress || 0), Math.max(1, objective.goal || 1))}/${Math.max(1, objective.goal || 1)} progress${objective.rewardCoin ? ` | +${objective.rewardCoin} ${this.menuCurrency}` : ''}`
                : 'Queue another match to move your season rating and lifetime record.';

        const statCards = [
            ['Matches', user ? `${matchesPlayed}` : '--'],
            ['Wins', user ? `${wins}` : '--'],
            ['Win Rate', user ? `%${winRate}` : '--'],
            ['K/D', user ? kdRatio.toFixed(2) : '--'],
        ];
        this.playStatGridEl.innerHTML = statCards.map(([label, value]) => `
            <div class="forbox-play-stat-card">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `).join('');

        const loadout = user?.loadout || { ...FALLBACK_LOADOUT };
        const loadoutCards: Array<[string, string]> = [
            ['Primary', this.getWeaponDisplayName(loadout.primary, 'rifle')],
            ['Pistol', this.getWeaponDisplayName(loadout.secondary, 'pistol')],
            ['Knife', this.getWeaponDisplayName(loadout.knife, 'knife')],
        ];
        this.playLoadoutPreviewEl.innerHTML = loadoutCards.map(([label, value]) => `
            <div class="forbox-play-loadout-card">
                <span>${label}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `).join('');
    }

    private renderAccountPanel() {
        const name = this.getDisplayName();
        this.accountDisplayNameEl.textContent = name;

        const stats = this.currentUser?.stats;
        const premier = this.currentUser?.premier;
        const friends = this.currentUser?.friends || EMPTY_FRIENDS;
        const createdAt = this.currentUser?.createdAt || null;
        const matchesPlayed = Math.max(0, stats?.matchesPlayed || 0);
        const wins = Math.max(0, stats?.wins || 0);
        const kills = Math.max(0, stats?.kills || 0);
        const deaths = Math.max(0, stats?.deaths || 0);
        const assists = Math.max(0, stats?.assists || 0);
        const headshots = Math.max(0, stats?.headshots || 0);
        const damage = Math.max(0, Math.floor(stats?.damage || 0));
        const score = Math.max(0, Math.floor(stats?.score || 0));

        const winRatio = matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;
        const kdRatio = deaths > 0 ? kills / deaths : kills;

        this.accountStatsListEl.innerHTML = [
            ['Games Played', `${matchesPlayed}`],
            ['Total Wins', `${wins}`],
            ['Win Ratio', `%${winRatio.toFixed(0)}`],
            ['Total Kills', `${kills}`],
            ['Total Deaths', `${deaths}`],
            ['K/D Ratio', kdRatio.toFixed(2)],
            ['Total Assists', `${assists}`],
            ['Headshots', `${headshots}`],
            ['Total Damage', `${damage}`],
            ['Score', `${score}`],
            ['Premier Rating', premier ? `${premier.display}${premier.visible ? '' : ' (unranked)'}` : '?'],
            ['Premier Matches', `${Math.max(0, premier?.matchesPlayed || 0)}`],
            ['Friends Online', `${Math.max(0, friends.counts?.online || 0)} / ${Math.max(0, friends.counts?.friends || 0)}`],
            ['Pending Requests', `${Math.max(0, friends.counts?.incoming || 0)}`],
            ['Account Created', this.formatDateForAccount(createdAt)],
        ].map(([label, value]) => `
            <div class="forbox-account-stat-row">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `).join('');

        this.renderAccountCosmetics();
        this.renderFriendsPanel();
        this.renderSocialPanel();
    }

    private renderFriendsPanel() {
        if (!this.currentUser) {
            this.friendSearchResults = [];
            this.setFriendsStatus('Login to manage friends.');
            this.accountFriendResultsEl.innerHTML = '<div class="inventory-empty">Search unlocks after login.</div>';
            this.accountFriendsListEl.innerHTML = '<div class="inventory-empty">No friend list yet.</div>';
            this.accountFriendsIncomingEl.innerHTML = '<div class="inventory-empty">No incoming requests.</div>';
            this.accountFriendsOutgoingEl.innerHTML = '<div class="inventory-empty">No outgoing requests.</div>';
            return;
        }

        const friends = this.currentUser.friends || EMPTY_FRIENDS;
        this.setFriendsStatus();
        this.renderFriendRows(this.accountFriendResultsEl, this.friendSearchResults, 'search');
        this.renderFriendRows(this.accountFriendsListEl, friends.friends || [], 'friends');
        this.renderFriendRows(this.accountFriendsIncomingEl, friends.incoming || [], 'incoming');
        this.renderFriendRows(this.accountFriendsOutgoingEl, friends.outgoing || [], 'outgoing');
    }

    private setFriendsStatus(message = '') {
        if (!this.currentUser) {
            this.accountFriendsStatusEl.textContent = message || 'Login to manage friends.';
            return;
        }
        const counts = this.currentUser.friends?.counts || EMPTY_FRIENDS.counts;
        const base = `${Math.max(0, counts.friends || 0)} friends | ${Math.max(0, counts.online || 0)} online`;
        this.accountFriendsStatusEl.textContent = message ? `${message} | ${base}` : base;
    }

    private renderFriendRows(host: HTMLDivElement, rows: FriendEntry[], mode: 'search' | 'friends' | 'incoming' | 'outgoing') {
        if (!Array.isArray(rows) || !rows.length) {
            const emptyText = mode === 'search'
                ? 'Search a username to send a friend request.'
                : mode === 'friends'
                    ? 'No friends added yet.'
                    : mode === 'incoming'
                        ? 'No incoming requests.'
                        : 'No sent requests.';
            host.innerHTML = `<div class="inventory-empty">${emptyText}</div>`;
            return;
        }

        host.innerHTML = rows.map((entry) => {
            const statusLabel = entry.online ? 'ONLINE' : (entry.lastSeenAt ? this.formatDateForAccount(entry.lastSeenAt) : 'OFFLINE');
            const premierLabel = entry.premier?.display || 'UNRANKED';
            const actionMarkup = this.getFriendActionMarkup(entry, mode);
            return `
                <div class="forbox-friend-row">
                    <div class="forbox-friend-ident">
                        ${this.renderAvatarMarkup(entry.avatar, entry.avatarFrame, entry.username)}
                        <div class="forbox-friend-copy">
                            <div class="forbox-friend-name-row">
                                <strong class="name-${`${entry.nameColor || 'default'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '')}">${escapeHtml(entry.username)}</strong>
                                <span class="menu-achievement-reward-chip">${escapeHtml(entry.title || 'Rookie')}</span>
                            </div>
                            <div class="forbox-friend-meta">
                                <span class="${entry.online ? 'is-online' : ''}">${statusLabel}</span>
                                <span>${escapeHtml(premierLabel)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="forbox-friend-actions">${actionMarkup}</div>
                </div>
            `;
        }).join('');
    }

    private getFriendActionMarkup(entry: FriendEntry, mode: 'search' | 'friends' | 'incoming' | 'outgoing') {
        const userId = escapeHtml(entry.userId);
        if (mode === 'friends') {
            return `
                <button type="button" data-friend-action="invite" data-friend-user-id="${userId}">INVITE</button>
                <button type="button" data-friend-action="gift" data-friend-user-id="${userId}">GIFT</button>
                <button type="button" data-friend-action="message" data-friend-user-id="${userId}">MESSAGE</button>
                <button type="button" data-friend-action="remove" data-friend-user-id="${userId}">REMOVE</button>
            `;
        }
        if (mode === 'incoming') {
            return `
                <button type="button" data-friend-action="accept" data-friend-user-id="${userId}">ACCEPT</button>
                <button type="button" data-friend-action="decline" data-friend-user-id="${userId}">DECLINE</button>
            `;
        }
        if (mode === 'outgoing') {
            return `<button type="button" data-friend-action="cancel" data-friend-user-id="${userId}">CANCEL</button>`;
        }
        if (entry.relation === 'friend') {
            return `
                <button type="button" data-friend-action="invite" data-friend-user-id="${userId}">INVITE</button>
                <button type="button" data-friend-action="gift" data-friend-user-id="${userId}">GIFT</button>
                <button type="button" data-friend-action="message" data-friend-user-id="${userId}">MESSAGE</button>
                <button type="button" data-friend-action="remove" data-friend-user-id="${userId}">REMOVE</button>
            `;
        }
        if (entry.relation === 'incoming') {
            return `<button type="button" data-friend-action="accept" data-friend-user-id="${userId}">ACCEPT</button>`;
        }
        if (entry.relation === 'outgoing') {
            return `<button type="button" data-friend-action="cancel" data-friend-user-id="${userId}">PENDING</button>`;
        }
        return `<button type="button" data-friend-action="request" data-friend-user-id="${userId}">ADD</button>`;
    }

    private async refreshFriendsState() {
        if (!this.sessionToken || !this.currentUser) return false;
        try {
            const payload = await backendApi.friends(this.sessionToken);
            this.currentUser.friends = payload.friends || EMPTY_FRIENDS;
            this.renderAccountPanel();
            return true;
        } catch {
            return false;
        }
    }

    private async runFriendSearch() {
        if (!this.sessionToken || !this.currentUser) {
            this.setFriendsStatus('Login required.');
            return;
        }

        const query = `${this.accountFriendSearchInputEl.value || ''}`.trim();
        if (query.length < 2) {
            this.friendSearchResults = [];
            this.renderFriendsPanel();
            this.setFriendsStatus('Type at least 2 characters.');
            return;
        }

        this.accountFriendSearchBtn.disabled = true;
        try {
            const payload = await backendApi.searchFriends(this.sessionToken, query, 8);
            this.friendSearchResults = payload.results || [];
            this.renderFriendsPanel();
            this.setFriendsStatus(this.friendSearchResults.length
                ? `${this.friendSearchResults.length} player(s) found for "${query}".`
                : `No players found for "${query}".`);
        } catch (error: any) {
            this.setFriendsStatus(error?.message || 'Search failed.');
        } finally {
            this.accountFriendSearchBtn.disabled = false;
        }
    }

    private async handleFriendAction(action: string, userId: string) {
        if (!this.sessionToken || !this.currentUser || !action || !userId) {
            this.setFriendsStatus('Login required.');
            return;
        }

        try {
            const payload = action === 'request'
                ? await backendApi.sendFriendRequest(this.sessionToken, { userId })
                : action === 'accept'
                    ? await backendApi.acceptFriendRequest(this.sessionToken, userId)
                    : action === 'decline'
                        ? await backendApi.declineFriendRequest(this.sessionToken, userId)
                        : action === 'cancel'
                            ? await backendApi.cancelFriendRequest(this.sessionToken, userId)
                            : await backendApi.removeFriend(this.sessionToken, userId);

            this.currentUser.friends = payload.friends || EMPTY_FRIENDS;
            if (action !== 'request') {
                this.friendSearchResults = this.friendSearchResults.map((entry) => entry.userId === userId
                    ? { ...entry, relation: action === 'accept' ? 'friend' : 'none' }
                    : entry);
            } else {
                this.friendSearchResults = this.friendSearchResults.map((entry) => entry.userId === userId
                    ? { ...entry, relation: payload.reason === 'accepted' ? 'friend' : 'outgoing' }
                    : entry);
            }
            this.renderAccountPanel();
            void this.refreshSocialState(false);

            const actionLabel = action === 'request'
                ? (payload.reason === 'accepted' ? 'Friend added.' : 'Friend request sent.')
                : action === 'accept'
                    ? 'Friend request accepted.'
                    : action === 'decline'
                        ? 'Friend request declined.'
                        : action === 'cancel'
                            ? 'Friend request cancelled.'
                            : 'Friend removed.';
            this.setFriendsStatus(actionLabel);
        } catch (error: any) {
            this.setFriendsStatus(error?.message || 'Friend action failed.');
        }
    }

    private resetSocialState() {
        this.socialSnapshot = JSON.parse(JSON.stringify(EMPTY_SOCIAL));
        this.dmThreadMessages = [];
        this.activeDmUserId = null;
        this.selectedSocialUserId = null;
        this.updateSquadRoomChip();
        this.renderSocialPanel();
    }

    private sanitizePartyId(value: string | null | undefined) {
        return `${value || ''}`.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    }

    private capturePendingPartyJoin() {
        const searchParty = this.sanitizePartyId(new URL(window.location.href).searchParams.get('party'));
        let storedParty = '';
        try {
            storedParty = this.sanitizePartyId(window.localStorage.getItem(PARTY_JOIN_STORAGE_KEY));
        } catch {
            storedParty = '';
        }
        this.pendingPartyJoinId = searchParty || storedParty || null;
        if (searchParty) {
            try {
                window.localStorage.setItem(PARTY_JOIN_STORAGE_KEY, searchParty);
            } catch {
                // ignore storage failure
            }
            if (!this.isAuthenticated()) {
                this.setAuthStatus(`Sign in to join party ${searchParty}.`);
            }
        }
    }

    private clearPendingPartyJoin(removeUrlParam = false) {
        this.pendingPartyJoinId = null;
        try {
            window.localStorage.removeItem(PARTY_JOIN_STORAGE_KEY);
        } catch {
            // ignore storage failure
        }
        if (removeUrlParam) {
            const url = new URL(window.location.href);
            if (url.searchParams.has('party')) {
                url.searchParams.delete('party');
                window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
            }
        }
    }

    private async copyTextToClipboard(text: string) {
        const value = `${text || ''}`.trim();
        if (!value) return false;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch {
            // fallback below
        }
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', 'true');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const success = document.execCommand('copy');
        document.body.removeChild(input);
        return success;
    }

    private getPartyInviteLink(partyId: string) {
        const safePartyId = this.sanitizePartyId(partyId);
        if (!safePartyId) return '';
        const url = new URL(window.location.href);
        url.searchParams.set('party', safePartyId);
        return `${url.origin}${url.pathname}${url.search}`;
    }

    private initSocialState() {
        this.capturePendingPartyJoin();
        this.resetSocialState();
        if (this.socialPollInterval) {
            window.clearInterval(this.socialPollInterval);
            this.socialPollInterval = null;
        }
        this.socialPollInterval = window.setInterval(() => {
            if (!this.isAuthenticated()) return;
            if (this.activeForboxModal === 'squad' && this.activeDmUserId) {
                void this.fetchDirectThread(this.activeDmUserId, false);
                return;
            }
            void this.refreshSocialState(false);
        }, 5000);
    }

    private async consumePendingPartyJoin(showFeedback = true) {
        const partyId = this.sanitizePartyId(this.pendingPartyJoinId);
        if (!partyId || !this.sessionToken || !this.currentUser) return false;
        try {
            const payload = await backendApi.joinSquadRoom(this.sessionToken, partyId);
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.clearPendingPartyJoin(true);
            this.renderSocialPanel();
            if (showFeedback) this.setSocialStatus(`Joined party ${partyId}.`);
            return true;
        } catch (error: any) {
            if (showFeedback) this.setSocialStatus(error?.message || `Party ${partyId} join failed.`);
            this.clearPendingPartyJoin(true);
            return false;
        }
    }

    private updateSquadRoomChip() {
        const room = this.socialSnapshot?.squad?.room || null;
        const capacity = Math.max(1, toInt(this.socialSnapshot?.squad?.capacity, 4, 1));
        const memberCount = Math.max(0, toInt(room?.memberCount, 0, 0));
        this.squadRoomChipEl.textContent = `${memberCount}/${capacity}`;
        const alertCount = Math.max(
            0,
            toInt(this.socialSnapshot?.squad?.incomingInvites?.length, 0, 0)
            + toInt(this.socialSnapshot?.gifts?.claimableCount, 0, 0)
            + toInt(this.socialSnapshot?.messages?.unreadCount, 0, 0),
        );
        this.openSquadChipEl.textContent = `${alertCount}`;
        this.openSquadChipEl.classList.toggle('hidden', alertCount <= 0);
    }

    private setSocialStatus(message = '') {
        this.squadSocialStatusEl.textContent = message;
    }

    private findSocialUser(userId: string | null | undefined): SocialUserEntry | FriendEntry | null {
        const safeUserId = `${userId || ''}`.trim();
        if (!safeUserId) return null;
        const friendLists = [
            ...(this.currentUser?.friends?.friends || []),
            ...(this.currentUser?.friends?.incoming || []),
            ...(this.currentUser?.friends?.outgoing || []),
        ];
        const friendHit = friendLists.find((item) => item.userId === safeUserId);
        if (friendHit) return friendHit;
        const threadHit = (this.socialSnapshot?.messages?.threads || []).find((item) => item.user?.userId === safeUserId)?.user;
        if (threadHit) return threadHit;
        const roomHit = (this.socialSnapshot?.squad?.room?.members || []).find((item) => item.userId === safeUserId);
        if (roomHit) return roomHit;
        const inviteHit = [
            ...(this.socialSnapshot?.squad?.incomingInvites || []),
            ...(this.socialSnapshot?.squad?.outgoingInvites || []),
        ].find((item) => item.from?.userId === safeUserId)?.from;
        if (inviteHit) return inviteHit;
        const giftHit = [
            ...(this.socialSnapshot?.gifts?.inbox || []),
            ...(this.socialSnapshot?.gifts?.sent || []),
        ].find((item) => item.from?.userId === safeUserId || item.to?.userId === safeUserId);
        return giftHit?.from?.userId === safeUserId ? (giftHit.from || null) : (giftHit?.to || null);
    }

    private renderSocialUserInline(user: SocialUserEntry | FriendEntry | null | undefined, fallback = 'No friend selected.') {
        if (!user) return `<div class="inventory-empty">${escapeHtml(fallback)}</div>`;
        const statusLabel = user.online ? 'ONLINE' : (user.lastSeenAt ? this.formatDateForAccount(user.lastSeenAt) : 'OFFLINE');
        return `
            <div class="forbox-friend-row forbox-friend-row--social-target">
                <div class="forbox-friend-ident">
                    ${this.renderAvatarMarkup(user.avatar, user.avatarFrame, user.username)}
                    <div class="forbox-friend-copy">
                        <div class="forbox-friend-name-row">
                            <strong class="name-${`${user.nameColor || 'default'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '')}">${escapeHtml(user.username)}</strong>
                            <span class="menu-achievement-reward-chip">${escapeHtml(user.title || 'Rookie')}</span>
                        </div>
                        <div class="forbox-friend-meta">
                            <span class="${user.online ? 'is-online' : ''}">${statusLabel}</span>
                            <span>${escapeHtml(user.premier?.display || 'UNRANKED')}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private renderSocialInviteRows(host: HTMLDivElement, rows: any[], mode: 'incoming' | 'outgoing') {
        if (!Array.isArray(rows) || !rows.length) {
            host.innerHTML = `<div class="inventory-empty">${mode === 'incoming' ? 'No incoming squad invites.' : 'No outgoing squad invites.'}</div>`;
            return;
        }
        host.innerHTML = rows.map((item) => {
            const owner = item.from;
            const room = item.room;
            return `
                <div class="forbox-social-row">
                    <div class="forbox-social-row-copy">
                        <div class="forbox-social-row-title">${escapeHtml(room?.label || 'SQUAD ROOM')}</div>
                        <div class="forbox-social-row-meta">${escapeHtml(owner?.username || 'Unknown host')} | Party ${escapeHtml(room?.partyId || '----')} | ${room?.memberCount || 0}/${room?.capacity || 4} | ${(room?.visibility || 'private').toUpperCase()}</div>
                    </div>
                    <div class="forbox-social-row-actions">
                        ${mode === 'incoming'
                            ? `<button type="button" data-social-action="accept-invite" data-social-invite-id="${item.id}">ACCEPT</button><button type="button" data-social-action="decline-invite" data-social-invite-id="${item.id}">DECLINE</button>`
                            : `<button type="button" data-social-action="cancel-invite" data-social-invite-id="${item.id}">CANCEL</button>`}
                    </div>
                </div>
            `;
        }).join('');
    }

    private renderSocialGiftRows(host: HTMLDivElement, rows: any[], mode: 'inbox' | 'sent') {
        if (!Array.isArray(rows) || !rows.length) {
            host.innerHTML = `<div class="inventory-empty">${mode === 'inbox' ? 'No gifts in queue.' : 'No gifts sent yet.'}</div>`;
            return;
        }
        host.innerHTML = rows.map((item) => {
            const counterpart = mode === 'inbox' ? item.from : item.to;
            return `
                <div class="forbox-social-row">
                    <div class="forbox-social-row-copy">
                        <div class="forbox-social-row-title">${escapeHtml(item.label || 'Gift')}</div>
                        <div class="forbox-social-row-meta">${escapeHtml(counterpart?.username || 'Unknown')} | ${item.status.toUpperCase()}</div>
                        ${item.note ? `<div class="forbox-social-row-note">${escapeHtml(item.note)}</div>` : ''}
                    </div>
                    <div class="forbox-social-row-actions">
                        ${mode === 'inbox' && item.status === 'pending'
                            ? `<button type="button" data-social-action="claim-gift" data-social-gift-id="${item.id}">CLAIM</button>`
                            : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    private renderSocialThreadRows() {
        const rows = this.socialSnapshot?.messages?.threads || [];
        if (!rows.length) {
            this.socialThreadsEl.innerHTML = '<div class="inventory-empty">No private threads yet.</div>';
            return;
        }
        this.socialThreadsEl.innerHTML = rows.map((thread) => `
            <div class="forbox-social-row ${thread.user?.userId === this.activeDmUserId ? 'is-active' : ''}">
                <div class="forbox-social-row-copy">
                    <div class="forbox-social-row-title">${escapeHtml(thread.user?.username || 'Unknown')}</div>
                    <div class="forbox-social-row-meta">${escapeHtml(thread.lastMessageText || 'No messages yet.')}</div>
                </div>
                <div class="forbox-social-row-actions">
                    ${thread.unreadCount > 0 ? `<span class="forbox-social-unread">${thread.unreadCount}</span>` : ''}
                    <button type="button" data-social-action="open-thread" data-social-user-id="${thread.user?.userId || ''}">OPEN</button>
                </div>
            </div>
        `).join('');
    }

    private renderSocialPanel() {
        const social = this.socialSnapshot || EMPTY_SOCIAL;
        const room = social.squad.room;
        const selectedUser = this.findSocialUser(this.selectedSocialUserId || this.activeDmUserId);
        const currentGiftKey = `${this.socialGiftSelectEl?.value || ''}`.trim().toLowerCase();
        const giftCatalog = social.gifts.catalog || [];

        this.updateSquadRoomChip();
        this.squadRoomSummaryEl.textContent = room
            ? `${room.partyId} | ${room.memberCount}/${room.capacity} | ${room.visibility.toUpperCase()}`
            : 'No active room.';
        this.squadGiftSummaryEl.textContent = `${Math.max(0, toInt(social.gifts.claimableCount, 0, 0))} claimable gifts`;
        this.squadMessageSummaryEl.textContent = `${Math.max(0, toInt(social.messages.unreadCount, 0, 0))} unread messages`;
        this.squadPartyInputEl.value = this.pendingPartyJoinId && !this.isAuthenticated()
            ? this.pendingPartyJoinId
            : (this.sanitizePartyId(this.squadPartyInputEl.value) || this.pendingPartyJoinId || '');
        this.squadCreatePrivateBtn.textContent = !room
            ? 'PRIVATE ROOM'
            : room.isHost
                ? (room.visibility === 'private' ? 'PRIVATE LIVE' : 'MAKE PRIVATE')
                : 'NEW PRIVATE ROOM';
        this.squadCreatePublicBtn.textContent = !room
            ? 'PUBLIC ROOM'
            : room.isHost
                ? (room.visibility === 'public' ? 'PUBLIC LIVE' : 'MAKE PUBLIC')
                : 'NEW PUBLIC ROOM';
        this.squadCreatePrivateBtn.disabled = !!room && !!room.isHost && room.visibility === 'private';
        this.squadCreatePublicBtn.disabled = !!room && !!room.isHost && room.visibility === 'public';
        this.squadPartyJoinBtn.disabled = !this.sanitizePartyId(this.squadPartyInputEl.value);

        if (room) {
            const slotMarkup = Array.from({ length: room.capacity }).map((_, index) => {
                const member = room.members[index] || null;
                if (member) {
                    return `
                        <div class="forbox-social-slot is-member ${member.userId === room.hostUserId ? 'is-host' : ''}">
                            ${this.renderAvatarMarkup(member.avatar, member.avatarFrame, member.username)}
                            <span class="forbox-social-slot-name name-${`${member.nameColor || 'default'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '')}">${escapeHtml(member.username)}</span>
                            <span class="forbox-social-slot-meta">${member.userId === room.hostUserId ? 'HOST' : (member.online ? 'ONLINE' : 'OFFLINE')}</span>
                        </div>
                    `;
                }
                return `
                    <button class="forbox-social-slot is-empty" type="button" data-social-action="copy-link">
                        <span>+</span>
                        <small>Invite by link</small>
                    </button>
                `;
            }).join('');
            this.squadRoomCardEl.innerHTML = `
                <div class="forbox-social-room-head">
                    <div>
                        <div class="forbox-social-row-title">${escapeHtml(room.label)}</div>
                        <div class="forbox-social-row-meta">Party ID: ${escapeHtml(room.partyId)} | ${room.memberCount}/${room.capacity} members | ${room.visibility.toUpperCase()} | ${room.isHost ? 'You are host' : 'Joined squad member'}</div>
                    </div>
                    <div class="forbox-social-row-actions">
                        ${room.isHost ? `<button type="button" data-social-action="${room.visibility === 'public' ? 'set-private' : 'set-public'}">${room.visibility === 'public' ? 'PRIVATE' : 'PUBLIC'}</button>` : ''}
                        <button type="button" data-social-action="copy-link">COPY LINK</button>
                        <button type="button" data-social-action="leave-room">LEAVE</button>
                    </div>
                </div>
                <div class="forbox-social-room-link">${escapeHtml(this.getPartyInviteLink(room.partyId))}</div>
                <div class="forbox-social-slot-grid">${slotMarkup}</div>
            `;
        } else {
            const emptySlots = Array.from({ length: Math.max(1, social.squad.capacity || 4) }).map(() => `
                <button class="forbox-social-slot is-empty" type="button" data-social-action="quick-link">
                    <span>+</span>
                    <small>Create private invite link</small>
                </button>
            `).join('');
            this.squadRoomCardEl.innerHTML = `
                <div class="inventory-empty">No active room. Create a public/private room or use an empty slot to generate an invite link instantly.</div>
                <div class="forbox-social-slot-grid">${emptySlots}</div>
            `;
        }

        this.renderSocialInviteRows(this.squadIncomingListEl, social.squad.incomingInvites || [], 'incoming');
        this.renderSocialInviteRows(this.squadOutgoingListEl, social.squad.outgoingInvites || [], 'outgoing');

        if (!giftCatalog.length) {
            this.socialGiftSelectEl.innerHTML = '<option value="">No gift packages online</option>';
        } else {
            this.socialGiftSelectEl.innerHTML = giftCatalog.map((item: SocialGiftCatalogEntry) => `
                <option value="${item.key}">${escapeHtml(item.label)} | ${item.priceCoin} ${this.menuCurrency}</option>
            `).join('');
            if (giftCatalog.some((item) => item.key === currentGiftKey)) this.socialGiftSelectEl.value = currentGiftKey;
        }

        this.socialTargetEl.innerHTML = this.renderSocialUserInline(selectedUser, 'Choose a friend to invite, gift, or message.');
        this.socialGiftSendBtn.disabled = !this.isAuthenticated() || !selectedUser || !giftCatalog.length;
        this.renderSocialGiftRows(this.socialGiftInboxEl, social.gifts.inbox || [], 'inbox');
        this.renderSocialGiftRows(this.socialGiftSentEl, social.gifts.sent || [], 'sent');
        this.renderSocialThreadRows();

        const threadUser = this.findSocialUser(this.activeDmUserId);
        this.socialThreadUserEl.textContent = threadUser
            ? `THREAD | ${threadUser.username.toUpperCase()}`
            : 'NO THREAD SELECTED';
        if (!this.dmThreadMessages.length) {
            this.socialDmLogEl.innerHTML = '<div class="inventory-empty">Open a friend thread to start private messaging.</div>';
        } else {
            this.socialDmLogEl.innerHTML = this.dmThreadMessages.map((item) => `
                <div class="forbox-social-dm-msg ${item.isSelf ? 'is-self' : ''}">
                    <div class="forbox-social-dm-meta">${escapeHtml(item.from?.username || 'Player')} | ${this.formatChatTime(item.createdAt)}</div>
                    <div class="forbox-social-dm-text">${escapeHtml(item.text)}</div>
                </div>
            `).join('');
            requestAnimationFrame(() => {
                this.socialDmLogEl.scrollTop = this.socialDmLogEl.scrollHeight;
            });
        }
        this.socialDmInputEl.disabled = !this.isAuthenticated() || !this.activeDmUserId;
        this.socialDmSendBtn.disabled = !this.isAuthenticated() || !this.activeDmUserId;
    }

    private async refreshSocialState(loadActiveThread = false) {
        if (!this.sessionToken || !this.currentUser) {
            this.resetSocialState();
            return false;
        }
        if (this.socialPollInFlight) return false;
        this.socialPollInFlight = true;
        try {
            const payload = await backendApi.social(this.sessionToken);
            this.socialSnapshot = payload.social || JSON.parse(JSON.stringify(EMPTY_SOCIAL));
            this.renderSocialPanel();
            if (loadActiveThread && this.activeDmUserId) {
                await this.fetchDirectThread(this.activeDmUserId, false);
            }
            return true;
        } catch {
            return false;
        } finally {
            this.socialPollInFlight = false;
        }
    }

    private async fetchDirectThread(userId: string, updateStatus = true) {
        if (!this.sessionToken || !this.currentUser || !userId) return false;
        try {
            const payload = await backendApi.directMessages(this.sessionToken, userId);
            this.activeDmUserId = userId;
            this.selectedSocialUserId = userId;
            this.dmThreadMessages = payload.messages || [];
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.renderSocialPanel();
            if (updateStatus) this.setSocialStatus(`Private thread opened with ${payload.threadUser?.username || 'friend'}.`);
            return true;
        } catch (error: any) {
            if (updateStatus) this.setSocialStatus(error?.message || 'Direct thread failed to load.');
            return false;
        }
    }

    private async createOrUpdateSquadRoom(visibility: 'public' | 'private') {
        if (!this.sessionToken || !this.currentUser) {
            this.setSocialStatus('Login required.');
            return;
        }
        try {
            const currentRoom = this.socialSnapshot?.squad?.room || null;
            const payload = await backendApi.createSquadRoom(
                this.sessionToken,
                visibility,
                !!currentRoom && !currentRoom.isHost,
            );
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.renderSocialPanel();
            this.setSocialStatus(!currentRoom || !currentRoom.isHost
                ? `${visibility.toUpperCase()} room ready.`
                : `Room updated to ${visibility.toUpperCase()}.`);
        } catch (error: any) {
            this.setSocialStatus(error?.message || 'Room creation failed.');
        }
    }

    private async joinPartyFromInput() {
        const partyId = this.sanitizePartyId(this.squadPartyInputEl.value);
        this.squadPartyJoinBtn.disabled = !partyId;
        if (!this.sessionToken || !this.currentUser) {
            this.pendingPartyJoinId = partyId;
            if (this.pendingPartyJoinId) {
                try {
                    window.localStorage.setItem(PARTY_JOIN_STORAGE_KEY, this.pendingPartyJoinId);
                } catch {
                    // ignore storage failure
                }
            }
            this.setSocialStatus('Sign in to join this party.');
            return;
        }
        if (!partyId) {
            this.setSocialStatus('Enter a valid Party ID.');
            return;
        }
        this.pendingPartyJoinId = partyId;
        await this.consumePendingPartyJoin(true);
    }

    private async copyCurrentRoomLink(autoCreate = false) {
        if (!this.sessionToken || !this.currentUser) {
            this.setSocialStatus('Login required.');
            return;
        }
        let room = this.socialSnapshot?.squad?.room || null;
        if (!room && autoCreate) {
            const payload = await backendApi.createSquadRoom(this.sessionToken, 'private', false);
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.renderSocialPanel();
            room = this.socialSnapshot?.squad?.room || null;
        }
        if (!room) {
            this.setSocialStatus('Create a room first.');
            return;
        }
        const link = this.getPartyInviteLink(room.partyId);
        const copied = await this.copyTextToClipboard(link);
        this.setSocialStatus(copied
            ? `Invite link copied. Party ID: ${room.partyId}`
            : `Copy failed. Share Party ID: ${room.partyId}`);
    }

    private async handleSocialFriendAction(action: string, userId: string) {
        if (!this.sessionToken || !this.currentUser) {
            this.setSocialStatus('Login required.');
            return;
        }
        this.selectedSocialUserId = userId;
        if (action === 'message') {
            await this.fetchDirectThread(userId, true);
            return;
        }
        if (action === 'gift') {
            this.renderSocialPanel();
            this.setSocialStatus('Gift relay target selected.');
            return;
        }
        if (action === 'invite') {
            try {
                const payload = await backendApi.sendSquadInvite(this.sessionToken, userId);
                this.socialSnapshot = payload.social || this.socialSnapshot;
                this.renderSocialPanel();
                this.setSocialStatus(payload.reason === 'already-in-room'
                    ? 'Friend is already in your room.'
                    : payload.reason === 'already-pending'
                        ? 'Invite already pending.'
                        : 'Squad invite sent.');
            } catch (error: any) {
                this.setSocialStatus(error?.message || 'Squad invite failed.');
            }
        }
    }

    private async handleSocialAction(action: string, payload: { userId?: string; inviteId?: string; giftId?: string }) {
        if (!this.sessionToken || !this.currentUser) {
            this.setSocialStatus('Login required.');
            return;
        }
        try {
            if (action === 'create-private-room') {
                await this.createOrUpdateSquadRoom('private');
                return;
            }
            if (action === 'create-public-room') {
                await this.createOrUpdateSquadRoom('public');
                return;
            }
            if (action === 'set-private' || action === 'set-public') {
                const visibility = action === 'set-public' ? 'public' : 'private';
                const response = await backendApi.setSquadVisibility(this.sessionToken, visibility);
                this.socialSnapshot = response.social || this.socialSnapshot;
                this.renderSocialPanel();
                this.setSocialStatus(`Room visibility set to ${visibility.toUpperCase()}.`);
                return;
            }
            if (action === 'copy-link') {
                await this.copyCurrentRoomLink(false);
                return;
            }
            if (action === 'quick-link') {
                await this.copyCurrentRoomLink(true);
                return;
            }
            if (action === 'accept-invite' || action === 'decline-invite' || action === 'cancel-invite') {
                const response = await backendApi.respondSquadInvite(
                    this.sessionToken,
                    `${payload.inviteId || ''}`.trim(),
                    action === 'accept-invite' ? 'accept' : action === 'decline-invite' ? 'decline' : 'cancel',
                );
                this.socialSnapshot = response.social || this.socialSnapshot;
                this.renderSocialPanel();
                this.setSocialStatus(action === 'accept-invite'
                    ? 'Squad invite accepted.'
                    : action === 'decline-invite'
                        ? 'Squad invite declined.'
                        : 'Squad invite cancelled.');
                return;
            }
            if (action === 'leave-room') {
                const response = await backendApi.leaveSquadRoom(this.sessionToken);
                this.socialSnapshot = response.social || this.socialSnapshot;
                this.renderSocialPanel();
                this.setSocialStatus('You left the squad room.');
                return;
            }
            if (action === 'claim-gift') {
                const response = await backendApi.claimFriendGift(this.sessionToken, `${payload.giftId || ''}`.trim());
                this.socialSnapshot = response.social || this.socialSnapshot;
                if (this.currentUser) {
                    this.currentUser.wallet = response.wallet;
                    this.currentUser.inventory = response.inventory;
                }
                this.refreshWallet();
                this.renderInventory();
                this.syncPlayerFromProfile();
                this.renderSocialPanel();
                this.setSocialStatus('Gift claimed.');
                return;
            }
            if (action === 'open-thread') {
                const userId = `${payload.userId || ''}`.trim();
                if (!userId) return;
                await this.fetchDirectThread(userId, true);
            }
        } catch (error: any) {
            this.setSocialStatus(error?.message || 'Social action failed.');
        }
    }

    private async submitSocialGift() {
        if (!this.sessionToken || !this.currentUser) {
            this.setSocialStatus('Login required.');
            return;
        }
        const userId = `${this.selectedSocialUserId || ''}`.trim();
        const giftKey = `${this.socialGiftSelectEl.value || ''}`.trim();
        const note = `${this.socialGiftNoteEl.value || ''}`.trim();
        if (!userId) {
            this.setSocialStatus('Select a friend first.');
            return;
        }
        if (!giftKey) {
            this.setSocialStatus('Select a gift package.');
            return;
        }
        this.socialGiftSendBtn.disabled = true;
        try {
            const payload = await backendApi.sendFriendGift(this.sessionToken, { userId, giftKey, note });
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.currentUser.wallet = payload.wallet;
            this.currentUser.inventory = payload.inventory;
            this.socialGiftNoteEl.value = '';
            this.refreshWallet();
            this.renderInventory();
            this.syncPlayerFromProfile();
            this.renderSocialPanel();
            this.setSocialStatus('Gift sent.');
        } catch (error: any) {
            this.setSocialStatus(error?.message || 'Gift send failed.');
        } finally {
            this.socialGiftSendBtn.disabled = false;
        }
    }

    private async submitDirectMessage() {
        if (!this.sessionToken || !this.currentUser) {
            this.setSocialStatus('Login required.');
            return;
        }
        const userId = `${this.activeDmUserId || this.selectedSocialUserId || ''}`.trim();
        const text = `${this.socialDmInputEl.value || ''}`.replace(/\s+/g, ' ').trim();
        if (!userId) {
            this.setSocialStatus('Pick a friend thread first.');
            return;
        }
        if (!text) return;
        this.socialDmSendBtn.disabled = true;
        try {
            const payload = await backendApi.sendDirectMessage(this.sessionToken, userId, text);
            this.activeDmUserId = userId;
            this.selectedSocialUserId = userId;
            this.dmThreadMessages = payload.messages || [];
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.socialDmInputEl.value = '';
            this.renderSocialPanel();
            this.setSocialStatus('Private message sent.');
        } catch (error: any) {
            this.setSocialStatus(error?.message || 'Private message failed.');
        } finally {
            this.socialDmSendBtn.disabled = false;
            this.socialDmInputEl.focus();
        }
    }

    private renderCosmeticOptions(
        host: HTMLDivElement,
        type: ProgressionEquipType,
        options: string[],
        activeValue: string,
    ) {
        if (!options.length) {
            host.innerHTML = '<div class="inventory-empty">No unlock yet.</div>';
            return;
        }

        host.innerHTML = options.map((item) => {
            const token = `${item || ''}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
            const previewClass = type === 'nameColor'
                ? `name-${token}`
                : type === 'avatarFrame'
                    ? `frame-${token}`
                    : '';
            return `
                <button class="menu-cosmetic-btn ${previewClass} ${item === activeValue ? 'is-active' : ''}" data-cosmetic-type="${type}" data-cosmetic-value="${item}">
                    ${escapeHtml(`${item}`)}
                </button>
            `;
        }).join('');

        host.querySelectorAll('.menu-cosmetic-btn').forEach((el) => {
            el.addEventListener('click', () => {
                const typeValue = ((el as HTMLButtonElement).dataset.cosmeticType || '') as ProgressionEquipType;
                const cosmeticValue = `${(el as HTMLButtonElement).dataset.cosmeticValue || ''}`;
                this.equipProgression(typeValue, cosmeticValue);
            });
        });
    }

    private renderAvatarOptions(host: HTMLDivElement, options: string[], activeValue: string) {
        if (!options.length) {
            host.innerHTML = '<div class="inventory-empty">No avatar unlock yet.</div>';
            return;
        }

        host.innerHTML = options.map((item) => `
            <button class="menu-cosmetic-btn menu-cosmetic-btn-avatar ${item === activeValue ? 'is-active' : ''}" data-cosmetic-type="avatar" data-cosmetic-value="${item}">
                ${this.renderAvatarMarkup(item, 'default', getAvatarLabel(item))}
                <span>${escapeHtml(getAvatarLabel(item))}</span>
            </button>
        `).join('');

        host.querySelectorAll('.menu-cosmetic-btn').forEach((el) => {
            el.addEventListener('click', () => {
                const cosmeticValue = `${(el as HTMLButtonElement).dataset.cosmeticValue || ''}`;
                this.equipProgression('avatar', cosmeticValue);
            });
        });
    }

    private renderAccountCosmetics() {
        const cosmetics = this.currentUser?.progression?.cosmetics;
        if (!cosmetics) {
            this.accountAvatarListEl.innerHTML = '<div class="inventory-empty">Login to manage avatars.</div>';
            this.accountTitleListEl.innerHTML = '<div class="inventory-empty">Login to manage titles.</div>';
            this.accountNameListEl.innerHTML = '<div class="inventory-empty">Login to manage name colors.</div>';
            this.accountFrameListEl.innerHTML = '<div class="inventory-empty">Login to manage frames.</div>';
            return;
        }

        this.renderAvatarOptions(this.accountAvatarListEl, cosmetics.unlockedAvatars || [], cosmetics.avatar || DEFAULT_AVATAR_ID);
        this.renderCosmeticOptions(this.accountTitleListEl, 'title', cosmetics.unlockedTitles || [], cosmetics.title || '');
        this.renderCosmeticOptions(this.accountNameListEl, 'nameColor', cosmetics.unlockedNameColors || [], cosmetics.nameColor || '');
        this.renderCosmeticOptions(this.accountFrameListEl, 'avatarFrame', cosmetics.unlockedAvatarFrames || [], cosmetics.avatarFrame || '');
    }

    private renderAvatarMarkup(avatarId: string, avatarFrame: string, alt: string) {
        const safeAlt = escapeHtml(`${alt || 'Player'}`);
        return `
            <span class="player-avatar frame-${`${avatarFrame || 'default'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '')}">
                <img src="${getAvatarImageUrl(avatarId)}" alt="${safeAlt}" />
            </span>
        `;
    }

    private getActiveLeaderboardResetHost() {
        return this.leaderboardView === 'premier'
            ? this.premierSeasonResetEl
            : this.leaderboardResetEl;
    }

    private formatDateForAccount(value: string | null) {
        if (!value) return '--';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    private refreshWallet() {
        if (!this.currentUser) {
            this.walletValueEl.textContent = `---- ${this.menuCurrency}`;
            this.topWalletValueEl.textContent = '----';
            return;
        }
        const value = Math.max(0, Math.floor(this.currentUser.wallet));
        this.walletValueEl.textContent = `${value.toLocaleString('en-US')} ${this.menuCurrency}`;
        this.topWalletValueEl.textContent = `${value.toLocaleString('en-US')}`;
    }

    private toUiCurrencyLabel(raw: string) {
        const key = `${raw || 'coin'}`.trim().toUpperCase();
        return key === 'COIN' ? 'FP' : key;
    }

    private loadIdentityState() {
        try {
            this.profileAlias = `${window.localStorage.getItem('forbox.profileAlias') || ''}`.trim();
            this.teamTag = `${window.localStorage.getItem('forbox.teamTag') || ''}`.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
        } catch {
            this.profileAlias = '';
            this.teamTag = '';
        }
    }

    private persistIdentityState() {
        try {
            if (this.profileAlias) window.localStorage.setItem('forbox.profileAlias', this.profileAlias);
            else window.localStorage.removeItem('forbox.profileAlias');
            if (this.teamTag) window.localStorage.setItem('forbox.teamTag', this.teamTag);
            else window.localStorage.removeItem('forbox.teamTag');
        } catch {
            // Ignore localStorage failures in restricted environments.
        }
    }

    private getDisplayName() {
        const base = `${this.profileAlias || this.currentUser?.username || 'GUEST'}`.trim();
        if (!this.teamTag) return base;
        return `[${this.teamTag}] ${base}`;
    }

    private showForboxModal(type: ForboxModalType) {
        this.activeForboxModal = type;
        if (type === 'account') {
            this.profileAliasInputEl.value = this.profileAlias || this.currentUser?.username || '';
            this.teamTagInputEl.value = this.teamTag;
            this.renderAccountPanel();
            if (this.isAuthenticated()) {
                void this.refreshFriendsState();
            }
        }
        if (type === 'squad') {
            this.accountFriendSearchInputEl.value = '';
            this.friendSearchResults = [];
            this.renderFriendsPanel();
            this.renderSocialPanel();
            if (this.isAuthenticated()) {
                void this.refreshFriendsState();
                void this.refreshSocialState(true);
            }
        }
        if (type === 'find_game') {
            this.renderPublicMatchRooms();
            if (this.isAuthenticated()) void this.refreshPublicMatchRooms();
        }
        this.forboxModalHostEl.classList.toggle('hidden', type === 'none');
        const setVisible = (el: HTMLDivElement, visible: boolean) => {
            if (!el) return;
            el.classList.toggle('hidden', !visible);
            if (visible) el.style.display = 'grid';
            else el.style.removeProperty('display');
        };
        setVisible(this.accountModalEl, type === 'account');
        setVisible(this.squadModalEl, type === 'squad');
        setVisible(this.createGameModalEl, type === 'create_game');
        setVisible(this.findGameModalEl, type === 'find_game');
        setVisible(this.purchaseConfirmModalEl, type === 'purchase_confirm');
    }

    private hideForboxModal() {
        this.pendingPurchaseOfferId = null;
        this.showForboxModal('none');
    }

    private setInlineMessage(host: HTMLDivElement, text: string) {
        host.textContent = text;
        window.setTimeout(() => {
            if (host.textContent === text) host.textContent = '';
        }, 2600);
    }

    private setAuthStatus(text: string) {
        this.authStatusEl.textContent = text;
    }

    private isAuthenticated() {
        return !!this.sessionToken && !!this.currentUser;
    }

    private ensureCurrentUserShape() {
        if (!this.currentUser) return;
        if (!this.currentUser.inventory) return;
        if (!Array.isArray(this.currentUser.inventory.skins)) this.currentUser.inventory.skins = [];
        if (!this.currentUser.inventory.skinMeta || typeof this.currentUser.inventory.skinMeta !== 'object') {
            this.currentUser.inventory.skinMeta = {};
        }
        if (!this.currentUser.loadout || typeof this.currentUser.loadout !== 'object') {
            this.currentUser.loadout = { ...FALLBACK_LOADOUT };
        }
        if (!this.currentUser.stats || typeof this.currentUser.stats !== 'object') {
            this.currentUser.stats = {
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
            };
        }
        if (!this.currentUser.progression || typeof this.currentUser.progression !== 'object') {
            this.currentUser.progression = cloneProgression();
        }
        const cosmetics = this.currentUser.progression.cosmetics || { ...cloneProgression().cosmetics };
        if (!Array.isArray(cosmetics.unlockedTitles)) cosmetics.unlockedTitles = [...FALLBACK_PROGRESSION.cosmetics.unlockedTitles];
        if (!Array.isArray(cosmetics.unlockedNameColors)) cosmetics.unlockedNameColors = [...FALLBACK_PROGRESSION.cosmetics.unlockedNameColors];
        if (!Array.isArray(cosmetics.unlockedAvatars)) cosmetics.unlockedAvatars = [...FALLBACK_PROGRESSION.cosmetics.unlockedAvatars];
        if (!Array.isArray(cosmetics.unlockedAvatarFrames)) cosmetics.unlockedAvatarFrames = [...FALLBACK_PROGRESSION.cosmetics.unlockedAvatarFrames];
        if (!cosmetics.unlockedTitles.length) cosmetics.unlockedTitles = [...FALLBACK_PROGRESSION.cosmetics.unlockedTitles];
        if (!cosmetics.unlockedNameColors.length) cosmetics.unlockedNameColors = [...FALLBACK_PROGRESSION.cosmetics.unlockedNameColors];
        if (!cosmetics.unlockedAvatars.length) cosmetics.unlockedAvatars = [...FALLBACK_PROGRESSION.cosmetics.unlockedAvatars];
        if (!cosmetics.unlockedAvatarFrames.length) cosmetics.unlockedAvatarFrames = [...FALLBACK_PROGRESSION.cosmetics.unlockedAvatarFrames];
        if (!cosmetics.title) cosmetics.title = cosmetics.unlockedTitles[0] || 'Rookie';
        if (!cosmetics.nameColor) cosmetics.nameColor = cosmetics.unlockedNameColors[0] || 'default';
        if (!cosmetics.avatar) cosmetics.avatar = cosmetics.unlockedAvatars[0] || DEFAULT_AVATAR_ID;
        if (!cosmetics.avatarFrame) cosmetics.avatarFrame = cosmetics.unlockedAvatarFrames[0] || 'default';
        if (!Array.isArray(cosmetics.avatarCatalog) || !cosmetics.avatarCatalog.length) {
            cosmetics.avatarCatalog = FRONTEND_AVATAR_CATALOG.map((item) => ({ id: item.id, label: item.label }));
        }
        this.currentUser.progression.cosmetics = cosmetics;
        if (!this.currentUser.progression.quests || typeof this.currentUser.progression.quests !== 'object') {
            this.currentUser.progression.quests = cloneProgression().quests;
        }
        if (!this.currentUser.progression.achievements || typeof this.currentUser.progression.achievements !== 'object') {
            this.currentUser.progression.achievements = cloneProgression().achievements;
        }
        if (!this.currentUser.progression.weeklyLogin || typeof this.currentUser.progression.weeklyLogin !== 'object') {
            this.currentUser.progression.weeklyLogin = cloneProgression().weeklyLogin;
        }
        if (!this.currentUser.friends || typeof this.currentUser.friends !== 'object') {
            this.currentUser.friends = JSON.parse(JSON.stringify(EMPTY_FRIENDS));
        }
        if (!Array.isArray(this.currentUser.friends.friends)) this.currentUser.friends.friends = [];
        if (!Array.isArray(this.currentUser.friends.incoming)) this.currentUser.friends.incoming = [];
        if (!Array.isArray(this.currentUser.friends.outgoing)) this.currentUser.friends.outgoing = [];
        this.currentUser.friends.counts = {
            friends: this.currentUser.friends.friends.length,
            incoming: this.currentUser.friends.incoming.length,
            outgoing: this.currentUser.friends.outgoing.length,
            online: Math.max(0, toInt(this.currentUser.friends.counts?.online, 0, 0)),
        };
    }

    private syncPlayerFromProfile() {
        if (!this.currentUser) return;
        const localPlayer = LocalPlayer.getInstance();
        localPlayer.money = Math.max(0, Math.floor(this.currentUser.wallet));
    }

    private renderPublicMatchRooms() {
        if (!this.findGameListEl || !this.findGameStatusEl) return;
        const rooms = Array.isArray(this.publicMatchRooms) ? this.publicMatchRooms : [];
        if (!rooms.length) {
            this.findGameListEl.innerHTML = '<div class="inventory-empty">No public rooms online right now.</div>';
            return;
        }

        this.findGameListEl.innerHTML = rooms.map((room) => {
            const game = room.game || { mode: 'ffa', durationSeconds: 300, fillBots: true };
            const host = room.members?.find((item) => item.userId === room.hostUserId) || room.members?.[0] || null;
            return `
                <div class="forbox-social-row">
                    <div class="forbox-social-row-main">
                        <div class="forbox-social-row-title">${escapeHtml(room.label || 'PUBLIC ROOM')}</div>
                        <div class="forbox-social-row-meta">
                            ${escapeHtml((game.mode || 'ffa').toUpperCase())} |
                            ${Math.max(1, toInt(game.durationSeconds, 300, 1))}s |
                            ${room.memberCount || 0}/${room.capacity || 4} |
                            bots ${game.fillBots ? 'ON' : 'OFF'} |
                            host ${escapeHtml(host?.username || 'Unknown')}
                        </div>
                        <div class="forbox-social-room-link">Party ID: ${escapeHtml(room.partyId || '------')}</div>
                    </div>
                    <div class="forbox-social-row-actions">
                        <button type="button" data-find-room-party="${escapeHtml(room.partyId || '')}">JOIN</button>
                    </div>
                </div>
            `;
        }).join('');

        this.findGameListEl.querySelectorAll('button[data-find-room-party]').forEach((button) => {
            button.addEventListener('click', () => {
                const partyId = `${(button as HTMLButtonElement).dataset.findRoomParty || ''}`.trim();
                if (!partyId) return;
                void this.joinPublicMatchRoom(partyId);
            });
        });
    }

    private showQuickMatchOverlay(title: string, subtitle: string, bodyHtml: string, afterRender?: () => void) {
        if (!this.quickMatchOverlayEl || !this.quickMatchCardEl) return;
        this.quickMatchCardEl.innerHTML = `
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(subtitle)}</p>
            ${bodyHtml}
        `;
        this.quickMatchOverlayEl.classList.remove('hidden');
        afterRender?.();
    }

    private hideQuickMatchOverlay() {
        if (!this.quickMatchOverlayEl || !this.quickMatchCardEl) return;
        this.quickMatchOverlayEl.classList.add('hidden');
        this.quickMatchCardEl.innerHTML = '';
    }

    private openCreateGameOverlay() {
        this.showQuickMatchOverlay(
            'Create Match',
            'Set up a public online room.',
            `
                <div class="forbox-form-grid">
                    <label>Max Players<select id="quick-create-players"><option value="4">4 players</option><option value="6">6 players</option><option value="8">8 players</option></select></label>
                    <label>Game Duration<select id="quick-create-duration"><option value="120">2 minutes</option><option value="300" selected>5 minutes</option><option value="600">10 minutes</option></select></label>
                    <label>Game Mode<select id="quick-create-mode"><option value="ffa" selected>Free For All</option><option value="tdm">Team Deathmatch</option></select></label>
                    <label>Fill With Bots<input id="quick-create-bots" type="checkbox" checked /></label>
                    <label class="forbox-wide">Lobby Name<input id="quick-create-name" type="text" maxlength="24" placeholder="enter lobby name..." /></label>
                </div>
                <div class="forbox-modal-actions">
                    <button id="quick-create-cancel" type="button">CANCEL</button>
                    <button id="quick-create-confirm" class="ok" type="button">CREATE GAME</button>
                </div>
            `,
            () => {
                (this.quickMatchCardEl.querySelector('#quick-create-cancel') as HTMLButtonElement).addEventListener('click', () => this.hideQuickMatchOverlay());
                (this.quickMatchCardEl.querySelector('#quick-create-confirm') as HTMLButtonElement).addEventListener('click', () => {
                    this.createGamePlayersEl.value = `${((this.quickMatchCardEl.querySelector('#quick-create-players') as HTMLSelectElement)?.value || '4')}`;
                    this.createGameDurationEl.value = `${((this.quickMatchCardEl.querySelector('#quick-create-duration') as HTMLSelectElement)?.value || '300')}`;
                    this.createGameModeEl.value = `${((this.quickMatchCardEl.querySelector('#quick-create-mode') as HTMLSelectElement)?.value || 'ffa')}`;
                    this.createGameFillBotsEl.checked = !!((this.quickMatchCardEl.querySelector('#quick-create-bots') as HTMLInputElement)?.checked);
                    this.createGameNameEl.value = `${((this.quickMatchCardEl.querySelector('#quick-create-name') as HTMLInputElement)?.value || '')}`;
                    this.hideQuickMatchOverlay();
                    void this.handleCreateMatchRoom();
                });
            },
        );
    }

    private openFindGameOverlay() {
        this.showQuickMatchOverlay(
            'Find Match',
            'Browse public online rooms and join one.',
            `
                <div class="menu-inline-msg" id="quick-find-game-status">Loading public rooms...</div>
                <div class="forbox-modal-actions">
                    <button id="quick-find-game-refresh" type="button">REFRESH</button>
                    <button id="quick-find-game-close" type="button">CLOSE</button>
                </div>
                <div class="forbox-account-friend-list" id="quick-find-game-list"></div>
            `,
            () => {
                this.findGameStatusEl = this.quickMatchCardEl.querySelector('#quick-find-game-status') as HTMLDivElement;
                this.findGameListEl = this.quickMatchCardEl.querySelector('#quick-find-game-list') as HTMLDivElement;
                (this.quickMatchCardEl.querySelector('#quick-find-game-refresh') as HTMLButtonElement).addEventListener('click', () => {
                    void this.refreshPublicMatchRooms();
                });
                (this.quickMatchCardEl.querySelector('#quick-find-game-close') as HTMLButtonElement).addEventListener('click', () => {
                    this.hideQuickMatchOverlay();
                });
                this.renderPublicMatchRooms();
                void this.refreshPublicMatchRooms();
            },
        );
    }

    private async refreshPublicMatchRooms() {
        if (!this.findGameStatusEl) return;
        this.findGameStatusEl.textContent = 'Refreshing public rooms...';
        try {
            const payload = await backendApi.listPublicMatchRooms();
            this.publicMatchRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
            this.renderPublicMatchRooms();
            this.findGameStatusEl.textContent = this.publicMatchRooms.length
                ? `${this.publicMatchRooms.length} public room(s) online.`
                : 'No public rooms online right now.';
        } catch (error: any) {
            this.publicMatchRooms = [];
            this.renderPublicMatchRooms();
            this.findGameStatusEl.textContent = error?.message || 'Public room list failed.';
        }
    }

    private async handleCreateMatchRoom() {
        if (!this.isAuthenticated() || !this.sessionToken) {
            this.setAuthStatus('Login required to create an online room.');
            return;
        }
        const selectedPlayers = Math.max(2, toInt(this.createGamePlayersEl.value, 4, 2));
        const selectedDuration = Math.max(60, toInt(this.createGameDurationEl.value, 300, 60));
        const selectedMode = `${this.createGameModeEl.value || 'ffa'}`.trim().toLowerCase();
        const fillBots = !!this.createGameFillBotsEl.checked;
        const lobbyName = `${this.createGameNameEl.value || ''}`.trim();
        try {
            const payload = await backendApi.createMatchRoom(this.sessionToken, {
                visibility: 'public',
                forceNew: true,
                label: lobbyName || `${this.getDisplayName().toUpperCase()} ROOM`,
                capacity: selectedPlayers,
                game: {
                    mode: selectedMode,
                    durationSeconds: selectedDuration,
                    fillBots,
                },
            });
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.renderSocialPanel();
            this.activeMatchRoom = this.socialSnapshot?.squad?.room || null;
            this.hideForboxModal();
            this.setAuthStatus(`Online room ready. Party ID: ${this.activeMatchRoom?.partyId || '------'}`);
            this.startGameSession(selectedMode, selectedDuration, this.activeMatchRoom);
        } catch (error: any) {
            this.setAuthStatus(error?.message || 'Room creation failed.');
        }
    }

    private async joinPublicMatchRoom(partyId: string) {
        if (!this.sessionToken || !this.currentUser) {
            this.setAuthStatus('Login required to join an online room.');
            return;
        }
        const safePartyId = this.sanitizePartyId(partyId);
        if (!safePartyId) return;
        this.findGameStatusEl.textContent = `Joining ${safePartyId}...`;
        try {
            const payload = await backendApi.joinSquadRoom(this.sessionToken, safePartyId);
            this.socialSnapshot = payload.social || this.socialSnapshot;
            this.renderSocialPanel();
            this.activeMatchRoom = this.socialSnapshot?.squad?.room || null;
            const game = this.activeMatchRoom?.game || { mode: 'ffa', durationSeconds: 300 };
            this.hideForboxModal();
            this.setAuthStatus(`Joined online room ${safePartyId}.`);
            this.startGameSession(game.mode || 'ffa', Math.max(60, toInt(game.durationSeconds, 300, 60)), this.activeMatchRoom);
        } catch (error: any) {
            this.findGameStatusEl.textContent = error?.message || `Join failed for ${safePartyId}.`;
        }
    }

    private startGameSession(mode: string, durationSeconds: number, room?: SquadRoomState | null) {
        const safeMode = `${mode || 'ffa'}`.trim().toLowerCase();
        const requireAuth = true;
        if (requireAuth && !this.isAuthenticated()) {
            this.setAuthStatus('Login required to start online FFA.');
            this.showTab('play');
            return;
        }

        const user = this.currentUser;
        this.activeMatchRoom = room || this.activeMatchRoom || null;
        this.currentGameMode = safeMode;
        this.gameStarted = true;
        this.hideQuickMatchOverlay();
        this.hideForboxModal();
        this.mainMenu.classList.add('hidden');
        this.blocker.style.display = 'none';

        window.dispatchEvent(new CustomEvent('game:play-now', {
            detail: {
                mode: safeMode,
                durationSeconds: Math.max(0, Math.floor(durationSeconds || 0)),
                room: this.activeMatchRoom ? {
                    id: this.activeMatchRoom.id,
                    partyId: this.activeMatchRoom.partyId,
                    visibility: this.activeMatchRoom.visibility,
                    label: this.activeMatchRoom.label,
                    game: this.activeMatchRoom.game || null,
                } : undefined,
                auth: user ? {
                    token: this.sessionToken,
                    username: this.getDisplayName(),
                    userId: user.id,
                    premier: user.premier,
                    loadout: user.loadout || { ...FALLBACK_LOADOUT },
                    progression: user.progression,
                } : undefined,
            },
        }));

        if (!GameContext.PointLock.isLocked) GameContext.PointLock.lock();
    }

    private showPauseBlocker() {
        this.blocker.style.display = 'block';
    }

    private resumeGameplay() {
        this.blocker.style.display = 'none';
        if (!GameContext.PointLock.isLocked) GameContext.PointLock.lock();
    }

    private returnToMainMenu() {
        this.openMainMenuState();
        window.dispatchEvent(new CustomEvent('game:return-main-menu'));
    }

    private openMainMenuState() {
        this.gameStarted = false;
        this.currentGameMode = 'ffa';
        this.intermissionActive = false;
        this.blocker.style.display = 'none';
        this.mainMenu.classList.remove('hidden');
        this.hideForboxModal();
        this.hideCaseModal();
        this.hideWeaponReviewModal();
        this.showTab('play');
        if (GameContext.PointLock.isLocked) GameContext.PointLock.unlock();
    }
}
