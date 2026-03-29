import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { UserInputEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { GameObjectMaterialEnum } from '@src/gameplay/abstract/GameObjectMaterialEnum';
import { InventorySlotEnum, mapIventorySlotByWeaponClassficationEnum } from '@src/gameplay/abstract/InventorySlotEnum';
import { KillFeedEvent, GameLogicEventPipe, PlayerDamagedEvent, PlayerDiedEvent, PlayerRespawnedEvent, WeaponFireEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { UserInputEvent, UserInputEventPipe } from '@src/gameplay/pipes/UserinputEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { getRuntimePlayerAppearance } from '@src/gameplay/player/PlayerAppearance';
import { createWeaponById, cloneWeaponInstanceWithAmmo } from '@src/gameplay/loadout/weaponFactory';
import { getWeaponEntry } from '@src/gameplay/loadout/weaponCatalog';
import { getRuntimeBotTune, getRuntimeTuningSnapshot, getRuntimeWeaponTune, subscribeRuntimeTuning } from '@src/gameplay/tuning/RuntimeTuning';
import { WeaponInterface } from '@src/gameplay/weapon/abstract/WeaponInterface';
import { Capsule } from 'three/examples/jsm/math/Capsule';
import { Octree } from 'three/examples/jsm/math/Octree';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';
import {
    Box3,
    BoxGeometry,
    CanvasTexture,
    DoubleSide,
    Group,
    MathUtils,
    Material,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Ray,
    Raycaster,
    Sprite,
    SpriteMaterial,
    Vector3,
} from 'three';
import { computeDamageBreakdown, getBotWeaponPreset, toHitgroupFromPart } from '@src/gameplay/combat/CombatTuning';
import { getModeRules } from '@src/gameplay/modes/modeRules';
import { getRuntimeQualityProfile } from '@src/core/RuntimeQuality';
import { PLAYER_COLLIDER_RADIUS, PLAYER_STANDING_END_OFFSET } from '@src/gameplay/input/controllers/MovementController';

type TeamName = 'CT' | 'T';
type DifficultyName = 'EASY' | 'NORMAL' | 'HARD';
type RoundPhase = 'freeze' | 'live' | 'ended';
type BotIntent = 'ANCHOR' | 'PUSH' | 'FLANK' | 'RETREAT';
type MapProfile = 'mirage' | 'dust2' | 'generic';

type DamageResult = { matched: boolean; killed: boolean; victimName: string; damage: number; };
type BotConfig = { id: string; name: string; team: TeamName; difficulty: DifficultyName; };
type PlayNowDetail = { mode?: string };

type DifficultyProfile = {
    moveSpeed: number;
    acceleration: number;
    turnSpeed: number;
    reactionSeconds: number;
    engageMin: number;
    engageMax: number;
    tracking: number;
    bravery: number;
};

type WeaponProfile = {
    weaponName: string;
    baseDamage: number;
    armorPen: number;
    rangeModifier: number;
    burstMin: number;
    burstMax: number;
    shotDelay: number;
    burstCooldownMin: number;
    burstCooldownMax: number;
    spreadStanding: number;
    spreadMoving: number;
    recoilPerShot: number;
    recoilRecover: number;
    color: number;
};

type HitgroupName = 'HEAD' | 'CHEST' | 'STOMACH' | 'ARM' | 'LEG';

type DamageBreakdown = {
    healthDamage: number;
    armorDamage: number;
    rawDamage: number;
};

type TargetInfo = { kind: 'player' | 'bot'; name: string; team: TeamName; position: Vector3; bot?: BotAgent; };

type BotRig = {
    root: Group;
    headJoint: Object3D;
    leftArmJoint: Object3D;
    rightArmJoint: Object3D;
    leftLegJoint: Object3D;
    rightLegJoint: Object3D;
    weaponMesh: Mesh;
    muzzleMesh: Mesh;
    aimIndicator: Group;
    aimBeam: Mesh;
    aimTip: Mesh;
    nameTag: Sprite;
    shieldSprite: Sprite;
    materials: TintableMaterial[];
    baseColors: number[];
    baseOpacities: number[];
    baseTransparent: boolean[];
};

type TintableMaterial = Material & {
    color: {
        getHex(): number;
        setRGB(r: number, g: number, b: number): void;
    };
    opacity: number;
    transparent: boolean;
};

type BotAgent = {
    id: string;
    name: string;
    team: TeamName;
    isTestDummy: boolean;
    difficulty: DifficultyName;
    runtimeOrder: number;
    profile: DifficultyProfile;
    weapon: WeaponProfile;
    weaponInstance: WeaponInterface;
    rig: BotRig;
    hp: number;
    armor: number;
    hasHelmet: boolean;
    alive: boolean;
    onFloor: boolean;
    collider: Capsule;
    velocity: Vector3;
    speed: number;
    currentNode: number;
    spawnNode: number;
    targetNode: number;
    path: number[];
    pathCursor: number;
    intent: BotIntent;
    nextDecisionAt: number;
    nextRepathAt: number;
    lastSeenAt: number;
    lastSeenPos: Vector3;
    burstShotsLeft: number;
    nextShotAt: number;
    nextBurstAt: number;
    aimLock: number;
    recoil: number;
    kick: number;
    muzzleUntil: number;
    walkCycle: number;
    strafePhase: number;
    lastSamplePos: Vector3;
    sampleTimer: number;
    respawnAt: number;
    spawnProtectedUntil: number;
    outOfBoundsSince: number;
    hitGlowUntil: number;
    hitGlowStrength: number;
    anchorPosition: Vector3;
};

type DroppedWeaponData = {
    mesh: Mesh;
    weaponInstance: WeaponInterface;
    slot: InventorySlotEnum;
    removeAt: number;
};

export type DroppedWeaponPromptInfo = {
    weaponName: string;
    distance: number;
};

export type DebugColliderSnapshot = {
    player: { start: Vector3; end: Vector3; radius: number; } | null;
    bots: Array<{ id: string; start: Vector3; end: Vector3; radius: number; alive: boolean; isTestDummy: boolean; }>;
};

type CorpseData = {
    rig: BotRig;
    spawnedAt: number;
    removeAt: number;
    initialPosition: Vector3;
    initialYaw: number;
    fallSide: number;
    isPlayer: boolean;
    headshot: boolean;
    launchDir: Vector3;
    launchDistance: number;
    settleDrop: number;
    droppedWeapon: Mesh | null;
};

const PLAYER_TEAM: TeamName = 'CT';
const FRIENDLY_FIRE = true;

const BOT_RESPAWN_SECONDS = 2.8;
const BOT_SPAWN_PROTECTION_SECONDS = 1.6;
const PLAYER_RESPAWN_SECONDS = 5.0;
const PLAYER_SPAWN_PROTECTION_SECONDS = 2.1;
const SPAWN_MIN_PLAYER_DISTANCE = 10;
const SPAWN_MIN_BOT_CLEARANCE = 6.25;
const SPAWN_MIN_BOT_CLEARANCE_SAFE = 8.2;
const SPAWN_RECENT_NODE_HISTORY = 12;
const SPAWN_RECENT_NODE_PROXIMITY = 8.0;
const SPAWN_RANDOM_TOP_DUST2 = 16;
const SPAWN_RANDOM_TOP_GENERIC = 10;
const OUT_OF_BOUNDS_GRACE_SECONDS = 1.1;
const CORPSE_LIFETIME_SECONDS = 3.0;
const CORPSE_FALL_DURATION_SECONDS = 0.72;
const CORPSE_FADE_DURATION_SECONDS = 0.65;
const DROPPED_WEAPON_LIFETIME_SECONDS = 30.0;
const DROPPED_WEAPON_PICKUP_DISTANCE = 2.35;

const PLAYER_MAX_HP = 100;
const PLAYER_MAX_ARMOR = 100;
const TEST_DUMMY_HP = 1000;
const TEST_DUMMY_RESPAWN_SECONDS = 1.0;

const BOT_HP = 100;
const BOT_COLLIDER_RADIUS = 0.28;
const BOT_COLLIDER_HEIGHT = 1.72;
const BOT_GRAVITY = 24;
const BOT_MAX_FALL_SPEED = 30;
const BOT_GROUND_FRICTION = 6.5;
const BOT_SEPARATION_RADIUS = 1.25;
const BOT_SEPARATION_FORCE = 5.2;

const NAV_GRID_STEP = 3.25;
const NAV_LINK_DISTANCE = 6.0;
const NAV_MAX_SLOPE_Y_DIFF = 1.4;
const NAV_REPATH_INTERVAL = 0.7;
const DUST2_NAV_GRID_STEP = 2.75;
const DUST2_NAV_LINK_DISTANCE = 5.5;
const DUST2_NAV_MAX_SLOPE_Y_DIFF = 1.65;

const LOS_HEIGHT = 1.25;
const STUCK_SAMPLE_INTERVAL = 0.8;
const STUCK_DISTANCE = 0.22;

const ALL_BOT_CONFIGS: BotConfig[] = [
    { id: 'ct_1', name: 'BOT_ALEX', team: 'CT', difficulty: 'NORMAL' },
    { id: 'ct_2', name: 'BOT_MIRA', team: 'CT', difficulty: 'HARD' },
    { id: 't_1', name: 'BOT_IVAN', team: 'T', difficulty: 'NORMAL' },
    { id: 't_2', name: 'BOT_NOVA', team: 'T', difficulty: 'EASY' },
    { id: 't_3', name: 'BOT_SHADE', team: 'T', difficulty: 'HARD' },
];
const QUALITY_TIER = getRuntimeQualityProfile().tier;
const BOT_CONFIGS: BotConfig[] = QUALITY_TIER === 'low'
    ? ALL_BOT_CONFIGS.slice(0, 3)
    : (QUALITY_TIER === 'medium' ? ALL_BOT_CONFIGS.slice(0, 4) : ALL_BOT_CONFIGS);
const ROLE_VARIANTS = ['Character_Female_FBI', 'Character_Male_civilian'] as const;

const DIFFICULTY: Record<DifficultyName, DifficultyProfile> = {
    EASY: { moveSpeed: 1.9, acceleration: 5.8, turnSpeed: 2.2, reactionSeconds: 0.68, engageMin: 7, engageMax: 20, tracking: 0.24, bravery: 0.32 },
    NORMAL: { moveSpeed: 2.15, acceleration: 6.6, turnSpeed: 2.8, reactionSeconds: 0.48, engageMin: 9, engageMax: 24, tracking: 0.36, bravery: 0.46 },
    HARD: { moveSpeed: 2.38, acceleration: 7.2, turnSpeed: 3.4, reactionSeconds: 0.34, engageMin: 10, engageMax: 28, tracking: 0.47, bravery: 0.56 },
};

const botWeapon = (weaponId: string, color: number, weaponName?: string): WeaponProfile => {
    const preset = getBotWeaponPreset(weaponId);
    const tune = getRuntimeWeaponTune(weaponId);
    const visualColor = Number.parseInt(tune.materialTint.replace('#', ''), 16);
    return {
        weaponName: weaponName || preset.weaponName,
        baseDamage: preset.baseDamage,
        armorPen: preset.armorPen,
        rangeModifier: preset.rangeModifier,
        burstMin: preset.burstMin,
        burstMax: preset.burstMax,
        shotDelay: preset.shotDelay,
        burstCooldownMin: preset.burstCooldownMin,
        burstCooldownMax: preset.burstCooldownMax,
        spreadStanding: preset.spreadStanding,
        spreadMoving: preset.spreadMoving,
        recoilPerShot: preset.recoilPerShot,
        recoilRecover: preset.recoilRecover,
        color: Number.isFinite(visualColor) ? visualColor : color,
    };
};

const WEAPONS: Record<string, WeaponProfile> = {
    AK47: botWeapon('ak47', 0x2f2f2f, 'AK47'),
    M4A1S: botWeapon('m4a1_s', 0x30353f, 'M4A1-S'),
    MP9: botWeapon('mp9', 0x2b3b44, 'MP9'),
    AWP: botWeapon('awp', 0x514b33, 'AWP'),
};

const downDirection = new Vector3(0, -1, 0);

export class EnemyBotSystem implements CycleInterface, LoopInterface {
    private static enemyBotSystem: EnemyBotSystem;
    public static getInstance() {
        if (!this.enemyBotSystem) this.enemyBotSystem = new EnemyBotSystem();
        return this.enemyBotSystem;
    }

    public getDebugColliderSnapshot(): DebugColliderSnapshot {
        const movement = this.localPlayer.movementController;
        const playerCollider = movement?.playerCollider
            ? {
                start: movement.playerCollider.start.clone(),
                end: movement.playerCollider.end.clone(),
                radius: movement.playerCollider.radius,
            }
            : null;
        const bots = Array.from(this.bots.values()).map((bot) => ({
            id: bot.id,
            start: bot.collider.start.clone(),
            end: bot.collider.end.clone(),
            radius: bot.collider.radius,
            alive: bot.alive,
            isTestDummy: bot.isTestDummy,
        }));
        return { player: playerCollider, bots };
    }

    private constructor() { }

    private scene = GameContext.Scenes.Level;
    private localPlayer = LocalPlayer.getInstance();
    private worldOctree: Octree = GameContext.Physical.WorldOCTree;

    private bots = new Map<string, BotAgent>();
    private corpses: CorpseData[] = [];
    private droppedWeapons: DroppedWeaponData[] = [];
    private meshToBotId = new Map<string, string>();

    private walkMeshes: Object3D[] = [];
    private losBlockerMeshes: Object3D[] = [];
    private navNodes: Vector3[] = [];
    private navLinks: number[][] = [];
    private navBounds = new Box3();
    private ctNavNodes: number[] = [];
    private tNavNodes: number[] = [];
    private ctSpawnNodes: number[] = [];
    private tSpawnNodes: number[] = [];
    private dust2RouteNodes: number[] = [];
    private recentCTSpawnNodes: number[] = [];
    private recentTSpawnNodes: number[] = [];
    private recentPlayerSpawnNodes: number[] = [];

    private groundRaycaster = new Raycaster();
    private losRaycaster = new Raycaster();
    private losRay = new Ray(new Vector3(), new Vector3());
    private groundNormal = new Vector3();

    private roundPhase: RoundPhase = 'freeze';
    private roundNumber = 1;
    private phaseEndsAt = 0;
    private currentMode = 'ffa';
    private runtimeReady = false;
    private matchEnabled = false;
    private intermissionActive = false;
    private pendingRestart = false;
    private playerRespawnAt = -1;
    private playerSpawnProtectedUntil = 0;
    private playerDeathPos = new Vector3();
    private lastKillerName = '';
    private lastKillerBotId = '';
    private mapProfile: MapProfile = 'generic';
    private mapAssetPath = '';

    private v1 = new Vector3();
    private v2 = new Vector3();
    private v3 = new Vector3();

    init(): void {
        this.worldOctree = GameContext.Physical.WorldOCTree;
        this.detectMapProfile();
        this.collectWalkMeshes();
        this.collectLOSBlockers();
        this.buildNavigationGraph();
        this.createBots();

        window.addEventListener('game:play-now', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as PlayNowDetail;
            this.currentMode = `${detail.mode || 'ffa'}`.trim().toLowerCase();
            const modeRules = getModeRules(this.currentMode);

            this.matchEnabled = modeRules.enableBots;
            this.intermissionActive = false;
            this.pendingRestart = modeRules.enableBots;
            this.playerRespawnAt = -1;
            this.playerSpawnProtectedUntil = 0;

            if (!modeRules.enableBots) {
                this.roundPhase = 'freeze';
                this.hideAllBots();
            }
        });

        window.addEventListener('game:return-main-menu', () => {
            this.currentMode = 'ffa';
            this.matchEnabled = false;
            this.intermissionActive = false;
            this.playerRespawnAt = -1;
            this.playerSpawnProtectedUntil = 0;
            this.lastKillerName = '';
            this.lastKillerBotId = '';
            this.roundPhase = 'freeze';
            this.hideAllBots();
        });

        window.addEventListener('game:round-intermission-start', () => {
            this.intermissionActive = true;
            this.roundPhase = 'ended';
            this.playerRespawnAt = -1;
            if (this.localPlayer.movementController) this.localPlayer.movementController.clearInputState();
            this.bots.forEach(bot => {
                bot.path = [];
                bot.pathCursor = 0;
                bot.velocity.set(0, 0, 0);
                bot.nextShotAt = Number.POSITIVE_INFINITY;
                bot.nextBurstAt = Number.POSITIVE_INFINITY;
            });
        });

        window.addEventListener('game:round-intermission-end', () => {
            if (!this.matchEnabled) return;
            this.intermissionActive = false;
            this.pendingRestart = true;
        });

        GameLogicEventPipe.addEventListener(WeaponFireEvent.type, () => {
            if (this.localPlayer.health > 0) this.playerSpawnProtectedUntil = 0;
        });

        UserInputEventPipe.addEventListener(UserInputEvent.type, (e: CustomEvent) => {
            if (e.detail.enum !== UserInputEventEnum.BUTTON_INTERACT) return;
            if (!this.matchEnabled || this.localPlayer.health <= 0) return;
            this.tryPickupDroppedWeapon();
        });

        subscribeRuntimeTuning(() => {
            this.applyRuntimeBotRoster();
        });
    }

    private detectMapProfile() {
        this.mapProfile = 'generic';
        this.mapAssetPath = '';

        const mapResource = GameContext.GameResources.resourceMap.get('Map') as any;
        const mapPath = `${mapResource?.scene?.userData?.mapAssetPath || ''}`.toLowerCase();
        this.mapAssetPath = mapPath;
        if (!mapPath) return;
        if (mapPath.includes('mirage')) this.mapProfile = 'mirage';
        else if (mapPath.includes('dust') || mapPath.includes('dust2')) this.mapProfile = 'dust2';
    }

    private getNavGridStep() {
        return this.mapProfile === 'dust2' ? DUST2_NAV_GRID_STEP : NAV_GRID_STEP;
    }

    private getNavLinkDistance() {
        return this.mapProfile === 'dust2' ? DUST2_NAV_LINK_DISTANCE : NAV_LINK_DISTANCE;
    }

    private getNavMaxSlopeDiff() {
        return this.mapProfile === 'dust2' ? DUST2_NAV_MAX_SLOPE_Y_DIFF : NAV_MAX_SLOPE_Y_DIFF;
    }

    private hideAllBots() {
        this.bots.forEach(bot => {
            this.deactivateBot(bot);
        });
        this.clearCorpses();
        this.clearDroppedWeapons();
    }

    private isRuntimeBotActive(bot: BotAgent) {
        if (bot.isTestDummy) return true;
        const runtime = getRuntimeTuningSnapshot().bots;
        const perBot = runtime?.perBot?.[bot.id];
        const count = Math.max(0, Math.floor(Number(runtime?.activeCount) || 0));
        return bot.runtimeOrder < count && perBot?.enabled !== false;
    }

    private deactivateBot(bot: BotAgent) {
        bot.alive = false;
        bot.rig.root.visible = false;
        bot.path = [];
        bot.pathCursor = 0;
        bot.currentNode = -1;
        bot.targetNode = -1;
        bot.velocity.set(0, 0, 0);
        bot.nextShotAt = Number.POSITIVE_INFINITY;
        bot.nextBurstAt = Number.POSITIVE_INFINITY;
        bot.respawnAt = 0;
    }

    private applyRuntimeBotRoster() {
        this.bots.forEach(bot => {
            if (this.isRuntimeBotActive(bot)) return;
            this.deactivateBot(bot);
        });
    }

    public getScoreboardRoster() {
        const rows: Array<{
            id: string;
            name: string;
            title: string;
            nameColor: string;
            avatar: string;
            avatarFrame: string;
            elo: number;
            premierTier: string;
            calibrated: boolean;
            ping: number;
        }> = [];

        this.bots.forEach((bot) => {
            if (!this.isRuntimeBotActive(bot)) return;
            rows.push({
                id: bot.id,
                name: bot.name,
                title: bot.difficulty === 'HARD' ? 'Legend' : (bot.difficulty === 'NORMAL' ? 'Sharpshooter' : 'Rookie'),
                nameColor: bot.team === 'CT' ? 'blue' : 'pink',
                avatar: bot.team === 'CT' ? 'hawk_eye' : 'night_viper',
                avatarFrame: bot.difficulty === 'HARD' ? 'legend' : (bot.team === 'CT' ? 'steel' : 'neon'),
                elo: bot.difficulty === 'HARD' ? 24000 : (bot.difficulty === 'NORMAL' ? 15000 : 8500),
                premierTier: bot.difficulty === 'HARD' ? 'pink' : (bot.difficulty === 'NORMAL' ? 'blue' : 'cyan'),
                calibrated: true,
                ping: bot.team === 'CT' ? 24 : 31,
            });
        });

        return rows;
    }

    private getBotRuntimeProfile(bot: BotAgent) {
        const runtime = getRuntimeTuningSnapshot().bots;
        const perBot = getRuntimeBotTune(bot.id);
        return {
            reactionMul: runtime.reactionMul * perBot.reactionMul,
            turnSpeedMul: runtime.turnSpeedMul * perBot.turnSpeedMul,
            trackingMul: perBot.trackingMul,
            aggression: perBot.aggression,
            defense: perBot.defense,
            tactical: perBot.tactical,
            hitChanceMul: runtime.hitChanceMul * perBot.hitChanceMul,
            spreadMul: runtime.spreadMul,
            burstMul: runtime.burstMul,
            cooldownMul: runtime.cooldownMul,
            aimLockMul: runtime.aimLockMul * MathUtils.lerp(0.9, 1.2, perBot.trackingMul - 1 + 0.5),
        };
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        const dt = Math.min(0.05, Math.max(0.001, deltaTime || 0));
        const elapsed = elapsedTime || 0;

        if (!this.runtimeReady) {
            if (!this.localPlayer.movementController || !this.localPlayer.movementController.playerCollider) return;
            this.runtimeReady = true;
        }

        if (this.pendingRestart && this.runtimeReady) {
            this.pendingRestart = false;
            this.startRound(elapsed);
        }

        this.updateCorpses(elapsed);
        this.updateDroppedWeapons(elapsed);

        if (!this.matchEnabled) return;
        if (this.intermissionActive) return;

        this.updatePlayerRespawn(elapsed);
        if (this.localPlayer.health <= 0) this.updateDeathCamera(dt, elapsed);
        this.tickBots(dt, elapsed);
    }

    applyDamageFromHitObject(hitObject: Object3D, weaponName: string, distanceWorld: number, attackerTeam: TeamName = PLAYER_TEAM): DamageResult {
        if (!getModeRules(this.currentMode).allowDamage) return { matched: false, killed: false, victimName: '', damage: 0 };
        const botId = this.resolveBotId(hitObject);
        if (!botId) return { matched: false, killed: false, victimName: '', damage: 0 };
        if (this.intermissionActive) return { matched: true, killed: false, victimName: '', damage: 0 };

        const bot = this.bots.get(botId);
        const elapsed = GameContext.GameLoop.Clock.getElapsedTime();
        if (!bot || !bot.alive) return { matched: true, killed: false, victimName: bot ? bot.name : '', damage: 0 };
        if (!bot.isTestDummy) {
            if (this.roundPhase !== 'live' || !this.matchEnabled) return { matched: true, killed: false, victimName: bot.name, damage: 0 };
            if (this.isPlayerSpawnProtected(elapsed)) return { matched: true, killed: false, victimName: bot.name, damage: 0 };
            if (elapsed < bot.spawnProtectedUntil) return { matched: true, killed: false, victimName: bot.name, damage: 0 };
        }
        if (!FRIENDLY_FIRE && bot.team === attackerTeam) return { matched: true, killed: false, victimName: bot.name, damage: 0 };

        const part = hitObject.userData['GameObjectMaterialEnum'] as GameObjectMaterialEnum;
        const damage = this.calculateDamage(weaponName, part, distanceWorld, bot.armor, bot.hasHelmet);
        const impactDir = this.v1.copy(bot.rig.root.position).sub(GameContext.Cameras.PlayerCamera.position).setY(0);
        const killed = this.applyDamageToBot(bot, damage, elapsed, part === GameObjectMaterialEnum.PlayerHead, impactDir);
        if (!killed) {
            bot.kick = Math.min(1, bot.kick + 0.24);
            if (!bot.isTestDummy) {
                bot.nextDecisionAt = elapsed;
                bot.lastSeenAt = elapsed;
                bot.lastSeenPos.copy(this.getPlayerTargetPosition());
                if (bot.intent === 'ANCHOR') bot.intent = 'PUSH';
            }
        }
        return { matched: true, killed, victimName: bot.name, damage: damage.healthDamage };
    }

    private collectWalkMeshes() {
        this.walkMeshes.length = 0;
        this.scene.traverse((child: Object3D) => {
            if (!(child as Mesh).isMesh) return;
            if (child.userData['GameObjectMaterialEnum'] === GameObjectMaterialEnum.GrassGround) this.walkMeshes.push(child);
        });

        if (!this.walkMeshes.length) {
            this.scene.traverse((child: Object3D) => {
                if ((child as Mesh).isMesh) this.walkMeshes.push(child);
            });
        }
    }

    private collectLOSBlockers() {
        this.losBlockerMeshes.length = 0;
        this.scene.traverse((child: Object3D) => {
            if (!(child as Mesh).isMesh) return;
            if (child.visible === false) return;

            const materialEnum = child.userData['GameObjectMaterialEnum'];
            if (
                materialEnum === GameObjectMaterialEnum.PlayerHead ||
                materialEnum === GameObjectMaterialEnum.PlayerChest ||
                materialEnum === GameObjectMaterialEnum.PlayerBelly ||
                materialEnum === GameObjectMaterialEnum.PlayerUpperLimb ||
                materialEnum === GameObjectMaterialEnum.PlayerLowerLimb
            ) return;

            this.losBlockerMeshes.push(child);
        });

        if (!this.losBlockerMeshes.length) {
            this.scene.traverse((child: Object3D) => {
                if ((child as Mesh).isMesh) this.losBlockerMeshes.push(child);
            });
        }
    }

    private buildNavigationGraph() {
        this.navNodes.length = 0;
        this.navLinks.length = 0;
        this.ctSpawnNodes.length = 0;
        this.tSpawnNodes.length = 0;
        this.dust2RouteNodes.length = 0;

        if (!this.walkMeshes.length) {
            this.buildFallbackNodes();
            return;
        }

        const bounds = new Box3();
        this.walkMeshes.forEach(mesh => bounds.expandByObject(mesh));
        if (bounds.isEmpty()) {
            this.buildFallbackNodes();
            return;
        }

        const topMargin = this.mapProfile === 'dust2' ? 44 : 24;
        const bottomMargin = this.mapProfile === 'dust2' ? 30 : 18;
        const edgeInset = this.mapProfile === 'dust2' ? 2.5 : 1;
        const topY = bounds.max.y + topMargin;
        const bottomY = bounds.min.y - bottomMargin;
        const minX = bounds.min.x + edgeInset;
        const maxX = bounds.max.x - edgeInset;
        const minZ = bounds.min.z + edgeInset;
        const maxZ = bounds.max.z - edgeInset;
        const gridStep = this.getNavGridStep();
        const linkDistance = this.getNavLinkDistance();
        const maxSlopeDiff = this.getNavMaxSlopeDiff();

        for (let x = minX; x <= maxX; x += gridStep) {
            for (let z = minZ; z <= maxZ; z += gridStep) {
                const p = this.sampleGroundPoint(x, z, topY, bottomY);
                if (p) this.navNodes.push(p);
            }
        }

        const minNavNodeCount = this.mapProfile === 'dust2' ? 65 : 30;
        if (this.navNodes.length < minNavNodeCount) {
            this.buildFallbackNodes();
            return;
        }

        this.navLinks = Array.from({ length: this.navNodes.length }, () => []);
        for (let i = 0; i < this.navNodes.length; i++) {
            const a = this.navNodes[i];
            for (let j = i + 1; j < this.navNodes.length; j++) {
                const b = this.navNodes[j];
                if (Math.abs(a.y - b.y) > maxSlopeDiff) continue;
                if (a.distanceToSquared(b) > linkDistance * linkDistance) continue;
                if (!this.hasLineOfSight(a, b)) continue;
                this.navLinks[i].push(j);
                this.navLinks[j].push(i);
            }
        }

        const keep: number[] = [];
        for (let i = 0; i < this.navNodes.length; i++) if (this.navLinks[i].length > 0) keep.push(i);
        const minLinkedNodeCount = this.mapProfile === 'dust2' ? 40 : 20;
        if (keep.length < minLinkedNodeCount) {
            this.buildFallbackNodes();
            return;
        }

        const remap = new Map<number, number>();
        const compactNodes: Vector3[] = [];
        keep.forEach((oldIndex, newIndex) => { remap.set(oldIndex, newIndex); compactNodes.push(this.navNodes[oldIndex]); });

        const compactLinks: number[][] = Array.from({ length: compactNodes.length }, () => []);
        keep.forEach((oldIndex, newIndex) => {
            const links = this.navLinks[oldIndex];
            for (let i = 0; i < links.length; i++) {
                const mapped = remap.get(links[i]);
                if (mapped !== undefined) compactLinks[newIndex].push(mapped);
            }
        });

        this.navNodes = compactNodes;
        this.navLinks = compactLinks;
        this.rebuildNavBounds();
        this.splitTeamNodes();
        this.buildTeamSpawnPools();
        this.buildDust2RouteNodes();
    }

    private rebuildNavBounds() {
        this.navBounds.makeEmpty();
        for (let i = 0; i < this.navNodes.length; i++) this.navBounds.expandByPoint(this.navNodes[i]);
    }

    private splitTeamNodes() {
        this.ctNavNodes.length = 0;
        this.tNavNodes.length = 0;
        this.ctSpawnNodes.length = 0;
        this.tSpawnNodes.length = 0;
        this.recentCTSpawnNodes.length = 0;
        this.recentTSpawnNodes.length = 0;
        this.recentPlayerSpawnNodes.length = 0;

        if (!this.navNodes.length) return;

        if (this.mapProfile === 'dust2') {
            const spanX = this.navBounds.max.x - this.navBounds.min.x;
            const spanZ = this.navBounds.max.z - this.navBounds.min.z;
            const axis: 'x' | 'z' = spanX >= spanZ ? 'x' : 'z';
            const mid = axis === 'x'
                ? (this.navBounds.min.x + this.navBounds.max.x) * 0.5
                : (this.navBounds.min.z + this.navBounds.max.z) * 0.5;

            for (let i = 0; i < this.navNodes.length; i++) {
                const value = axis === 'x' ? this.navNodes[i].x : this.navNodes[i].z;
                if (value >= mid) this.ctNavNodes.push(i);
                else this.tNavNodes.push(i);
            }
        } else {
            const midZ = (this.navBounds.min.z + this.navBounds.max.z) * 0.5;
            for (let i = 0; i < this.navNodes.length; i++) {
                if (this.navNodes[i].z >= midZ) this.ctNavNodes.push(i);
                else this.tNavNodes.push(i);
            }
        }

        if (!this.ctNavNodes.length || !this.tNavNodes.length) {
            this.ctNavNodes = [];
            this.tNavNodes = [];
            for (let i = 0; i < this.navNodes.length; i++) {
                if (i % 2 === 0) this.ctNavNodes.push(i);
                else this.tNavNodes.push(i);
            }
        }

    }

    private buildTeamSpawnPools() {
        this.ctSpawnNodes = this.rankSpawnCandidates(this.ctNavNodes, 'CT');
        this.tSpawnNodes = this.rankSpawnCandidates(this.tNavNodes, 'T');

        if (!this.ctSpawnNodes.length) this.ctSpawnNodes = [...this.ctNavNodes];
        if (!this.tSpawnNodes.length) this.tSpawnNodes = [...this.tNavNodes];
        if (!this.ctSpawnNodes.length) this.ctSpawnNodes = this.navNodes.map((_, idx) => idx);
        if (!this.tSpawnNodes.length) this.tSpawnNodes = this.navNodes.map((_, idx) => idx);
    }

    private rankSpawnCandidates(nodes: number[], team: TeamName) {
        if (!nodes.length) return [];

        const enemyNodes = team === 'CT' ? this.tNavNodes : this.ctNavNodes;
        const center = this.v1.set(
            (this.navBounds.min.x + this.navBounds.max.x) * 0.5,
            (this.navBounds.min.y + this.navBounds.max.y) * 0.5,
            (this.navBounds.min.z + this.navBounds.max.z) * 0.5,
        ).clone();
        const scored = nodes.map((idx) => {
            const node = this.navNodes[idx];
            let nearestEnemy = Number.POSITIVE_INFINITY;
            let visibleEnemyScore = 0;

            for (let i = 0; i < enemyNodes.length; i++) {
                const enemyNode = this.navNodes[enemyNodes[i]];
                const d = node.distanceTo(enemyNode);
                if (d < nearestEnemy) nearestEnemy = d;
                if (this.hasLineOfSight(node, enemyNode)) visibleEnemyScore += Math.max(0, 20 - d) * 0.7 + 1.6;
            }

            const distCenter = node.distanceTo(center);
            const centerVisiblePenalty = this.hasLineOfSight(node, center) ? 5.5 : -1.2;
            const score = distCenter * 1.15 + nearestEnemy * 0.72 - visibleEnemyScore - centerVisiblePenalty;
            return { idx, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const keepRatio = this.mapProfile === 'dust2' ? 0.62 : 0.5;
        const keep = Math.max(12, Math.min(72, Math.floor(nodes.length * keepRatio)));
        const minGapSq = (this.mapProfile === 'dust2' ? 6.2 : 4.8) ** 2;
        const picks: number[] = [];

        for (let i = 0; i < scored.length && picks.length < keep; i++) {
            const idx = scored[i].idx;
            let tooClose = false;
            for (let j = 0; j < picks.length; j++) {
                if (this.navNodes[idx].distanceToSquared(this.navNodes[picks[j]]) < minGapSq) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) picks.push(idx);
        }

        if (picks.length < keep) {
            for (let i = 0; i < scored.length && picks.length < keep; i++) {
                const idx = scored[i].idx;
                if (!picks.includes(idx)) picks.push(idx);
            }
        }

        return picks;
    }

    private buildDust2RouteNodes() {
        this.dust2RouteNodes.length = 0;
        if (this.mapProfile !== 'dust2' || this.navNodes.length < 24) return;

        const center = this.v1.set(
            (this.navBounds.min.x + this.navBounds.max.x) * 0.5,
            (this.navBounds.min.y + this.navBounds.max.y) * 0.5,
            (this.navBounds.min.z + this.navBounds.max.z) * 0.5,
        ).clone();
        const scored: { idx: number; score: number }[] = [];

        for (let i = 0; i < this.navNodes.length; i++) {
            const degree = this.navLinks[i]?.length || 0;
            if (degree <= 1) continue;
            const distCenter = this.navNodes[i].distanceTo(center);
            const score = degree * 4.2 - distCenter * 0.16;
            scored.push({ idx: i, score });
        }

        scored.sort((a, b) => b.score - a.score);
        const targetCount = Math.max(10, Math.min(28, Math.floor(this.navNodes.length * 0.12)));
        const picked: number[] = [];
        const minGapSq = 5.2 * 5.2;
        for (let i = 0; i < scored.length && picked.length < targetCount; i++) {
            const idx = scored[i].idx;
            let tooClose = false;
            for (let j = 0; j < picked.length; j++) {
                if (this.navNodes[idx].distanceToSquared(this.navNodes[picked[j]]) < minGapSq) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) picked.push(idx);
        }

        this.dust2RouteNodes = picked;
    }

    private getDust2RouteBias(node: Vector3) {
        if (this.mapProfile !== 'dust2' || !this.dust2RouteNodes.length) return 0;
        let bestDistSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.dust2RouteNodes.length; i++) {
            const routeNode = this.navNodes[this.dust2RouteNodes[i]];
            const d2 = routeNode.distanceToSquared(node);
            if (d2 < bestDistSq) bestDistSq = d2;
        }
        const dist = Math.sqrt(bestDistSq);
        return Math.max(0, 10 - dist) * 1.3;
    }

    private buildFallbackNodes() {
        const bounds = new Box3();
        this.walkMeshes.forEach(mesh => bounds.expandByObject(mesh));

        const fallbackNodes: Vector3[] = [];
        if (!bounds.isEmpty()) {
            const topY = bounds.max.y + 44;
            const bottomY = bounds.min.y - 32;
            const dust2Anchors: Array<[number, number]> = [
                [0.12, 0.88], [0.22, 0.78], [0.32, 0.68], [0.44, 0.56], [0.58, 0.44], [0.70, 0.34],
                [0.86, 0.14], [0.78, 0.24], [0.66, 0.32], [0.54, 0.42], [0.42, 0.54], [0.30, 0.66],
            ];
            const genericAnchors: Array<[number, number]> = [
                [0.12, 0.82], [0.24, 0.72], [0.36, 0.62], [0.48, 0.52], [0.60, 0.42], [0.72, 0.32],
                [0.84, 0.22], [0.76, 0.36], [0.64, 0.48], [0.52, 0.60], [0.40, 0.72], [0.28, 0.84],
            ];
            const anchors = this.mapProfile === 'dust2' ? dust2Anchors : genericAnchors;
            const sizeX = bounds.max.x - bounds.min.x;
            const sizeZ = bounds.max.z - bounds.min.z;
            for (let i = 0; i < anchors.length; i++) {
                const x = bounds.min.x + sizeX * anchors[i][0];
                const z = bounds.min.z + sizeZ * anchors[i][1];
                const sampled = this.sampleGroundPoint(x, z, topY, bottomY);
                if (!sampled) continue;
                fallbackNodes.push(sampled);
            }
        }

        if (!fallbackNodes.length) {
            fallbackNodes.push(
                new Vector3(-12, 0, 12),
                new Vector3(-6, 0, 10),
                new Vector3(0, 0, 8),
                new Vector3(6, 0, 6),
                new Vector3(12, 0, 4),
                new Vector3(-10, 0, -4),
                new Vector3(-4, 0, -8),
                new Vector3(2, 0, -12),
                new Vector3(8, 0, -16),
                new Vector3(14, 0, -20),
            );
        }

        this.navNodes = fallbackNodes;
        this.navLinks = Array.from({ length: this.navNodes.length }, () => []);
        for (let i = 0; i < this.navNodes.length; i++) {
            const a = this.navNodes[i];
            for (let j = i + 1; j < this.navNodes.length; j++) {
                const b = this.navNodes[j];
                if (Math.abs(a.y - b.y) > this.getNavMaxSlopeDiff() + 0.2) continue;
                if (a.distanceToSquared(b) > (this.getNavLinkDistance() * 1.35) ** 2) continue;
                this.navLinks[i].push(j);
                this.navLinks[j].push(i);
            }
        }
        this.rebuildNavBounds();
        this.splitTeamNodes();
        this.buildTeamSpawnPools();
        this.buildDust2RouteNodes();
    }

    private sampleGroundPoint(x: number, z: number, topY: number, bottomY: number): Vector3 | null {
        this.v1.set(x, topY, z);
        this.groundRaycaster.set(this.v1, downDirection);
        this.groundRaycaster.far = topY - bottomY + 2;
        const hits = this.groundRaycaster.intersectObjects(this.walkMeshes, true);
        const normalThreshold = this.mapProfile === 'dust2' ? 0.38 : 0.55;
        for (let i = 0; i < hits.length; i++) {
            const face = hits[i].face;
            if (!face) continue;
            this.groundNormal.copy(face.normal).transformDirection(hits[i].object.matrixWorld);
            if (this.groundNormal.y < normalThreshold) continue;
            return new Vector3(hits[i].point.x, hits[i].point.y + 0.02, hits[i].point.z);
        }
        return null;
    }

    private hasLineOfSight(a: Vector3, b: Vector3) {
        this.v1.copy(a).y += LOS_HEIGHT;
        this.v2.copy(b).y += LOS_HEIGHT;
        this.v3.copy(this.v2).sub(this.v1);
        const dist = this.v3.length();
        if (dist <= 0.01) return true;
        this.v3.multiplyScalar(1 / dist);

        // Primary occlusion check against world collision octree to avoid wall-shots.
        this.losRay.origin.copy(this.v1);
        this.losRay.direction.copy(this.v3);
        const octHit = this.worldOctree.rayIntersect(this.losRay);
        if (octHit && octHit.distance < dist - 0.08) return false;

        if (!this.losBlockerMeshes.length) return true;
        this.losRaycaster.set(this.v1, this.v3);
        this.losRaycaster.far = dist;
        const hits = this.losRaycaster.intersectObjects(this.losBlockerMeshes, true);
        if (!hits.length) return true;
        return hits[0].distance >= dist - 0.08;
    }

    private createBots() {
        BOT_CONFIGS.forEach((config, index) => {
            const bot = this.createBot(config, index);
            this.bots.set(bot.id, bot);
            this.scene.add(bot.rig.root);
        });
        this.applyRuntimeBotRoster();
    }

    private pickWeaponId(team: TeamName, difficulty: DifficultyName) {
        if (team === 'CT') return difficulty === 'EASY' ? 'mp9' : 'm4a1_s';
        if (difficulty === 'HARD') return 'awp';
        if (difficulty === 'EASY') return 'mp9';
        return 'ak47';
    }

    private createBot(config: BotConfig, runtimeOrder: number): BotAgent {
        const profile = DIFFICULTY[config.difficulty];
        const weaponId = this.pickWeaponId(config.team, config.difficulty);
        const weapon = this.pickWeapon(config.team, config.difficulty);
        const weaponInstance = createWeaponById(weaponId);
        const rig = this.createRig(config, weapon);

        return {
            id: config.id,
            name: config.name,
            team: config.team,
            isTestDummy: false,
            difficulty: config.difficulty,
            runtimeOrder,
            profile,
            weapon,
            weaponInstance,
            rig,
            hp: BOT_HP,
            armor: 0,
            hasHelmet: false,
            alive: false,
            onFloor: true,
            collider: new Capsule(new Vector3(0, BOT_COLLIDER_RADIUS, 0), new Vector3(0, BOT_COLLIDER_HEIGHT - BOT_COLLIDER_RADIUS, 0), BOT_COLLIDER_RADIUS),
            velocity: new Vector3(),
            speed: 0,
            currentNode: -1,
            spawnNode: -1,
            targetNode: -1,
            path: [],
            pathCursor: 0,
            intent: 'ANCHOR',
            nextDecisionAt: 0,
            nextRepathAt: 0,
            lastSeenAt: -999,
            lastSeenPos: new Vector3(),
            burstShotsLeft: 0,
            nextShotAt: 0,
            nextBurstAt: 0,
            aimLock: 0,
            recoil: 0,
            kick: 0,
            muzzleUntil: 0,
            walkCycle: Math.random() * Math.PI * 2,
            strafePhase: Math.random() * Math.PI * 2,
            lastSamplePos: new Vector3(),
            sampleTimer: 0,
            respawnAt: 0,
            spawnProtectedUntil: 0,
            outOfBoundsSince: -1,
            hitGlowUntil: 0,
            hitGlowStrength: 0,
            anchorPosition: new Vector3(),
        };
    }

    private createTestDummyBot() {
        const bot = this.createBot({ id: 'test_dummy', name: 'TEST_DUMMY', team: 'T', difficulty: 'EASY' }, 999);
        bot.isTestDummy = true;
        bot.hp = TEST_DUMMY_HP;
        return bot;
    }

    private pickWeapon(team: TeamName, difficulty: DifficultyName) {
        const weaponId = this.pickWeaponId(team, difficulty);
        if (weaponId === 'm4a1_s') return WEAPONS.M4A1S;
        if (weaponId === 'awp') return WEAPONS.AWP;
        if (weaponId === 'mp9') return WEAPONS.MP9;
        return WEAPONS.AK47;
    }

    private createRig(config: BotConfig, weapon: WeaponProfile): BotRig {
        const importedRig = this.createImportedRig(config, weapon);
        if (importedRig) return importedRig;

        return this.createPrimitiveRig(config, weapon);
    }

    private createImportedRig(config: BotConfig, weapon: WeaponProfile): BotRig | null {
        const appearance = getRuntimePlayerAppearance(config.id || config.name);
        const contentModelKey = appearance?.modelPath ? `ContentPlayerModel:${appearance.modelPath}` : '';
        const contentModelResource = contentModelKey ? GameContext.GameResources.resourceMap.get(contentModelKey) as any : null;
        const roleResource = contentModelResource || GameContext.GameResources.resourceMap.get('Role') as any;
        const roleScene = (roleResource?.scene || roleResource) as Object3D | undefined;
        if (!roleScene) return null;

        const root = new Group();
        root.name = config.name;
        root.visible = false;

        const visualRoot = cloneSkeleton(roleScene);
        visualRoot.name = `${config.name}_Visual`;
        root.add(visualRoot);

        const usesCustomContentModel = !!appearance?.modelPath;
        const selectedVariant = config.team === 'CT' ? ROLE_VARIANTS[0] : ROLE_VARIANTS[1];
        const variantVisibleMeshes = new Set(Array.isArray(appearance?.visibleMeshes) ? appearance.visibleMeshes : []);
        const tintableMaterials: TintableMaterial[] = [];
        let visibleMeshCount = 0;
        visualRoot.traverse((child: any) => {
            if (!child?.isMesh) return;
            const meshKey = this.getPreviewStyleNodeKey(child, visualRoot);
            const hasVariantSelection = variantVisibleMeshes.size > 0;
            if (hasVariantSelection) child.visible = variantVisibleMeshes.has(meshKey);
            else if (usesCustomContentModel) child.visible = true;
            else child.visible = child.name === selectedVariant;
            if (appearance?.meshVisibility && Object.prototype.hasOwnProperty.call(appearance.meshVisibility, meshKey)) {
                child.visible = appearance.meshVisibility[meshKey] !== false;
            }
            if (!child.visible) return;
            visibleMeshCount += 1;

            if (Array.isArray(child.material)) {
                child.material = child.material.map((material: TintableMaterial | undefined) => this.cloneTintableMaterial(material));
            } else {
                child.material = this.cloneTintableMaterial(child.material);
            }

            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material: TintableMaterial | undefined) => {
                if (!material?.color || tintableMaterials.includes(material)) return;
                tintableMaterials.push(material);
            });
        });

        if (!visibleMeshCount) {
            root.remove(visualRoot);
            return null;
        }

        const headJoint = this.findRigNode(visualRoot, ['mixamorig:Head', 'head']);
        const leftArmJoint = this.findRigNode(visualRoot, ['mixamorig:LeftArm', 'leftarm']);
        const rightArmJoint = this.findRigNode(visualRoot, ['mixamorig:RightArm', 'rightarm']);
        const leftLegJoint = this.findRigNode(visualRoot, ['mixamorig:LeftUpLeg', 'leftupleg']);
        const rightLegJoint = this.findRigNode(visualRoot, ['mixamorig:RightUpLeg', 'rightupleg']);
        const rightHand = this.findRigNode(visualRoot, ['mixamorig:RightHand', 'righthand']);
        const chestBone = this.findRigNode(visualRoot, ['mixamorig:Spine2', 'spine2', 'spine1', 'spine']);
        const bellyBone = this.findRigNode(visualRoot, ['mixamorig:Spine', 'spine']);

        if (!headJoint || !leftArmJoint || !rightArmJoint || !leftLegJoint || !rightLegJoint) {
            root.remove(visualRoot);
            return null;
        }

        this.createAttachedHitbox(headJoint, new BoxGeometry(0.34, 0.34, 0.34), config.id, GameObjectMaterialEnum.PlayerHead, [0, 0.08, 0]);
        this.createAttachedHitbox(chestBone || headJoint.parent || root, new BoxGeometry(0.54, 0.5, 0.30), config.id, GameObjectMaterialEnum.PlayerChest, [0, 0.04, 0.02]);
        this.createAttachedHitbox(bellyBone || chestBone || headJoint.parent || root, new BoxGeometry(0.48, 0.34, 0.28), config.id, GameObjectMaterialEnum.PlayerBelly, [0, 0.03, 0.02]);
        this.createAttachedHitbox(chestBone || headJoint.parent || root, new BoxGeometry(0.72, 1.08, 0.5), config.id, GameObjectMaterialEnum.PlayerChest, [0, -0.14, 0]);
        this.createAttachedHitbox(leftArmJoint, new BoxGeometry(0.16, 0.42, 0.16), config.id, GameObjectMaterialEnum.PlayerUpperLimb, [0, -0.22, 0]);
        this.createAttachedHitbox(rightArmJoint, new BoxGeometry(0.16, 0.42, 0.16), config.id, GameObjectMaterialEnum.PlayerUpperLimb, [0, -0.22, 0]);
        this.createAttachedHitbox(leftLegJoint, new BoxGeometry(0.2, 0.56, 0.2), config.id, GameObjectMaterialEnum.PlayerLowerLimb, [0, -0.3, 0]);
        this.createAttachedHitbox(rightLegJoint, new BoxGeometry(0.2, 0.56, 0.2), config.id, GameObjectMaterialEnum.PlayerLowerLimb, [0, -0.3, 0]);

        const { weaponMesh, muzzleMesh, weaponMat, muzzleMat } = this.createWeaponVisual(weapon);
        const weaponAnchor = rightHand || rightArmJoint;
        weaponMesh.position.set(-0.02, 0.09, 0.15);
        weaponMesh.rotation.set(0.1, Math.PI, -1.35);
        muzzleMesh.position.set(0.74, 0.01, 0);
        muzzleMesh.visible = false;
        weaponMesh.add(muzzleMesh);
        weaponAnchor.add(weaponMesh);
        this.tagPart(weaponMesh, config.id, GameObjectMaterialEnum.PlayerChest);

        const aimMat = new MeshBasicMaterial({
            color: config.team === 'CT' ? 0x89d0ff : 0xffa377,
            transparent: true,
            opacity: 0.46,
            depthWrite: false,
        });
        const aimTipMat = new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.74,
            depthWrite: false,
        });
        const aimIndicator = new Group();
        aimIndicator.position.set(0, 1.22, 0.08);
        const aimBeam = new Mesh(new BoxGeometry(0.04, 0.04, 1.45), aimMat);
        aimBeam.position.set(0, 0.01, 0.72);
        const aimTip = new Mesh(new BoxGeometry(0.11, 0.11, 0.11), aimTipMat);
        aimTip.position.set(0, 0.01, 1.46);
        aimIndicator.add(aimBeam, aimTip);
        root.add(aimIndicator);

        const teamColor = config.team === 'CT' ? '#89d0ff' : '#ffae9a';
        const nameTag = this.createNameTagSprite(config.name, teamColor);
        nameTag.position.set(0, 2.2, 0);
        root.add(nameTag);

        const shieldSprite = this.createShieldSprite();
        shieldSprite.position.set(0, 1.25, 0);
        shieldSprite.visible = false;
        root.add(shieldSprite);

        const materials = [...tintableMaterials, weaponMat, muzzleMat, aimMat, aimTipMat];
        const baseColors = materials.map(mat => mat.color.getHex());
        const baseOpacities = materials.map(mat => mat.opacity ?? 1);
        const baseTransparent = materials.map(mat => !!mat.transparent);
        return {
            root,
            headJoint,
            leftArmJoint,
            rightArmJoint,
            leftLegJoint,
            rightLegJoint,
            weaponMesh,
            muzzleMesh,
            aimIndicator,
            aimBeam,
            aimTip,
            nameTag,
            shieldSprite,
            materials,
            baseColors,
            baseOpacities,
            baseTransparent,
        };
    }

    private cloneTintableMaterial(material: TintableMaterial | undefined) {
        if (!material?.clone) return material;
        const cloned = material.clone() as TintableMaterial;
        if ('side' in cloned) (cloned as Material & { side?: number }).side = DoubleSide;
        return cloned;
    }

    private findRigNode(root: Object3D, candidates: string[]) {
        for (let i = 0; i < candidates.length; i++) {
            const exact = root.getObjectByName(candidates[i]);
            if (exact) return exact;
        }

        const lowered = candidates.map(value => value.toLowerCase());
        let matched: Object3D | null = null;
        root.traverse((child) => {
            if (matched) return;
            const childName = `${child.name || ''}`.toLowerCase();
            if (!childName) return;
            if (lowered.some(candidate => childName.includes(candidate))) matched = child;
        });
        return matched;
    }

    private getPreviewStyleNodeKey(node: Object3D, root: Object3D) {
        const parts = [];
        let current: Object3D | null = node;
        while (current && current !== root) {
            parts.push(`${current.name || current.type || 'node'}`);
            current = current.parent;
        }
        return parts.reverse().join('/');
    }

    private createPrimitiveRig(config: BotConfig, weapon: WeaponProfile): BotRig {
        const root = new Group();
        root.name = config.name;
        root.visible = false;

        const skinMat = new MeshBasicMaterial({ color: 0xffd4b6 });
        const chestMat = new MeshBasicMaterial({ color: config.team === 'CT' ? 0x3a648e : 0x9d3f33 });
        const bellyMat = new MeshBasicMaterial({ color: config.team === 'CT' ? 0x294869 : 0x6e2b24 });
        const limbMat = new MeshBasicMaterial({ color: 0x3a3a3a });
        const weaponMat = new MeshBasicMaterial({ color: weapon.color });
        const muzzleMat = new MeshBasicMaterial({
            color: 0xf0d75a,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        const aimMat = new MeshBasicMaterial({
            color: config.team === 'CT' ? 0x89d0ff : 0xffa377,
            transparent: true,
            opacity: 0.46,
            depthWrite: false,
        });
        const aimTipMat = new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.74,
            depthWrite: false,
        });
        const teamColor = config.team === 'CT' ? '#89d0ff' : '#ffae9a';
        const materials = [skinMat, chestMat, bellyMat, limbMat, weaponMat, muzzleMat, aimMat, aimTipMat];
        const baseColors = materials.map(mat => mat.color.getHex());
        const baseOpacities = materials.map(mat => mat.opacity ?? 1);
        const baseTransparent = materials.map(mat => !!mat.transparent);

        const headJoint = new Group();
        headJoint.position.set(0, 1.5, 0);
        const head = new Mesh(new BoxGeometry(0.34, 0.34, 0.34), skinMat);
        head.position.set(0, 0.17, 0);
        this.tagPart(head, config.id, GameObjectMaterialEnum.PlayerHead);
        headJoint.add(head);

        const chest = new Mesh(new BoxGeometry(0.54, 0.5, 0.30), chestMat);
        chest.position.set(0, 1.18, 0);
        this.tagPart(chest, config.id, GameObjectMaterialEnum.PlayerChest);

        const belly = new Mesh(new BoxGeometry(0.48, 0.34, 0.28), bellyMat);
        belly.position.set(0, 0.84, 0);
        this.tagPart(belly, config.id, GameObjectMaterialEnum.PlayerBelly);

        const hitboxMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const torsoHitbox = new Mesh(new BoxGeometry(0.72, 1.08, 0.5), hitboxMat);
        torsoHitbox.position.set(0, 1.04, 0);
        this.tagPart(torsoHitbox, config.id, GameObjectMaterialEnum.PlayerChest);

        const leftArmJoint = new Group();
        leftArmJoint.position.set(-0.34, 1.41, 0);
        const leftArm = new Mesh(new BoxGeometry(0.16, 0.42, 0.16), limbMat);
        leftArm.position.set(0, -0.21, 0);
        this.tagPart(leftArm, config.id, GameObjectMaterialEnum.PlayerUpperLimb);
        leftArmJoint.add(leftArm);

        const rightArmJoint = new Group();
        rightArmJoint.position.set(0.34, 1.41, 0);
        const rightArm = new Mesh(new BoxGeometry(0.16, 0.42, 0.16), limbMat);
        rightArm.position.set(0, -0.21, 0);
        this.tagPart(rightArm, config.id, GameObjectMaterialEnum.PlayerUpperLimb);
        rightArmJoint.add(rightArm);

        const leftLegJoint = new Group();
        leftLegJoint.position.set(-0.14, 0.58, 0);
        const leftLeg = new Mesh(new BoxGeometry(0.2, 0.56, 0.2), limbMat);
        leftLeg.position.set(0, -0.28, 0);
        this.tagPart(leftLeg, config.id, GameObjectMaterialEnum.PlayerLowerLimb);
        leftLegJoint.add(leftLeg);

        const rightLegJoint = new Group();
        rightLegJoint.position.set(0.14, 0.58, 0);
        const rightLeg = new Mesh(new BoxGeometry(0.2, 0.56, 0.2), limbMat);
        rightLeg.position.set(0, -0.28, 0);
        this.tagPart(rightLeg, config.id, GameObjectMaterialEnum.PlayerLowerLimb);
        rightLegJoint.add(rightLeg);

        const weaponMesh = new Mesh(new BoxGeometry(0.52, 0.12, 0.14), weaponMat);
        weaponMesh.position.set(0.26, -0.16, -0.2);
        weaponMesh.rotation.y = -0.08;
        this.tagPart(weaponMesh, config.id, GameObjectMaterialEnum.PlayerChest);

        const barrel = new Mesh(new BoxGeometry(0.34, 0.06, 0.06), weaponMat);
        barrel.position.set(0.35, 0.0, 0.0);
        weaponMesh.add(barrel);

        const stock = new Mesh(new BoxGeometry(0.18, 0.1, 0.12), weaponMat);
        stock.position.set(-0.33, 0.0, 0.0);
        weaponMesh.add(stock);

        const frontSight = new Mesh(new BoxGeometry(0.06, 0.08, 0.04), weaponMat);
        frontSight.position.set(0.49, 0.07, 0.0);
        weaponMesh.add(frontSight);

        rightArmJoint.add(weaponMesh);

        const muzzleMesh = new Mesh(new BoxGeometry(0.06, 0.06, 0.06), muzzleMat);
        muzzleMesh.position.set(0.67, -0.16, -0.2);
        muzzleMesh.visible = false;
        rightArmJoint.add(muzzleMesh);

        const aimIndicator = new Group();
        aimIndicator.position.set(0, 1.22, 0.08);
        const aimBeam = new Mesh(new BoxGeometry(0.04, 0.04, 1.45), aimMat);
        aimBeam.position.set(0, 0.01, 0.72);
        const aimTip = new Mesh(new BoxGeometry(0.11, 0.11, 0.11), aimTipMat);
        aimTip.position.set(0, 0.01, 1.46);
        aimIndicator.add(aimBeam, aimTip);
        root.add(aimIndicator);

        const nameTag = this.createNameTagSprite(config.name, teamColor);
        nameTag.position.set(0, 2.2, 0);
        root.add(nameTag);

        const shieldSprite = this.createShieldSprite();
        shieldSprite.position.set(0, 1.25, 0);
        shieldSprite.visible = false;
        root.add(shieldSprite);

        root.add(headJoint, chest, belly, torsoHitbox, leftArmJoint, rightArmJoint, leftLegJoint, rightLegJoint);
        return {
            root,
            headJoint,
            leftArmJoint,
            rightArmJoint,
            leftLegJoint,
            rightLegJoint,
            weaponMesh,
            muzzleMesh,
            aimIndicator,
            aimBeam,
            aimTip,
            nameTag,
            shieldSprite,
            materials,
            baseColors,
            baseOpacities,
            baseTransparent,
        };
    }

    private restoreRigMaterialState(rig: BotRig) {
        for (let i = 0; i < rig.materials.length; i++) {
            const material = rig.materials[i];
            material.transparent = rig.baseTransparent[i];
            material.opacity = rig.baseOpacities[i];
        }
    }

    private createWeaponVisual(weapon: WeaponProfile) {
        const weaponMat = new MeshBasicMaterial({ color: weapon.color });
        const muzzleMat = new MeshBasicMaterial({
            color: 0xf0d75a,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        const weaponMesh = new Mesh(new BoxGeometry(0.52, 0.12, 0.14), weaponMat);
        const barrel = new Mesh(new BoxGeometry(0.34, 0.06, 0.06), weaponMat);
        barrel.position.set(0.35, 0.0, 0.0);
        weaponMesh.add(barrel);

        const stock = new Mesh(new BoxGeometry(0.18, 0.1, 0.12), weaponMat);
        stock.position.set(-0.33, 0.0, 0.0);
        weaponMesh.add(stock);

        const frontSight = new Mesh(new BoxGeometry(0.06, 0.08, 0.04), weaponMat);
        frontSight.position.set(0.49, 0.07, 0.0);
        weaponMesh.add(frontSight);

        const muzzleMesh = new Mesh(new BoxGeometry(0.06, 0.06, 0.06), muzzleMat);
        return { weaponMesh, muzzleMesh, weaponMat, muzzleMat };
    }

    private createAttachedHitbox(parent: Object3D, geometry: BoxGeometry, botId: string, material: GameObjectMaterialEnum, position: [number, number, number]) {
        const hitboxMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const hitbox = new Mesh(geometry, hitboxMat);
        hitbox.position.set(position[0], position[1], position[2]);
        this.tagPart(hitbox, botId, material);
        parent.add(hitbox);
        return hitbox;
    }

    private clearCombatTags(root: Object3D) {
        root.traverse((child: any) => {
            if (!child?.isMesh) return;
            delete child.userData['EnemyBotId'];
            delete child.userData['GameObjectMaterialEnum'];
            this.meshToBotId.delete(child.uuid);
        });
    }

    private clearCorpses() {
        if (!this.corpses.length) return;
        for (let i = 0; i < this.corpses.length; i++) {
            this.scene.remove(this.corpses[i].rig.root);
        }
        this.corpses.length = 0;
    }

    private clearDroppedWeapons() {
        if (!this.droppedWeapons.length) return;
        for (let i = 0; i < this.droppedWeapons.length; i++) {
            this.scene.remove(this.droppedWeapons[i].mesh);
        }
        this.droppedWeapons.length = 0;
    }

    private createDroppedWeaponMesh(weapon: WeaponProfile) {
        const weaponMat = new MeshBasicMaterial({
            color: weapon.color,
            transparent: true,
            opacity: 1,
        });
        const weaponMesh = new Mesh(new BoxGeometry(0.52, 0.12, 0.14), weaponMat);
        const barrel = new Mesh(new BoxGeometry(0.34, 0.06, 0.06), weaponMat.clone());
        barrel.position.set(0.35, 0, 0);
        weaponMesh.add(barrel);
        const stock = new Mesh(new BoxGeometry(0.18, 0.1, 0.12), weaponMat.clone());
        stock.position.set(-0.33, 0, 0);
        weaponMesh.add(stock);
        const sight = new Mesh(new BoxGeometry(0.06, 0.08, 0.04), weaponMat.clone());
        sight.position.set(0.49, 0.07, 0);
        weaponMesh.add(sight);
        return weaponMesh;
    }

    private createDroppedWeaponFromInstance(weaponInstance: WeaponInterface) {
        const entry = getWeaponEntry(`${weaponInstance.weaponId || ''}`);
        const color = entry?.weaponId === 'awp'
            ? 0x514b33
            : entry?.weaponId === 'mp9'
                ? 0x2b3b44
                : entry?.weaponId === 'usp_s'
                    ? 0x51565e
                    : entry?.weaponId === 'm9'
                        ? 0x8a8f97
                        : 0x30353f;
        return this.createDroppedWeaponMesh({
            weaponName: weaponInstance.weaponName,
            baseDamage: 0,
            armorPen: 0,
            rangeModifier: 1,
            burstMin: 1,
            burstMax: 1,
            shotDelay: 0.1,
            burstCooldownMin: 0.1,
            burstCooldownMax: 0.1,
            spreadStanding: 0,
            spreadMoving: 0,
            recoilPerShot: 0,
            recoilRecover: 0,
            color,
        });
    }

    private spawnDroppedWeapon(weaponInstance: WeaponInterface | null | undefined, position: Vector3, yaw: number, launchDir?: Vector3) {
        if (!weaponInstance) return null;
        const slot = mapIventorySlotByWeaponClassficationEnum(weaponInstance.weaponClassificationEnum);
        const mesh = this.createDroppedWeaponFromInstance(weaponInstance);
        mesh.position.copy(position).add(new Vector3(0, 0.16, 0));
        if (launchDir && launchDir.lengthSq() > 0.0001) {
            mesh.position.addScaledVector(launchDir.clone().setY(0).normalize(), 0.24);
        }
        mesh.rotation.set(1.18, yaw, Math.random() * 0.6 - 0.3);
        mesh.userData['DroppedWeapon'] = true;
        mesh.userData['WeaponId'] = weaponInstance.weaponId || weaponInstance.weaponName;
        this.scene.add(mesh);
        const dropped = {
            mesh,
            weaponInstance,
            slot,
            removeAt: GameContext.GameLoop.Clock.getElapsedTime() + DROPPED_WEAPON_LIFETIME_SECONDS,
        };
        this.droppedWeapons.push(dropped);
        return dropped;
    }

    public spawnDebugDroppedWeapon(weaponId: string) {
        const safeWeaponId = `${weaponId || ''}`.trim().toLowerCase();
        if (!safeWeaponId) return null;
        const weapon = createWeaponById(safeWeaponId);
        if (!weapon) return null;
        const camera = GameContext.Cameras.PlayerCamera;
        const forward = this.v1.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        forward.normalize();
        const spawnPos = camera.position.clone().addScaledVector(forward, 1.0);
        spawnPos.y = Math.max(spawnPos.y, camera.position.y - 0.42);
        return this.spawnDroppedWeapon(weapon, spawnPos, camera.rotation.y, forward);
    }

    public spawnTestDummyAhead() {
        const camera = GameContext.Cameras.PlayerCamera;
        const forward = this.v1.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        forward.normalize();
        const spawnPos = camera.position.clone().addScaledVector(forward, 5.0);
        spawnPos.y = Math.max(spawnPos.y, camera.position.y - 1.55);
        const elapsed = GameContext.GameLoop.Clock.getElapsedTime();

        let bot = this.bots.get('test_dummy');
        if (!bot) {
            bot = this.createTestDummyBot();
            this.bots.set(bot.id, bot);
            this.scene.add(bot.rig.root);
        }

        bot.anchorPosition.copy(spawnPos);
        this.respawnTestDummy(bot, elapsed);
        return bot;
    }

    private updateDroppedWeapons(elapsed: number) {
        if (!this.droppedWeapons.length) return;
        const next: DroppedWeaponData[] = [];
        for (let i = 0; i < this.droppedWeapons.length; i++) {
            const item = this.droppedWeapons[i];
            if (elapsed >= item.removeAt) {
                this.scene.remove(item.mesh);
                continue;
            }

            const fade01 = MathUtils.clamp((item.removeAt - elapsed) / 2.2, 0, 1);
            item.mesh.traverse((child: any) => {
                if (!child?.isMesh) return;
                const material = child.material as MeshBasicMaterial;
                material.transparent = true;
                material.opacity = fade01;
            });
            next.push(item);
        }
        this.droppedWeapons = next;
    }

    private tryPickupDroppedWeapon() {
        const movement = this.localPlayer.movementController;
        const inventory = this.localPlayer.inventorySystem;
        if (!movement?.playerCollider || !inventory) return;

        const playerPos = movement.playerCollider.end.clone();
        let bestIndex = -1;
        let bestDistance = DROPPED_WEAPON_PICKUP_DISTANCE;
        for (let i = 0; i < this.droppedWeapons.length; i++) {
            const dist = this.droppedWeapons[i].mesh.position.distanceTo(playerPos);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestIndex = i;
            }
        }
        if (bestIndex < 0) return;

        const picked = this.droppedWeapons.splice(bestIndex, 1)[0];
        this.scene.remove(picked.mesh);
        const replaced = inventory.replaceWeapon(picked.weaponInstance);
        if (replaced?.replaced) {
            this.spawnDroppedWeapon(
                replaced.replaced,
                picked.mesh.position.clone(),
                GameContext.Cameras.PlayerCamera.rotation.y,
            );
        }
    }

    public getFocusedDroppedWeaponInfo(): DroppedWeaponPromptInfo | null {
        const movement = this.localPlayer.movementController;
        if (!movement?.playerCollider || this.localPlayer.health <= 0) return null;

        const camera = GameContext.Cameras.PlayerCamera;
        const origin = camera.position;
        const forward = this.v1.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        let best: DroppedWeaponPromptInfo = null;
        let bestScore = 0.92;

        for (let i = 0; i < this.droppedWeapons.length; i++) {
            const item = this.droppedWeapons[i];
            const toWeapon = this.v2.copy(item.mesh.position).sub(origin);
            const distance = toWeapon.length();
            if (distance > DROPPED_WEAPON_PICKUP_DISTANCE + 0.65) continue;
            toWeapon.normalize();
            const facing = forward.dot(toWeapon);
            if (facing < bestScore) continue;
            bestScore = facing;
            best = {
                weaponName: `${item.weaponInstance.weaponName || item.weaponInstance.weaponId || 'WEAPON'}`,
                distance,
            };
        }

        return best;
    }

    private spawnCorpseFromBot(bot: BotAgent, elapsed: number, impactDir?: Vector3, headshot = false) {
        const corpseRig = this.createRig(
            { id: `corpse_${bot.id}_${Math.floor(elapsed * 1000)}`, name: bot.name, team: bot.team, difficulty: bot.difficulty },
            bot.weapon,
        );
        this.clearCombatTags(corpseRig.root);
        corpseRig.nameTag.visible = false;
        corpseRig.shieldSprite.visible = false;
        corpseRig.aimIndicator.visible = false;
        corpseRig.muzzleMesh.visible = false;
        corpseRig.root.visible = true;
        corpseRig.root.position.copy(bot.rig.root.position);
        corpseRig.root.rotation.copy(bot.rig.root.rotation);
        corpseRig.headJoint.rotation.copy(bot.rig.headJoint.rotation);
        corpseRig.leftArmJoint.rotation.copy(bot.rig.leftArmJoint.rotation);
        corpseRig.rightArmJoint.rotation.copy(bot.rig.rightArmJoint.rotation);
        corpseRig.leftLegJoint.rotation.copy(bot.rig.leftLegJoint.rotation);
        corpseRig.rightLegJoint.rotation.copy(bot.rig.rightLegJoint.rotation);
        corpseRig.weaponMesh.rotation.copy(bot.rig.weaponMesh.rotation);
        corpseRig.weaponMesh.position.copy(bot.rig.weaponMesh.position);
        corpseRig.root.userData['Corpse'] = true;
        this.scene.add(corpseRig.root);
        const launchDir = (impactDir && impactDir.lengthSq() > 0.0001)
            ? impactDir.clone().setY(0).normalize().multiplyScalar(-1)
            : new Vector3(Math.sin(bot.rig.root.rotation.y), 0, Math.cos(bot.rig.root.rotation.y)).multiplyScalar(-1);
        this.spawnDroppedWeapon(bot.weaponInstance, bot.rig.root.position.clone(), bot.rig.root.rotation.y, launchDir);
        this.corpses.push({
            rig: corpseRig,
            spawnedAt: elapsed,
            removeAt: elapsed + getRuntimeTuningSnapshot().effects.corpseLifetimeSeconds,
            initialPosition: bot.rig.root.position.clone(),
            initialYaw: bot.rig.root.rotation.y,
            fallSide: Math.random() < 0.5 ? -1 : 1,
            isPlayer: false,
            headshot,
            launchDir,
            launchDistance: headshot ? 0.9 : 0.46,
            settleDrop: headshot ? 0.22 : 0.12,
            droppedWeapon: null,
        });
    }

    private spawnPlayerCorpse(elapsed: number, impactDir?: Vector3, headshot = false) {
        const yaw = GameContext.Cameras.PlayerCamera.rotation.y;
        const weapon = this.localPlayer.inventorySystem?.currentWeapon
            ? this.pickWeapon(PLAYER_TEAM, 'NORMAL')
            : WEAPONS.M4A1S;
        const corpseRig = this.createRig(
            { id: `corpse_player_${Math.floor(elapsed * 1000)}`, name: 'YOU', team: PLAYER_TEAM, difficulty: 'NORMAL' },
            weapon,
        );
        this.clearCombatTags(corpseRig.root);
        corpseRig.nameTag.visible = false;
        corpseRig.shieldSprite.visible = false;
        corpseRig.aimIndicator.visible = false;
        corpseRig.muzzleMesh.visible = false;
        corpseRig.root.visible = true;
        corpseRig.root.position.copy(this.playerDeathPos).add(new Vector3(0, -PLAYER_STANDING_END_OFFSET + 0.1, 0));
        corpseRig.root.rotation.set(0, yaw, 0);
        corpseRig.root.userData['Corpse'] = true;
        this.scene.add(corpseRig.root);
        const launchDir = (impactDir && impactDir.lengthSq() > 0.0001)
            ? impactDir.clone().setY(0).normalize().multiplyScalar(-1)
            : new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-1);
        this.spawnDroppedWeapon(cloneWeaponInstanceWithAmmo(this.localPlayer.inventorySystem?.currentWeapon), corpseRig.root.position.clone(), yaw, launchDir);
        this.corpses.push({
            rig: corpseRig,
            spawnedAt: elapsed,
            removeAt: elapsed + getRuntimeTuningSnapshot().effects.corpseLifetimeSeconds,
            initialPosition: corpseRig.root.position.clone(),
            initialYaw: yaw,
            fallSide: Math.random() < 0.5 ? -1 : 1,
            isPlayer: true,
            headshot,
            launchDir,
            launchDistance: headshot ? 0.78 : 0.4,
            settleDrop: headshot ? 0.2 : 0.1,
            droppedWeapon: null,
        });
    }

    private updateCorpses(elapsed: number) {
        if (!this.corpses.length) return;
        const next: CorpseData[] = [];
        for (let i = 0; i < this.corpses.length; i++) {
            const corpse = this.corpses[i];
            if (elapsed >= corpse.removeAt) {
                this.scene.remove(corpse.rig.root);
                continue;
            }

            const fallT = MathUtils.clamp((elapsed - corpse.spawnedAt) / CORPSE_FALL_DURATION_SECONDS, 0, 1);
            const fallEase = 1 - Math.pow(1 - fallT, 3);
            const arc = Math.sin(fallT * Math.PI) * (corpse.headshot ? 0.18 : 0.08);

            corpse.rig.root.position.copy(corpse.initialPosition);
            corpse.rig.root.position.addScaledVector(corpse.launchDir, corpse.launchDistance * fallEase);
            corpse.rig.root.position.y += arc - fallEase * (0.08 + corpse.settleDrop);
            corpse.rig.root.rotation.set(
                corpse.headshot ? -0.48 * fallEase : 0.18 * fallEase,
                corpse.initialYaw + corpse.fallSide * (corpse.headshot ? 0.28 : 0.12) * fallEase,
                corpse.fallSide * (corpse.headshot ? 1.46 : 1.02) * fallEase,
            );
            corpse.rig.headJoint.rotation.x = corpse.headshot ? -1.48 * fallEase : -0.96 * fallEase;
            corpse.rig.headJoint.rotation.z = corpse.fallSide * (corpse.headshot ? 0.72 : 0.38) * fallEase;
            corpse.rig.leftArmJoint.rotation.x = -0.32 - (corpse.headshot ? 1.72 : 1.16) * fallEase;
            corpse.rig.leftArmJoint.rotation.z = corpse.fallSide * 0.86 * fallEase;
            corpse.rig.rightArmJoint.rotation.x = -0.54 - (corpse.headshot ? 1.94 : 1.32) * fallEase;
            corpse.rig.rightArmJoint.rotation.z = corpse.fallSide * -0.58 * fallEase;
            corpse.rig.leftLegJoint.rotation.x = 0.18 + (corpse.headshot ? 1.08 : 0.72) * fallEase;
            corpse.rig.leftLegJoint.rotation.z = corpse.fallSide * 0.34 * fallEase;
            corpse.rig.rightLegJoint.rotation.x = -0.16 - (corpse.headshot ? 0.9 : 0.42) * fallEase;
            corpse.rig.rightLegJoint.rotation.z = corpse.fallSide * -0.26 * fallEase;
            corpse.rig.weaponMesh.rotation.x = 0.18 + (corpse.headshot ? 1.2 : 0.86) * fallEase;
            corpse.rig.weaponMesh.rotation.y = -0.08 - corpse.fallSide * 0.3 * fallEase;
            corpse.rig.weaponMesh.rotation.z = corpse.fallSide * (corpse.headshot ? 0.74 : 0.46) * fallEase;
            corpse.rig.weaponMesh.position.set(0.18, -0.08 + 0.02 * (1 - fallEase), -0.1);
            const groundPoint = this.sampleGroundPoint(
                corpse.rig.root.position.x,
                corpse.rig.root.position.z,
                this.navBounds.isEmpty() ? corpse.initialPosition.y + 10 : this.navBounds.max.y + 10,
                this.navBounds.isEmpty() ? corpse.initialPosition.y - 10 : this.navBounds.min.y - 10,
            );
            if (groundPoint) {
                corpse.rig.root.position.y = Math.max(groundPoint.y + 0.03, corpse.rig.root.position.y);
            } else {
                corpse.rig.root.position.y = Math.max(corpse.initialPosition.y - 0.04, corpse.rig.root.position.y);
            }

            const fade01 = MathUtils.clamp((corpse.removeAt - elapsed) / Math.max(0.05, getRuntimeTuningSnapshot().effects.corpseFadeSeconds), 0, 1);
            for (let m = 0; m < corpse.rig.materials.length; m++) {
                corpse.rig.materials[m].transparent = true;
                corpse.rig.materials[m].opacity = fade01;
            }

            next.push(corpse);
        }
        this.corpses = next;
    }

    private createNameTagSprite(name: string, colorHex: string) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(10, 16, 25, 0.65)';
            ctx.fillRect(6, 10, 244, 44);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.lineWidth = 2;
            ctx.strokeRect(6, 10, 244, 44);
            ctx.font = '700 24px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = colorHex;
            ctx.fillText(name, 128, 32);
        }
        const texture = new CanvasTexture(canvas);
        texture.needsUpdate = true;
        const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true });
        const sprite = new Sprite(material);
        sprite.scale.set(1.75, 0.42, 1);
        return sprite;
    }

    private createShieldSprite() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
            grad.addColorStop(0, 'rgba(130, 210, 255, 0.72)');
            grad.addColorStop(0.55, 'rgba(94, 184, 255, 0.26)');
            grad.addColorStop(1, 'rgba(94, 184, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(64, 64, 62, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(146, 220, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(64, 64, 48, 0, Math.PI * 2);
            ctx.stroke();
        }
        const texture = new CanvasTexture(canvas);
        texture.needsUpdate = true;
        const material = new SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: DoubleSide,
        });
        const sprite = new Sprite(material);
        sprite.scale.set(1.8, 1.8, 1);
        return sprite;
    }

    private tagPart(mesh: Mesh, botId: string, material: GameObjectMaterialEnum) {
        mesh.userData['GameObjectMaterialEnum'] = material;
        mesh.userData['EnemyBotId'] = botId;
        this.meshToBotId.set(mesh.uuid, botId);
    }

    private resolveBotId(hitObject: Object3D): string | undefined {
        const tagged = hitObject.userData['EnemyBotId'];
        if (typeof tagged === 'string') return tagged;
        return this.meshToBotId.get(hitObject.uuid);
    }

    private normalizeWeaponName(raw: string) {
        const compact = `${raw || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (compact === 'm4a1s' || compact === 'm4a1') return 'm4a1_s';
        if (compact === 'ak47') return 'ak47';
        if (compact === 'sg553') return 'sg553';
        if (compact === 'aug') return 'aug';
        if (compact === 'awp') return 'awp';
        if (compact === 'glock18') return 'glock18';
        if (compact === 'deagle' || compact === 'deserteagle') return 'deagle';
        if (compact === 'mac10') return 'mac10';
        if (compact === 'mp9') return 'mp9';
        if (compact === 'p90') return 'p90';
        if (compact === 'usp' || compact === 'usps') return 'usp_s';
        if (compact === 'xm1014') return 'xm1014';
        if (compact === 'negev') return 'negev';
        if (compact === 'nova') return 'nova';
        if (compact === 'm9' || compact === 'knife' || compact.includes('m9') || compact.includes('knife')) return 'm9';
        return 'default';
    }

    private calculateDamage(
        weaponName: string,
        part: GameObjectMaterialEnum,
        distanceWorld: number,
        targetArmor: number,
        targetHasHelmet: boolean,
    ): DamageBreakdown {
        const hitgroup = toHitgroupFromPart(part) as HitgroupName;
        return computeDamageBreakdown(
            this.normalizeWeaponName(weaponName),
            hitgroup,
            distanceWorld,
            targetArmor,
            targetHasHelmet,
        );
    }

    private startRound(elapsed: number) {
        this.intermissionActive = false;
        this.roundPhase = 'live';
        this.phaseEndsAt = 0;
        this.roundNumber += 1;
        this.playerRespawnAt = -1;
        this.lastKillerName = '';
        this.lastKillerBotId = '';
        this.clearDroppedWeapons();
        this.respawnPlayer();
        this.respawnBots(elapsed);
    }

    private updateRoundPhase(elapsed: number) {
        if (this.roundPhase !== 'live') this.roundPhase = 'live';
    }

    private tickBots(dt: number, elapsed: number) {
        this.bots.forEach(bot => {
            if (bot.isTestDummy) {
                if (!bot.alive) {
                    if (elapsed >= bot.respawnAt) this.respawnTestDummy(bot, elapsed);
                    return;
                }
                bot.velocity.set(0, 0, 0);
                bot.path = [];
                bot.pathCursor = 0;
                bot.intent = 'ANCHOR';
                bot.kick = Math.max(0, bot.kick - dt * 3.5);
                this.animateBot(bot, dt, elapsed, bot.rig.root.position);
                return;
            }
            if (!this.isRuntimeBotActive(bot)) {
                this.deactivateBot(bot);
                return;
            }
            if (!bot.alive) {
                if (elapsed >= bot.respawnAt) this.respawnBot(bot, elapsed);
                return;
            }
            const target = this.findTarget(bot);
            if (!target) {
                this.simulateIdle(bot, dt, elapsed);
                return;
            }

            const distance = bot.rig.root.position.distanceTo(target.position);
            const canSee = this.hasLineOfSight(bot.rig.root.position, target.position);
            if (canSee) {
                bot.lastSeenAt = elapsed;
                bot.lastSeenPos.copy(target.position);
            }

            if (elapsed >= bot.nextDecisionAt) this.decideIntent(bot, target, canSee, distance, elapsed);

            const runtimeProfile = this.getBotRuntimeProfile(bot);
            if (canSee) {
                const lockGain = (0.75 + (bot.profile.tracking * runtimeProfile.trackingMul) * 0.9) * runtimeProfile.aimLockMul * dt;
                bot.aimLock = Math.min(1, bot.aimLock + lockGain);
            } else {
                bot.aimLock = Math.max(0, bot.aimLock - dt * 1.65);
            }

            this.moveBot(bot, target, canSee, distance, dt, elapsed);
            if (this.roundPhase === 'live' && this.matchEnabled) this.fireBot(bot, target, canSee, distance, dt, elapsed);

            this.animateBot(bot, dt, elapsed, target.position);
            this.updateStuck(bot, dt);
            this.keepBotInsideMap(bot, elapsed);
        });
    }

    private simulateIdle(bot: BotAgent, dt: number, elapsed: number) {
        const friction = Math.max(0, 1 - BOT_GROUND_FRICTION * dt);
        bot.velocity.x *= friction;
        bot.velocity.z *= friction;
        bot.aimLock = Math.max(0, bot.aimLock - dt * 2.4);
        this.integratePhysics(bot, dt, elapsed);
        this.animateBot(bot, dt, elapsed, bot.rig.root.position);
    }

    private findTarget(bot: BotAgent): TargetInfo | null {
        let bestScore = -Infinity;
        let best: TargetInfo = null;
        const elapsed = GameContext.GameLoop.Clock.getElapsedTime();

        this.bots.forEach(other => {
            if (!other.alive || other.id === bot.id) return;
            if (!this.isRuntimeBotActive(other)) return;
            if (elapsed < other.spawnProtectedUntil) return;
            const dist = bot.rig.root.position.distanceTo(other.rig.root.position);
            const los = this.hasLineOfSight(bot.rig.root.position, other.rig.root.position);
            let score = -dist * 0.95;
            if (los) score += 10.5;
            if (other.hp < 40) score += 2.2;
            if (score > bestScore) {
                bestScore = score;
                best = { kind: 'bot', name: other.name, team: other.team, position: other.rig.root.position, bot: other };
            }
        });

        if (this.localPlayer.health > 0 && !this.isPlayerSpawnProtected(elapsed)) {
            const playerPos = this.getPlayerTargetPosition();
            const dist = bot.rig.root.position.distanceTo(playerPos);
            const los = this.hasLineOfSight(bot.rig.root.position, playerPos);
            let score = -dist + 5.5;
            if (los) score += 14.5;
            if (this.localPlayer.health < 35) score += 2.4;
            if (score > bestScore) best = { kind: 'player', name: 'YOU', team: PLAYER_TEAM, position: playerPos };
        }

        return best;
    }

    private decideIntent(bot: BotAgent, target: TargetInfo, canSee: boolean, distance: number, elapsed: number) {
        const runtime = this.getBotRuntimeProfile(bot);
        const bravery = MathUtils.clamp(bot.profile.bravery * runtime.aggression / Math.max(0.35, runtime.defense), 0.08, 0.95);
        const engageMin = bot.profile.engageMin * MathUtils.lerp(1.18, 0.88, runtime.aggression - 0.5);
        const engageMax = bot.profile.engageMax * MathUtils.lerp(0.9, 1.18, runtime.aggression - 0.5);
        if (!canSee && elapsed - bot.lastSeenAt > 1.9) bot.intent = 'PUSH';
        else if (distance < engageMin * (1.04 + (1 - bravery) * 0.28)) bot.intent = 'RETREAT';
        else if (distance > engageMax * (1.02 + (1 - bravery) * 0.22)) bot.intent = 'PUSH';
        else if (Math.random() < 0.06 + bravery * 0.06 + runtime.tactical * 0.05) bot.intent = 'FLANK';
        else bot.intent = canSee ? 'ANCHOR' : 'PUSH';

        const node = this.selectGoalNode(bot, target);
        if (node !== -1) bot.targetNode = node;

        bot.nextDecisionAt = elapsed + MathUtils.randFloat(0.44, 1.08) / Math.max(0.35, runtime.tactical);
    }

    private selectGoalNode(bot: BotAgent, target: TargetInfo) {
        if (!this.navNodes.length) return -1;
        const ref = bot.rig.root.position;
        const goal = target.position;
        const maxDistSq = bot.intent === 'PUSH' ? 28 * 28 : 20 * 20;

        const candidates: { idx: number; d2: number }[] = [];
        for (let i = 0; i < this.navNodes.length; i++) {
            const d2 = this.navNodes[i].distanceToSquared(ref);
            if (d2 <= maxDistSq) candidates.push({ idx: i, d2 });
        }
        if (!candidates.length) return this.findNearestNode(ref);
        candidates.sort((a, b) => a.d2 - b.d2);

        const preferred = (bot.profile.engageMin + bot.profile.engageMax) * 0.5;
        let bestIdx = -1;
        let bestScore = -Infinity;

        for (let i = 0; i < Math.min(48, candidates.length); i++) {
            const idx = candidates[i].idx;
            const node = this.navNodes[idx];
            const dBot = Math.sqrt(candidates[i].d2);
            const dTarget = node.distanceTo(goal);
            const nodeLos = this.hasLineOfSight(node, goal);
            let score = 0;

            if (bot.intent === 'PUSH') {
                score += Math.max(0, 30 - dTarget) * 2.2;
                if (nodeLos) score += 5;
                score -= dBot * 0.6;
            } else if (bot.intent === 'ANCHOR') {
                score += 16 - Math.abs(dTarget - preferred);
                score += nodeLos ? 8 : -7;
                score -= dBot * 0.55;
            } else if (bot.intent === 'RETREAT') {
                score += Math.min(36, dTarget) * 1.35;
                score += !nodeLos ? 10 : -5;
                score -= dBot * 0.35;
            } else {
                this.v1.copy(goal).sub(ref).setY(0);
                this.v2.copy(node).sub(ref).setY(0);
                if (this.v1.lengthSq() > 0.0001 && this.v2.lengthSq() > 0.0001) {
                    this.v1.normalize();
                    this.v2.normalize();
                    score += Math.abs(this.v1.cross(this.v2).y) * 18;
                }
                score += nodeLos ? 6 : -2;
                score += 12 - Math.abs(dTarget - preferred * 0.9);
                score -= dBot * 0.45;
            }

            score += this.getDust2RouteBias(node);

            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        }
        return bestIdx;
    }

    private moveBot(bot: BotAgent, target: TargetInfo, canSee: boolean, distance: number, dt: number, elapsed: number) {
        if (bot.currentNode < 0 || bot.currentNode >= this.navNodes.length) bot.currentNode = this.findNearestNode(bot.rig.root.position);

        const pursuit = (!canSee && elapsed - bot.lastSeenAt <= 2.5) ? bot.lastSeenPos : target.position;
        const pursuitNode = this.findNearestNode(pursuit);

        const needRepath = (
            !bot.path.length ||
            bot.pathCursor >= bot.path.length ||
            bot.targetNode < 0 ||
            elapsed >= bot.nextRepathAt ||
            pursuitNode !== bot.targetNode
        );

        if (needRepath) {
            if (bot.targetNode < 0) bot.targetNode = pursuitNode;
            bot.path = this.findPath(bot.currentNode, bot.targetNode);
            bot.pathCursor = bot.path.length > 1 ? 1 : 0;
            bot.nextRepathAt = elapsed + NAV_REPATH_INTERVAL;
        }

        const desired = this.computeDesiredVelocity(bot, distance);
        desired.add(this.computeSeparation(bot));
        this.smoothVelocity(bot, desired, dt);
        this.integratePhysics(bot, dt, elapsed);
        this.turnBot(bot, target.position, dt);

        if (bot.path.length && bot.pathCursor < bot.path.length) {
            const node = this.navNodes[bot.path[bot.pathCursor]];
            if (bot.rig.root.position.distanceToSquared(node) < 0.45 * 0.45) {
                bot.currentNode = bot.path[bot.pathCursor];
                bot.pathCursor += 1;
            }
        }
    }

    private computeDesiredVelocity(bot: BotAgent, distance: number) {
        const desired = this.v1.set(0, 0, 0);
        if (!bot.path.length || bot.pathCursor >= bot.path.length) return desired;

        const nextNode = this.navNodes[bot.path[bot.pathCursor]];
        desired.copy(nextNode).sub(bot.rig.root.position).setY(0);
        const len = desired.length();
        if (len <= 0.01) return this.v1.set(0, 0, 0);
        desired.multiplyScalar(1 / len);

        let scale = 1;
        if (bot.intent === 'RETREAT') scale = 1.12;
        if (bot.intent === 'ANCHOR' && distance <= bot.profile.engageMax * 0.85) scale = 0.75;
        if (bot.intent === 'FLANK') {
            const strafe = Math.sin(performance.now() * 0.003 + bot.strafePhase) * 0.35;
            this.v2.set(-desired.z, 0, desired.x).multiplyScalar(strafe);
            desired.add(this.v2).normalize();
            scale = 0.95;
        }
        return desired.multiplyScalar(bot.profile.moveSpeed * scale);
    }

    private computeSeparation(bot: BotAgent) {
        const sep = this.v2.set(0, 0, 0);
        this.bots.forEach(other => {
            if (!other.alive || other.id === bot.id) return;
            this.v3.copy(bot.rig.root.position).sub(other.rig.root.position).setY(0);
            const d2 = this.v3.lengthSq();
            if (d2 <= 0.0001 || d2 > BOT_SEPARATION_RADIUS * BOT_SEPARATION_RADIUS) return;
            sep.addScaledVector(this.v3.normalize(), 1 / Math.max(0.15, d2));
        });
        return sep.multiplyScalar(BOT_SEPARATION_FORCE);
    }

    private smoothVelocity(bot: BotAgent, desired: Vector3, dt: number) {
        const blend = Math.min(1, bot.profile.acceleration * dt);
        bot.velocity.x += (desired.x - bot.velocity.x) * blend;
        bot.velocity.z += (desired.z - bot.velocity.z) * blend;

        if (bot.onFloor && desired.lengthSq() < 0.02) {
            const friction = Math.max(0, 1 - BOT_GROUND_FRICTION * dt);
            bot.velocity.x *= friction;
            bot.velocity.z *= friction;
        }
        bot.speed = Math.sqrt(bot.velocity.x * bot.velocity.x + bot.velocity.z * bot.velocity.z);
    }

    private integratePhysics(bot: BotAgent, dt: number, elapsed: number) {
        if (!bot.onFloor) bot.velocity.y = Math.max(-BOT_MAX_FALL_SPEED, bot.velocity.y - BOT_GRAVITY * dt);
        else if (bot.velocity.y < 0) bot.velocity.y = 0;

        this.v1.copy(bot.velocity).multiplyScalar(dt);
        bot.collider.translate(this.v1);

        bot.onFloor = false;
        const result = this.worldOctree ? this.worldOctree.capsuleIntersect(bot.collider) : null;
        if (result) {
            bot.onFloor = result.normal.y > 0;
            if (!bot.onFloor) bot.velocity.addScaledVector(result.normal, -result.normal.dot(bot.velocity));
            else if (bot.velocity.y < 0) bot.velocity.y = 0;
            bot.collider.translate(result.normal.multiplyScalar(result.depth + 0.001));
        }

        bot.rig.root.position.set(bot.collider.start.x, bot.collider.start.y - BOT_COLLIDER_RADIUS, bot.collider.start.z);
        const tuning = getRuntimeTuningSnapshot();
        bot.recoil = Math.max(0, bot.recoil - (bot.weapon.recoilRecover / Math.max(0.1, tuning.weapons[`${bot.weaponInstance.weaponId || ''}`]?.recoilMultiplier || 1)) * dt);
        bot.kick = Math.max(0, bot.kick - 3.8 * dt);
        bot.hitGlowStrength = Math.max(0, bot.hitGlowStrength - dt * tuning.effects.botGlowDecay);

        if (!bot.onFloor && bot.rig.root.position.y < -22) this.forceRespawn(bot, elapsed);
    }

    private turnBot(bot: BotAgent, targetPos: Vector3, dt: number) {
        const tuning = this.getBotRuntimeProfile(bot);
        this.v1.copy(targetPos).sub(bot.rig.root.position).setY(0);
        if (this.v1.lengthSq() < 0.0001) return;
        const desiredYaw = Math.atan2(this.v1.x, this.v1.z);
        const currentYaw = bot.rig.root.rotation.y;
        const delta = Math.atan2(Math.sin(desiredYaw - currentYaw), Math.cos(desiredYaw - currentYaw));
        const speed01 = MathUtils.clamp(bot.speed / Math.max(0.001, bot.profile.moveSpeed), 0, 1);
        const maxTurnRate = bot.profile.turnSpeed * tuning.turnSpeedMul * MathUtils.lerp(0.72, 1.15, 1 - speed01);
        const clampedDelta = MathUtils.clamp(delta, -maxTurnRate * dt, maxTurnRate * dt);
        bot.rig.root.rotation.y = currentYaw + clampedDelta;
    }

    private fireBot(bot: BotAgent, target: TargetInfo, canSee: boolean, distance: number, dt: number, elapsed: number) {
        const runtime = getRuntimeTuningSnapshot();
        const botTune = this.getBotRuntimeProfile(bot);
        const weaponTune = runtime.weapons[`${bot.weaponInstance.weaponId || ''}`] || runtime.weapons.ak47;
        const preset = getBotWeaponPreset(`${bot.weaponInstance.weaponId || bot.weapon.weaponName || 'ak47'}`);
        const wp = {
            ...bot.weapon,
            burstMin: Math.max(1, Math.round(preset.burstMin * botTune.burstMul)),
            burstMax: Math.max(1, Math.round(preset.burstMax * botTune.burstMul)),
            shotDelay: preset.shotDelay * botTune.reactionMul,
            burstCooldownMin: preset.burstCooldownMin * botTune.cooldownMul,
            burstCooldownMax: preset.burstCooldownMax * botTune.cooldownMul,
            spreadStanding: preset.spreadStanding * botTune.spreadMul * weaponTune.spreadMultiplier,
            spreadMoving: preset.spreadMoving * botTune.spreadMul * weaponTune.spreadMultiplier,
            recoilPerShot: preset.recoilPerShot * weaponTune.recoilMultiplier,
            recoilRecover: preset.recoilRecover / Math.max(0.1, weaponTune.recoilMultiplier),
        };
        if (!canSee || distance > bot.profile.engageMax) {
            bot.burstShotsLeft = 0;
            return;
        }

        this.v1.copy(target.position).sub(bot.rig.root.position).setY(0);
        if (this.v1.lengthSq() <= 0.0001) return;
        this.v1.normalize();
        this.v2.set(Math.sin(bot.rig.root.rotation.y), 0, Math.cos(bot.rig.root.rotation.y)).normalize();
        const facing01 = MathUtils.clamp((this.v1.dot(this.v2) + 1) * 0.5, 0, 1);
        if (facing01 < 0.24) return;
        const tracking = bot.profile.tracking * botTune.trackingMul;
        const aggression = botTune.aggression;
        const defense = botTune.defense;
        const requiredLock = (0.2 + (1 - tracking) * 0.14) / Math.max(0.2, botTune.aimLockMul);
        if (bot.aimLock < requiredLock) return;

        if (elapsed < bot.nextBurstAt) return;

        if (bot.burstShotsLeft <= 0) {
            bot.burstShotsLeft = MathUtils.randInt(
                Math.max(1, wp.burstMin - 1),
                Math.max(Math.max(1, wp.burstMin - 1), wp.burstMax - 1),
            );
            bot.nextShotAt = Math.max(elapsed, bot.nextShotAt) + (bot.profile.reactionSeconds * botTune.reactionMul) * MathUtils.randFloat(0.42, 0.7);
        }
        if (elapsed < bot.nextShotAt) return;

        bot.nextShotAt = elapsed + wp.shotDelay;
        bot.burstShotsLeft = Math.max(0, bot.burstShotsLeft - 1);
        if (bot.burstShotsLeft === 0) {
            bot.nextBurstAt = elapsed + MathUtils.randFloat(wp.burstCooldownMin * 1.25, wp.burstCooldownMax * 1.55);
        }

        bot.recoil = Math.min(1.4, bot.recoil + wp.recoilPerShot);
        bot.kick = Math.min(1.0, bot.kick + 0.45);
        bot.muzzleUntil = elapsed + 0.045;

        const moveFactor = MathUtils.clamp(bot.speed / Math.max(0.001, bot.profile.moveSpeed), 0, 1);
        if (moveFactor > 0.34 && distance > bot.profile.engageMin * 0.9) {
            bot.nextShotAt += 0.04 + moveFactor * 0.05;
            return;
        }
        const effectiveEngageMin = bot.profile.engageMin * MathUtils.lerp(0.92, 1.08, defense - 0.5);
        const effectiveEngageMax = bot.profile.engageMax * MathUtils.lerp(0.88, 1.18, aggression - 0.5);
        const spread = wp.spreadStanding + moveFactor * wp.spreadMoving + bot.recoil;
        const rangePenalty = MathUtils.clamp((distance - effectiveEngageMin) / Math.max(1, effectiveEngageMax), 0, 1);
        const strafePenalty = MathUtils.clamp(Math.abs(Math.sin(bot.strafePhase + elapsed * 2.2)) * 0.08, 0, 0.08);
        let hitChance = 0.03 + (tracking * 0.42);
        hitChance += facing01 * 0.08;
        hitChance += bot.aimLock * 0.14;
        hitChance -= spread * 0.58;
        hitChance -= rangePenalty * 0.34;
        hitChance -= strafePenalty;
        if (target.kind === 'player' && distance <= 7) hitChance += 0.015;
        if (moveFactor > 0.22) hitChance -= 0.1;
        if (bot.intent === 'RETREAT') hitChance -= 0.08 * defense;
        hitChance = MathUtils.clamp(hitChance * botTune.hitChanceMul, 0.025, 0.56);
        if (Math.random() > hitChance) return;

        const hsChance = MathUtils.clamp(0.008 + tracking * 0.05 + bot.aimLock * 0.04 + facing01 * 0.025 - spread * 0.22, 0.003, 0.1);
        const headshot = Math.random() < hsChance;
        const part = headshot
            ? GameObjectMaterialEnum.PlayerHead
            : (Math.random() < 0.2 ? GameObjectMaterialEnum.PlayerBelly : (Math.random() < 0.16 ? GameObjectMaterialEnum.PlayerLowerLimb : GameObjectMaterialEnum.PlayerChest));
        const damage = this.calculateDamage(
            wp.weaponName,
            part,
            distance,
            this.localPlayer.armor,
            this.localPlayer.hasHelmet,
        );
        bot.aimLock = Math.max(0, bot.aimLock - (0.06 + dt * 0.22));

        if (target.kind === 'player') {
            this.applyDamageToPlayer(damage, bot, wp.weaponName, headshot);
            return;
        }

        if (!target.bot) return;
        if (elapsed < target.bot.spawnProtectedUntil) return;
        const botDamage = this.calculateDamage(wp.weaponName, part, distance, target.bot.armor, target.bot.hasHelmet);
        const impactDir = this.v1.copy(target.position).sub(bot.rig.root.position).setY(0).normalize();
        const killed = this.applyDamageToBot(target.bot, botDamage, elapsed, headshot, impactDir);
        if (killed) {
            KillFeedEvent.detail.killerName = bot.name;
            KillFeedEvent.detail.victimName = target.name;
            KillFeedEvent.detail.weaponName = wp.weaponName;
            KillFeedEvent.detail.headshot = headshot;
            GameLogicEventPipe.dispatchEvent(KillFeedEvent);
        }
    }

    private applyDamageToPlayer(damage: DamageBreakdown, attackerBot: BotAgent, weaponName: string, headshot: boolean) {
        if (this.intermissionActive) return;
        if (this.localPlayer.health <= 0 || this.roundPhase !== 'live' || !this.matchEnabled) return;
        if (this.isPlayerSpawnProtected(GameContext.GameLoop.Clock.getElapsedTime())) return;
        const killerName = attackerBot?.name || 'BOT';
        const hpDamage = Math.max(1, damage.healthDamage);
        if (damage.armorDamage > 0) {
            this.localPlayer.armor = Math.max(0, this.localPlayer.armor - damage.armorDamage);
            if (this.localPlayer.armor <= 0) this.localPlayer.hasHelmet = false;
        }

        const before = this.localPlayer.health;
        this.localPlayer.health = Math.max(0, this.localPlayer.health - hpDamage);

        PlayerDamagedEvent.detail.damage = hpDamage;
        PlayerDamagedEvent.detail.armorDamage = Math.max(0, damage.armorDamage);
        PlayerDamagedEvent.detail.health = this.localPlayer.health;
        PlayerDamagedEvent.detail.armor = this.localPlayer.armor;
        PlayerDamagedEvent.detail.headshot = headshot;
        PlayerDamagedEvent.detail.attackerName = killerName;
        PlayerDamagedEvent.detail.attackerX = attackerBot?.rig?.root?.position?.x || 0;
        PlayerDamagedEvent.detail.attackerY = attackerBot?.rig?.root?.position?.y || 0;
        PlayerDamagedEvent.detail.attackerZ = attackerBot?.rig?.root?.position?.z || 0;
        GameLogicEventPipe.dispatchEvent(PlayerDamagedEvent);

        if (before > 0 && this.localPlayer.health <= 0) {
            this.playerSpawnProtectedUntil = 0;
            this.localPlayer.armor = 0;
            this.localPlayer.hasHelmet = false;
            this.localPlayer.deaths += 1;
            this.playerDeathPos.copy(this.getPlayerTargetPosition());
            const now = GameContext.GameLoop.Clock.getElapsedTime();
            this.v1.copy(attackerBot?.rig?.root?.position || this.playerDeathPos).sub(this.playerDeathPos).setY(0);
            this.spawnPlayerCorpse(now, this.v1, headshot);
            this.playerRespawnAt = now + PLAYER_RESPAWN_SECONDS;
            this.lastKillerName = killerName;
            const killerBot = this.findBotByName(killerName);
            this.lastKillerBotId = killerBot ? killerBot.id : '';
            if (this.localPlayer.movementController) this.localPlayer.movementController.clearInputState();

            PlayerDiedEvent.detail.killerName = killerName;
            PlayerDiedEvent.detail.weaponName = weaponName;
            PlayerDiedEvent.detail.headshot = headshot;
            PlayerDiedEvent.detail.respawnAt = this.playerRespawnAt;
            PlayerDiedEvent.detail.respawnSeconds = PLAYER_RESPAWN_SECONDS;
            GameLogicEventPipe.dispatchEvent(PlayerDiedEvent);

            KillFeedEvent.detail.killerName = killerName;
            KillFeedEvent.detail.victimName = 'YOU';
            KillFeedEvent.detail.weaponName = weaponName;
            KillFeedEvent.detail.headshot = headshot;
            GameLogicEventPipe.dispatchEvent(KillFeedEvent);
        }
    }

    private applyDamageToBot(bot: BotAgent, damage: DamageBreakdown, elapsed: number, headshot = false, impactDir?: Vector3) {
        if (!bot.alive) return false;
        const fx = getRuntimeTuningSnapshot().effects;
        bot.hitGlowUntil = elapsed + fx.botGlowDuration;
        bot.hitGlowStrength = Math.min(1.6, bot.hitGlowStrength + ((headshot ? 1 : 0.72) * fx.botGlowIntensity));
        if (damage.armorDamage > 0) {
            bot.armor = Math.max(0, bot.armor - damage.armorDamage);
            if (bot.armor <= 0) bot.hasHelmet = false;
        }

        bot.hp -= Math.max(1, damage.healthDamage);
        if (bot.hp > 0) return false;

        if (bot.isTestDummy) {
            bot.hp = 0;
            bot.armor = 0;
            bot.hasHelmet = false;
            bot.alive = false;
            bot.rig.root.visible = false;
            bot.path = [];
            bot.pathCursor = 0;
            bot.currentNode = -1;
            bot.targetNode = -1;
            bot.velocity.set(0, 0, 0);
            bot.respawnAt = elapsed + TEST_DUMMY_RESPAWN_SECONDS;
            bot.spawnProtectedUntil = 0;
            bot.outOfBoundsSince = -1;
            return true;
        }

        bot.hp = 0;
        bot.armor = 0;
        bot.hasHelmet = false;
        bot.alive = false;
        this.spawnCorpseFromBot(bot, elapsed, impactDir, headshot);
        bot.rig.root.visible = false;
        bot.path = [];
        bot.pathCursor = 0;
        bot.currentNode = -1;
        bot.targetNode = -1;
        bot.velocity.set(0, 0, 0);
        bot.respawnAt = elapsed + BOT_RESPAWN_SECONDS;
        bot.spawnProtectedUntil = 0;
        bot.outOfBoundsSince = -1;
        return true;
    }

    private animateBot(bot: BotAgent, dt: number, elapsed: number, lookAt: Vector3) {
        const speedNorm = MathUtils.clamp(bot.speed / Math.max(0.001, bot.profile.moveSpeed), 0, 1.4);
        bot.walkCycle += dt * (2.8 + speedNorm * 6.4);
        const swing = Math.sin(bot.walkCycle) * speedNorm;
        const antiSwing = Math.sin(bot.walkCycle + Math.PI) * speedNorm;

        const aimBase = -0.95;
        const aimAdj = MathUtils.clamp((bot.profile.engageMax - bot.rig.root.position.distanceTo(lookAt)) / bot.profile.engageMax, -0.3, 0.25);
        const aimVector = this.v1.copy(lookAt).sub(bot.rig.root.position);
        const flatAimLen = Math.max(0.001, Math.hypot(aimVector.x, aimVector.z));
        const desiredYaw = Math.atan2(aimVector.x, aimVector.z);
        const yawDelta = Math.atan2(
            Math.sin(desiredYaw - bot.rig.root.rotation.y),
            Math.cos(desiredYaw - bot.rig.root.rotation.y),
        );
        const localAimYaw = MathUtils.clamp(yawDelta, -0.85, 0.85);
        const localAimPitch = MathUtils.clamp(Math.atan2(aimVector.y - 1.12, flatAimLen), -0.6, 0.38);
        const aimAlpha = MathUtils.clamp(0.3 + bot.aimLock * 0.7 + bot.kick * 0.18, 0.28, 1);
        const fx = getRuntimeTuningSnapshot().effects;
        const muzzleFlash = MathUtils.clamp((bot.muzzleUntil - elapsed) / 0.045, 0, 1);
        const hitFlash = MathUtils.clamp((bot.hitGlowUntil - elapsed) / Math.max(0.02, fx.botGlowDuration), 0, 1) * bot.hitGlowStrength;

        bot.rig.leftLegJoint.rotation.x = swing * 0.85;
        bot.rig.rightLegJoint.rotation.x = antiSwing * 0.85;
        bot.rig.leftArmJoint.rotation.x = antiSwing * 0.45 + 0.15 - localAimPitch * 0.18;
        bot.rig.leftArmJoint.rotation.y = localAimYaw * 0.22;
        bot.rig.rightArmJoint.rotation.x = aimBase + aimAdj - localAimPitch * 0.72 - bot.kick * 0.52;
        bot.rig.rightArmJoint.rotation.y = localAimYaw * 0.72;
        bot.rig.headJoint.rotation.x = localAimPitch * 0.52 + Math.sin(bot.walkCycle * 0.5) * 0.04 + bot.kick * 0.12;
        bot.rig.headJoint.rotation.y = localAimYaw * 0.68;
        bot.rig.weaponMesh.rotation.z = -bot.kick * 0.26;
        bot.rig.weaponMesh.rotation.x = -localAimPitch * 0.22 + bot.kick * 0.12;
        bot.rig.weaponMesh.rotation.y = -0.08 + localAimYaw * 0.42;
        bot.rig.weaponMesh.position.set(0.26 - bot.kick * 0.1, -0.16 + bot.kick * 0.03, -0.2);
        bot.rig.muzzleMesh.visible = muzzleFlash > 0.01;
        bot.rig.muzzleMesh.scale.set(1 + muzzleFlash * 2.4, 1 + muzzleFlash * 1.5, 1 + muzzleFlash * 3.4);
        bot.rig.muzzleMesh.position.set(0.67 + muzzleFlash * 0.06, -0.16 - localAimPitch * 0.08, -0.2);
        bot.rig.muzzleMesh.rotation.y = localAimYaw * 0.42;
        bot.rig.muzzleMesh.rotation.x = -localAimPitch * 0.2;
        (bot.rig.muzzleMesh.material as MeshBasicMaterial).opacity = muzzleFlash * 0.96;
        bot.rig.aimIndicator.rotation.x = -localAimPitch * 0.84;
        bot.rig.aimIndicator.rotation.y = localAimYaw;
        bot.rig.aimIndicator.scale.set(1, 1, 0.9 + bot.aimLock * 0.35 + muzzleFlash * 0.2);
        (bot.rig.aimBeam.material as MeshBasicMaterial).opacity = MathUtils.clamp(0.2 + aimAlpha * 0.55, 0.2, 0.82);
        (bot.rig.aimTip.material as MeshBasicMaterial).opacity = MathUtils.clamp(0.3 + aimAlpha * 0.62 + muzzleFlash * 0.25, 0.3, 1);
        for (let i = 0; i < bot.rig.materials.length; i++) {
            const mat = bot.rig.materials[i];
            const base = bot.rig.baseColors[i];
            mat.transparent = bot.rig.baseTransparent[i];
            mat.opacity = bot.rig.baseOpacities[i];
            const baseR = (base >> 16) & 255;
            const baseG = (base >> 8) & 255;
            const baseB = base & 255;
            const glowMix = MathUtils.clamp(hitFlash * (i < 5 ? 0.95 : 0.55), 0, 1);
            mat.color.setRGB(
                MathUtils.lerp(baseR / 255, 1, glowMix),
                MathUtils.lerp(baseG / 255, 0.96, glowMix),
                MathUtils.lerp(baseB / 255, 0.96, glowMix),
            );
        }
        bot.rig.nameTag.visible = bot.alive;

        const spawnProtected = elapsed <= bot.spawnProtectedUntil;
        bot.rig.shieldSprite.visible = spawnProtected;
        if (spawnProtected) {
            const pulse = 1 + Math.sin(elapsed * 8.5 + bot.strafePhase) * 0.12;
            bot.rig.shieldSprite.scale.set(1.8 * pulse, 1.8 * pulse, 1);
            const mat = bot.rig.shieldSprite.material as SpriteMaterial;
            if (mat) mat.opacity = 0.66 + Math.sin(elapsed * 9.2) * 0.12;
        }
    }

    private updateStuck(bot: BotAgent, dt: number) {
        bot.sampleTimer += dt;
        if (bot.sampleTimer < STUCK_SAMPLE_INTERVAL) return;
        bot.sampleTimer = 0;

        const moved = bot.rig.root.position.distanceTo(bot.lastSamplePos);
        bot.lastSamplePos.copy(bot.rig.root.position);
        if (moved >= STUCK_DISTANCE) return;

        bot.nextDecisionAt = 0;
        bot.nextRepathAt = 0;
        this.v1.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(0.8);
        bot.velocity.add(this.v1);
        bot.pathCursor = Math.max(0, bot.pathCursor - 1);
    }

    private keepBotInsideMap(bot: BotAgent, elapsed: number) {
        if (!this.navNodes.length || this.navBounds.isEmpty()) return;
        const p = bot.rig.root.position;
        const margin = 6;
        const out = (
            p.x < this.navBounds.min.x - margin || p.x > this.navBounds.max.x + margin ||
            p.z < this.navBounds.min.z - margin || p.z > this.navBounds.max.z + margin ||
            p.y < this.navBounds.min.y - 8
        );
        if (!out) {
            bot.outOfBoundsSince = -1;
            return;
        }

        if (bot.outOfBoundsSince < 0) {
            bot.outOfBoundsSince = elapsed;
            return;
        }

        if (elapsed - bot.outOfBoundsSince >= OUT_OF_BOUNDS_GRACE_SECONDS) {
            this.forceRespawn(bot, elapsed);
            bot.outOfBoundsSince = -1;
        }
    }

    private checkRoundResult(elapsed: number) {
        if (this.roundPhase !== 'live') this.roundPhase = 'live';
    }

    private respawnBots(elapsed: number) {
        this.bots.forEach(bot => {
            if (!this.isRuntimeBotActive(bot)) {
                this.deactivateBot(bot);
                return;
            }
            this.respawnBot(bot, elapsed);
        });
    }

    private respawnBot(bot: BotAgent, elapsed: number) {
        const node = this.pickSpawnNode(bot.team, this.getPlayerTargetPosition(), SPAWN_MIN_PLAYER_DISTANCE, false);
        const safeNode = (node >= 0 && node < this.navNodes.length) ? node : this.resolveFallbackSpawnNode();
        if (safeNode < 0 || safeNode >= this.navNodes.length) return;
        this.teleportToNode(bot, safeNode);
        const nextWeaponId = this.pickWeaponId(bot.team, bot.difficulty);
        bot.weapon = this.pickWeapon(bot.team, bot.difficulty);
        bot.weaponInstance = createWeaponById(nextWeaponId);
        const armorLoadout = this.getBotArmorLoadout(bot.difficulty);
        bot.spawnNode = safeNode;
        bot.targetNode = safeNode;
        bot.path = [safeNode];
        bot.pathCursor = 1;
        bot.hp = BOT_HP;
        bot.armor = armorLoadout.armor;
        bot.hasHelmet = armorLoadout.hasHelmet;
        bot.alive = true;
        bot.rig.root.visible = true;
        this.restoreRigMaterialState(bot.rig);
        bot.intent = 'ANCHOR';
        bot.nextDecisionAt = elapsed + MathUtils.randFloat(0.1, 0.42);
        bot.nextRepathAt = elapsed;
        bot.nextShotAt = elapsed + bot.profile.reactionSeconds;
        bot.nextBurstAt = elapsed + bot.profile.reactionSeconds * MathUtils.randFloat(0.65, 1.2);
        bot.burstShotsLeft = 0;
        bot.aimLock = 0;
        bot.recoil = 0;
        bot.kick = 0;
        bot.muzzleUntil = 0;
        bot.lastSeenAt = -999;
        bot.lastSeenPos.copy(bot.rig.root.position);
        bot.lastSamplePos.copy(bot.rig.root.position);
        bot.sampleTimer = 0;
        bot.respawnAt = elapsed + BOT_RESPAWN_SECONDS;
        bot.spawnProtectedUntil = elapsed + BOT_SPAWN_PROTECTION_SECONDS;
        bot.outOfBoundsSince = -1;
    }

    private respawnTestDummy(bot: BotAgent, elapsed: number) {
        bot.hp = TEST_DUMMY_HP;
        bot.armor = 0;
        bot.hasHelmet = false;
        bot.alive = true;
        bot.onFloor = true;
        bot.rig.root.visible = true;
        this.restoreRigMaterialState(bot.rig);
        bot.rig.root.position.copy(bot.anchorPosition);
        bot.rig.root.rotation.set(0, 0, 0);
        bot.velocity.set(0, 0, 0);
        bot.path = [];
        bot.pathCursor = 0;
        bot.currentNode = -1;
        bot.targetNode = -1;
        bot.intent = 'ANCHOR';
        bot.nextDecisionAt = Number.POSITIVE_INFINITY;
        bot.nextRepathAt = Number.POSITIVE_INFINITY;
        bot.nextShotAt = Number.POSITIVE_INFINITY;
        bot.nextBurstAt = Number.POSITIVE_INFINITY;
        bot.burstShotsLeft = 0;
        bot.aimLock = 0;
        bot.recoil = 0;
        bot.kick = 0;
        bot.muzzleUntil = 0;
        bot.outOfBoundsSince = -1;
        bot.collider.start.set(bot.anchorPosition.x, bot.anchorPosition.y + BOT_COLLIDER_RADIUS, bot.anchorPosition.z);
        bot.collider.end.set(bot.anchorPosition.x, bot.anchorPosition.y + BOT_COLLIDER_HEIGHT - BOT_COLLIDER_RADIUS, bot.anchorPosition.z);
        bot.lastSeenPos.copy(bot.anchorPosition);
        bot.lastSamplePos.copy(bot.anchorPosition);
        bot.sampleTimer = 0;
        bot.respawnAt = elapsed + TEST_DUMMY_RESPAWN_SECONDS;
        bot.spawnProtectedUntil = 0;
    }

    private getBotArmorLoadout(difficulty: DifficultyName) {
        if (difficulty === 'HARD') return { armor: 100, hasHelmet: true };
        if (difficulty === 'NORMAL') return { armor: MathUtils.randInt(75, 95), hasHelmet: Math.random() < 0.85 };
        return { armor: MathUtils.randInt(0, 45), hasHelmet: false };
    }

    private updatePlayerRespawn(elapsed: number) {
        if (!this.matchEnabled) return;
        if (this.localPlayer.health > 0) return;
        if (this.playerRespawnAt < 0) this.playerRespawnAt = elapsed + PLAYER_RESPAWN_SECONDS;
        if (elapsed < this.playerRespawnAt) return;
        this.playerRespawnAt = -1;
        this.respawnPlayer();
    }

    private getPlayerTargetPosition() {
        const movement = this.localPlayer.movementController;
        if (movement && movement.playerCollider) return movement.playerCollider.end;
        return GameContext.Cameras.PlayerCamera.position;
    }

    private isPlayerSpawnProtected(elapsed: number) {
        return this.localPlayer.health > 0 && elapsed < this.playerSpawnProtectedUntil;
    }

    private updateDeathCamera(dt: number, elapsed: number) {
        const camera = GameContext.Cameras.PlayerCamera;
        const killer = this.lastKillerBotId ? this.bots.get(this.lastKillerBotId) : this.findBotByName(this.lastKillerName);

        if (!killer || !killer.alive) {
            this.v1.copy(this.playerDeathPos).y += 1.2;
            camera.position.lerp(this.v1, 1 - Math.exp(-5 * dt));
            return;
        }

        killer.rig.headJoint.getWorldPosition(this.v1);
        this.v2.set(Math.sin(killer.rig.root.rotation.y), 0, Math.cos(killer.rig.root.rotation.y)).normalize();
        this.v3.copy(this.v1).addScaledVector(this.v2, -1.55);
        this.v3.x += -this.v2.z * Math.sin(elapsed * 2.2) * 0.3;
        this.v3.z += this.v2.x * Math.sin(elapsed * 2.2) * 0.3;
        this.v3.y += 0.48 + Math.abs(Math.cos(elapsed * 1.35)) * 0.12;

        const camBlend = 1 - Math.exp(-7.5 * dt);
        camera.position.lerp(this.v3, camBlend);

        this.v3.copy(this.v1).addScaledVector(this.v2, 6.5);
        this.v3.y += 0.05;
        camera.lookAt(this.v3);
        camera.rotation.z = Math.sin(elapsed * 14) * 0.008;
    }

    private findBotByName(name: string) {
        if (!name) return null;
        let found: BotAgent = null;
        this.bots.forEach(bot => {
            if (found || !bot.alive) return;
            if (bot.name === name) found = bot;
        });
        return found;
    }

    private resolveFallbackSpawnNode() {
        if (this.navNodes.length) return this.findNearestNode(this.getPlayerTargetPosition());
        return -1;
    }

    private resolveSpawnPoint(nodeIndex: number, fallback?: Vector3) {
        const fallbackPoint = fallback || new Vector3(0, 0.05, 0);
        if (nodeIndex < 0 || nodeIndex >= this.navNodes.length) return fallbackPoint.clone();
        const base = this.navNodes[nodeIndex];
        if (this.navBounds.isEmpty()) return base.clone();
        const topY = this.navBounds.max.y + (this.mapProfile === 'dust2' ? 46 : 26);
        const bottomY = this.navBounds.min.y - (this.mapProfile === 'dust2' ? 36 : 20);
        const sampled = this.sampleGroundPoint(base.x, base.z, topY, bottomY);
        return sampled ? sampled : base.clone();
    }

    private forceRespawn(bot: BotAgent, elapsed: number) {
        const node = this.pickSpawnNode(bot.team, this.getPlayerTargetPosition(), SPAWN_MIN_PLAYER_DISTANCE * 0.7, false);
        const safeNode = (node >= 0 && node < this.navNodes.length) ? node : this.resolveFallbackSpawnNode();
        if (safeNode < 0 || safeNode >= this.navNodes.length) return;
        this.teleportToNode(bot, safeNode);
        bot.spawnNode = safeNode;
        bot.velocity.set(0, 0, 0);
        bot.onFloor = true;
        bot.path = [];
        bot.pathCursor = 0;
        bot.targetNode = safeNode;
        bot.nextRepathAt = elapsed + 0.2;
        bot.respawnAt = elapsed + 0.8;
        bot.spawnProtectedUntil = elapsed + 1.0;
    }

    private teleportToNode(bot: BotAgent, node: number) {
        const idx = (node >= 0 && node < this.navNodes.length) ? node : this.findNearestNode(bot.rig.root.position);
        if (idx < 0 || idx >= this.navNodes.length) return;
        const p = this.resolveSpawnPoint(idx, this.navNodes[idx]);
        bot.collider.start.set(p.x, p.y + BOT_COLLIDER_RADIUS, p.z);
        bot.collider.end.set(p.x, p.y + BOT_COLLIDER_HEIGHT - BOT_COLLIDER_RADIUS, p.z);
        bot.currentNode = idx;
        bot.velocity.set(0, 0, 0);
        bot.onFloor = true;
        bot.rig.root.position.set(p.x, p.y, p.z);
    }

    private respawnPlayer() {
        const elapsed = GameContext.GameLoop.Clock.getElapsedTime();
        this.localPlayer.health = PLAYER_MAX_HP;
        this.localPlayer.armor = PLAYER_MAX_ARMOR;
        this.localPlayer.hasHelmet = true;
        this.localPlayer.money = Math.max(800, this.localPlayer.money);
        this.playerSpawnProtectedUntil = elapsed + PLAYER_SPAWN_PROTECTION_SECONDS;
        this.lastKillerName = '';
        this.lastKillerBotId = '';
        if (this.localPlayer.inventorySystem) {
            this.localPlayer.inventorySystem.resetWeaponsToSpawnAmmo();
            this.localPlayer.inventorySystem.switchEquipment(InventorySlotEnum.Primary);
            this.localPlayer.inventorySystem.refreshCurrentWeaponState();
        }

        const node = this.pickSpawnNode(PLAYER_TEAM, this.playerDeathPos, SPAWN_MIN_PLAYER_DISTANCE, true);
        const safeNode = (node >= 0 && node < this.navNodes.length) ? node : this.resolveFallbackSpawnNode();
        if (safeNode < 0 || safeNode >= this.navNodes.length) return;

        const p = this.resolveSpawnPoint(safeNode, this.navNodes[safeNode]);
        const movement = this.localPlayer.movementController;
        if (!movement || !movement.playerCollider) return;

        movement.playerCollider.start.set(p.x, p.y + PLAYER_COLLIDER_RADIUS, p.z);
        movement.playerCollider.end.set(p.x, p.y + PLAYER_STANDING_END_OFFSET, p.z);
        movement.playerCollider.radius = PLAYER_COLLIDER_RADIUS;
        movement.playerVelocity.set(0, 0, 0);
        movement.playerOnFloor = true;
        movement.landingImpact = 0;
        GameContext.Cameras.PlayerCamera.position.copy(movement.playerCollider.end);
        if (this.bots.size > 0) {
            let nearest: BotAgent = null;
            let best = Infinity;
            this.bots.forEach(bot => {
                if (!bot.alive) return;
                const d2 = bot.rig.root.position.distanceToSquared(p);
                if (d2 < best) { best = d2; nearest = bot; }
            });
            if (nearest) {
                const look = this.v1.copy(nearest.rig.root.position).sub(p);
                const yaw = Math.atan2(look.x, look.z);
                GameContext.Cameras.PlayerCamera.rotation.set(0, yaw, 0);
            } else {
                GameContext.Cameras.PlayerCamera.rotation.set(0, 0, 0);
            }
        } else {
            GameContext.Cameras.PlayerCamera.rotation.set(0, 0, 0);
        }

        PlayerRespawnedEvent.detail.at = elapsed;
        GameLogicEventPipe.dispatchEvent(PlayerRespawnedEvent);
    }

    private pickSpawnNode(team: TeamName, avoidPos?: Vector3, minDistance = 0, prioritizeCover = false) {
        const teamPool = team === 'CT'
            ? (this.ctSpawnNodes.length ? this.ctSpawnNodes : this.ctNavNodes)
            : (this.tSpawnNodes.length ? this.tSpawnNodes : this.tNavNodes);
        const basePool = (teamPool.length ? [...teamPool] : this.navNodes.map((_, idx) => idx));
        if (!basePool.length) return -1;

        const minDistanceSq = minDistance * minDistance;
        const recentPool = this.resolveRecentSpawnPool(team, prioritizeCover);
        const recentDistSq = SPAWN_RECENT_NODE_PROXIMITY * SPAWN_RECENT_NODE_PROXIMITY;
        const botClearance = prioritizeCover ? SPAWN_MIN_BOT_CLEARANCE_SAFE : SPAWN_MIN_BOT_CLEARANCE;
        const safeCandidates: number[] = [];
        const lessRepeatedCandidates: number[] = [];

        for (let i = 0; i < basePool.length; i++) {
            const nodeIdx = basePool[i];
            const node = this.navNodes[nodeIdx];
            if (avoidPos && node.distanceToSquared(avoidPos) < minDistanceSq) continue;

            let tooClose = false;
            this.bots.forEach(bot => {
                if (!bot.alive || tooClose) return;
                if (node.distanceToSquared(bot.rig.root.position) < botClearance * botClearance) tooClose = true;
            });
            if (tooClose) continue;
            safeCandidates.push(nodeIdx);

            if (!this.isNearRecentSpawn(nodeIdx, recentPool, recentDistSq)) lessRepeatedCandidates.push(nodeIdx);
        }

        const pool = lessRepeatedCandidates.length ? lessRepeatedCandidates : (safeCandidates.length ? safeCandidates : basePool);
        const scored: { idx: number; score: number }[] = [];
        const playerPos = this.getPlayerTargetPosition();

        for (let i = 0; i < pool.length; i++) {
            const nodeIdx = pool[i];
            const node = this.navNodes[nodeIdx];
            let nearestBotDist = 999;
            let visibleThreatScore = 0;
            let closeThreatCount = 0;
            this.bots.forEach(bot => {
                if (!bot.alive) return;
                const d = node.distanceTo(bot.rig.root.position);
                if (d < nearestBotDist) nearestBotDist = d;
                if (this.hasLineOfSight(bot.rig.root.position, node)) {
                    visibleThreatScore += Math.max(0, 26 - d) * 0.9 + 2.5;
                    if (d < 8.5) closeThreatCount += 1;
                }
            });

            const distPlayer = node.distanceTo(playerPos);
            const visibilityPenalty = prioritizeCover ? (visibleThreatScore * 1.6) : (visibleThreatScore * 0.95);
            const closePenalty = prioritizeCover ? (closeThreatCount * 28) : (closeThreatCount * 14);
            const score =
                (distPlayer * (prioritizeCover ? 0.72 : 0.9)) +
                (nearestBotDist * (prioritizeCover ? 0.95 : 0.6)) -
                visibilityPenalty -
                closePenalty +
                (Math.random() * 2.2);
            scored.push({ idx: nodeIdx, score });
        }

        if (!scored.length) return basePool[0];
        scored.sort((a, b) => b.score - a.score);
        const top = Math.min(this.mapProfile === 'dust2' ? SPAWN_RANDOM_TOP_DUST2 : SPAWN_RANDOM_TOP_GENERIC, scored.length);
        const minTopScore = scored[top - 1].score;

        let weightSum = 0;
        const weightedTop: Array<{ idx: number; weight: number }> = [];
        for (let i = 0; i < top; i++) {
            const idx = scored[i].idx;
            const scoreWeight = Math.max(0.15, (scored[i].score - minTopScore) + 0.4);
            const repeatPenalty = recentPool.includes(idx) ? 0.22 : 1;
            const proximityPenalty = this.isNearRecentSpawn(idx, recentPool, recentDistSq * 0.56) ? 0.55 : 1;
            const weight = scoreWeight * repeatPenalty * proximityPenalty;
            weightedTop.push({ idx, weight });
            weightSum += weight;
        }

        let chosen = scored[0].idx;
        if (weightSum > 0.001 && weightedTop.length > 1) {
            let roll = Math.random() * weightSum;
            for (let i = 0; i < weightedTop.length; i++) {
                roll -= weightedTop[i].weight;
                if (roll <= 0) {
                    chosen = weightedTop[i].idx;
                    break;
                }
            }
        }

        this.pushRecentSpawnNode(recentPool, chosen);
        return chosen;
    }

    private resolveRecentSpawnPool(team: TeamName, prioritizeCover: boolean) {
        if (prioritizeCover) return this.recentPlayerSpawnNodes;
        return team === 'CT' ? this.recentCTSpawnNodes : this.recentTSpawnNodes;
    }

    private isNearRecentSpawn(nodeIdx: number, recentPool: number[], minDistSq: number) {
        if (!recentPool.length) return false;
        const node = this.navNodes[nodeIdx];
        for (let i = 0; i < recentPool.length; i++) {
            const recentIdx = recentPool[i];
            if (recentIdx < 0 || recentIdx >= this.navNodes.length) continue;
            if (node.distanceToSquared(this.navNodes[recentIdx]) < minDistSq) return true;
        }
        return false;
    }

    private pushRecentSpawnNode(recentPool: number[], nodeIdx: number) {
        recentPool.push(nodeIdx);
        if (recentPool.length <= SPAWN_RECENT_NODE_HISTORY) return;
        recentPool.splice(0, recentPool.length - SPAWN_RECENT_NODE_HISTORY);
    }

    private findNearestNode(position: Vector3) {
        if (!this.navNodes.length) return -1;
        let nearest = 0;
        let best = Infinity;
        for (let i = 0; i < this.navNodes.length; i++) {
            const d2 = this.navNodes[i].distanceToSquared(position);
            if (d2 < best) {
                best = d2;
                nearest = i;
            }
        }
        return nearest;
    }

    private findPath(start: number, end: number) {
        if (start < 0 || end < 0 || start >= this.navNodes.length || end >= this.navNodes.length) return [];
        if (start === end) return [start];

        const n = this.navNodes.length;
        const came = new Int32Array(n);
        const g = new Float32Array(n);
        const f = new Float32Array(n);
        const open = new Set<number>();

        for (let i = 0; i < n; i++) {
            came[i] = -1;
            g[i] = Number.POSITIVE_INFINITY;
            f[i] = Number.POSITIVE_INFINITY;
        }

        g[start] = 0;
        f[start] = this.navNodes[start].distanceTo(this.navNodes[end]);
        open.add(start);

        while (open.size > 0) {
            let current = -1;
            let lowestF = Number.POSITIVE_INFINITY;
            open.forEach(idx => {
                if (f[idx] < lowestF) {
                    lowestF = f[idx];
                    current = idx;
                }
            });
            if (current < 0) break;
            if (current === end) return this.reconstruct(came, current);

            open.delete(current);
            const neighbors = this.navLinks[current];
            for (let i = 0; i < neighbors.length; i++) {
                const nb = neighbors[i];
                const tentative = g[current] + this.navNodes[current].distanceTo(this.navNodes[nb]);
                if (tentative >= g[nb]) continue;
                came[nb] = current;
                g[nb] = tentative;
                f[nb] = tentative + this.navNodes[nb].distanceTo(this.navNodes[end]);
                open.add(nb);
            }
        }

        return [start, end];
    }

    private reconstruct(came: Int32Array, current: number) {
        const path: number[] = [current];
        let cursor = current;
        while (came[cursor] !== -1) {
            cursor = came[cursor];
            path.push(cursor);
        }
        path.reverse();
        return path;
    }
}
