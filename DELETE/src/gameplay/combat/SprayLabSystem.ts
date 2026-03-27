import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { InventorySlotEnum } from '@src/gameplay/abstract/InventorySlotEnum';
import { GameObjectMaterialEnum } from '@src/gameplay/abstract/GameObjectMaterialEnum';
import { UserInputEventEnum } from '@src/gameplay/abstract/EventsEnum';
import {
    compareSprayPattern,
    getMagazineSize,
    getReferencePatternStrict,
    isScopedStateSupported,
    SPRAY_LAB_DISTANCES,
    SPRAY_LAB_VALIDATION_WEAPON_IDS,
    SPRAY_LAB_WEAPON_IDS,
    SprayCaptureQuality,
    SprayDistanceMeters,
    SprayMetricSummary,
    SprayPoint2D,
    SprayReferenceMap,
    SprayScopeState,
} from '@src/gameplay/combat/SprayReference';
import sprayReferenceJson from '@src/gameplay/combat/sprayReference.csgo128.json';
import {
    computeDamageBreakdown,
    getAkRuntimeTune,
    resetAkRuntimeTune,
    seedFromWeapon,
    setAkRuntimeTune,
    toHitgroupFromPart,
} from '@src/gameplay/combat/CombatTuning';
import { createWeaponsForLoadout } from '@src/gameplay/loadout/weaponFactory';
import { getWeaponEntry, normalizeLoadoutProfile } from '@src/gameplay/loadout/weaponCatalog';
import { getModeRules } from '@src/gameplay/modes/modeRules';
import { BulletImpactEvent, GameLogicEventPipe, HitDamageEvent, KillFeedEvent, WeaponFireEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { UserInputEvent, UserInputEventPipe } from '@src/gameplay/pipes/UserinputEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { ScopeSystem } from '@src/gameplay/weapon/ScopeSystem';
import {
    BoxGeometry,
    CanvasTexture,
    Color,
    DoubleSide,
    Group,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PlaneGeometry,
    Sprite,
    SpriteMaterial,
    Vector2,
    Vector3,
} from 'three';

type PlayNowDetail = { mode?: string };
type OverlayMode = 'current' | 'reference' | 'delta';
type SprayLabViewMode = 'calibration' | 'free';
type DummyHitgroup = 'HEAD' | 'CHEST' | 'STOMACH' | 'ARM' | 'LEG';

type SprayDummy = {
    id: string;
    name: string;
    group: Group;
    nameSprite: Sprite;
    spawnPosition: Vector3;
    moveAxis: 'x' | 'z';
    moveRadius: number;
    moveSpeed: number;
    phase: number;
    hp: number;
    armor: number;
    hasHelmet: boolean;
    alive: boolean;
    respawnAt: number;
    hitsTaken: number;
    damageTaken: number;
    lifeFirstHitAt: number;
};

type DummyPartInfo = {
    dummyId: string;
    hitgroup: DummyHitgroup;
    mesh: Mesh;
};

type FreeWeaponStats = {
    shots: number;
    hits: number;
    damage: number;
    headshots: number;
    kills: number;
};

type DummyHitRecord = {
    at: number;
    weaponId: string;
    weaponName: string;
    dummyId: string;
    dummyName: string;
    hitgroup: DummyHitgroup;
    distance: number;
    healthDamage: number;
    armorDamage: number;
    hpAfter: number;
    armorAfter: number;
    kill: boolean;
    localX: number;
    localY: number;
};

type SprayCapturePoint = SprayPoint2D & {
    time: number;
    world?: [number, number, number];
    captureType: 'simulated' | 'wall';
};

type SprayRunRecord = {
    id: number;
    weaponId: string;
    weaponName: string;
    state: SprayScopeState;
    distance: SprayDistanceMeters;
    shotGoal: number;
    startedAt: number;
    endedAt: number;
    firedShots: number;
    wallHits: number;
    misses: number;
    points: SprayCapturePoint[];
    captureMode: 'simulated' | 'wall';
    validReason: string;
    shotSpacingMean: number;
    shotSpacingMax: number;
    silhouetteHitCount: number;
    silhouetteHitRatio: number;
    originLocal?: Vector2;
    captureQuality?: SprayCaptureQuality;
    metrics?: SprayMetricSummary;
};

type SprayMatrixResult = {
    generatedAt: string;
    reference: string;
    referenceSourceType: string;
    referenceVersion: string;
    validCount: number;
    invalidCount: number;
    rows: Array<{
        weaponId: string;
        state: SprayScopeState;
        distance: SprayDistanceMeters;
        sampleCount: number;
        rmseFirst10: number;
        rmseFirst30: number;
        rmseAll: number;
        maxError: number;
        pass: boolean;
        hitRatio: number;
    }>;
    invalidCaptures: Array<{
        weaponId: string;
        state: SprayScopeState;
        distance: SprayDistanceMeters;
        hitRatio: number;
        reason: string;
    }>;
    passCount: number;
    totalCount: number;
};

type MatrixQueueItem = {
    weaponId: string;
    state: SprayScopeState;
    distance: SprayDistanceMeters;
};

type SpraySuiteCombo = {
    key: string;
    weaponId: string;
    weaponName: string;
    state: SprayScopeState;
    distance: SprayDistanceMeters;
    shotGoal: number;
    hitCount: number;
    firedShots: number;
    wallHits: number;
    misses: number;
    hitRatio: number;
    captureMode: 'simulated' | 'wall';
    validReason: string;
    shotSpacingMean: number;
    shotSpacingMax: number;
    silhouetteHitCount: number;
    silhouetteHitRatio: number;
    valid: boolean;
    pass: boolean;
    invalidReason: string;
    captureQuality: SprayCaptureQuality;
    metrics: SprayMetricSummary | null;
    current: SprayPoint2D[];
    reference: SprayPoint2D[];
    delta: Array<{ shotIndex: number; dx: number; dy: number; error: number }>;
};

type SpraySuiteExport = {
    generatedAt: string;
    reference: string;
    referenceSourceType: string;
    referenceVersion: string;
    expectedCount: number;
    totalCount: number;
    validCount: number;
    invalidCount: number;
    passCount: number;
    allValidCoverage: boolean;
    allPass: boolean;
    combos: SpraySuiteCombo[];
};

const REFERENCE_SOURCE = `${(sprayReferenceJson as any)?.reference || 'csgo-128'}`;
const REFERENCE_SOURCE_TYPE = `${(sprayReferenceJson as any)?.referenceSourceType || 'unknown'}`.trim().toLowerCase();
const REFERENCE_VERSION = `${(sprayReferenceJson as any)?.referenceVersion || 'unversioned'}`;
const REFERENCE_PATTERNS: SprayReferenceMap = ((sprayReferenceJson as any)?.patterns || {}) as SprayReferenceMap;
const REFERENCE_IS_EXTERNAL = REFERENCE_SOURCE_TYPE === 'external';

const RUN_FAIL_TIMEOUT_MS = 22000;
const MATRIX_START_DELAY_MS = 120;
const MATRIX_STEP_DELAY_MS = 320;
const SPRAY_LAB_SEED_TAG = 'spray-csgo128';
const SPRAY_WALL_SCALE = 26;
const SILHOUETTE_TEST_DISTANCE: SprayDistanceMeters = 10;
const ENABLE_DEBUG_SPRAY_EXPORT_JSON = !!((import.meta as any)?.env?.DEV) && !!((globalThis as any).__SPRAY_LAB_DEBUG_EXPORT_JSON__);
const ENABLE_SPRAY_LAB_FREE_MODE = !!((import.meta as any)?.env?.DEV) || `${(import.meta as any)?.env?.VITE_ENABLE_SPRAY_LAB_FREE_MODE || 'false'}`.trim().toLowerCase() === 'true';
const FREE_DUMMY_RESPAWN_SECONDS = 1.4;
const FREE_HIT_LOG_LIMIT = 180;
const FREE_OVERLAY_POINT_LIMIT = 220;
const FREE_ARENA_HALF_SIZE = 36;

const normalizeWeaponId = (value: string) => `${value || ''}`.toLowerCase().replace(/[^a-z0-9_]/g, '');

const toScopeState = (value: string): SprayScopeState => (value === 'scoped' ? 'scoped' : 'unscoped');
const toDistance = (value: string): SprayDistanceMeters => (value === '20' ? 20 : 10);

export class SprayLabSystem implements CycleInterface, LoopInterface {

    private localPlayer = LocalPlayer.getInstance();
    private scene = GameContext.Scenes.Level;

    private modeActive = false;
    private modeName = 'ffa';

    private wallGroup = new Group();
    private wallByDistance = new Map<SprayDistanceMeters, Mesh>();
    private silhouetteByDistance = new Map<SprayDistanceMeters, Mesh>();
    private floorMesh: Mesh | null = null;

    private uiRoot: HTMLDivElement;
    private viewModeSelectEl: HTMLSelectElement;
    private weaponSelectEl: HTMLSelectElement;
    private stateSelectEl: HTMLSelectElement;
    private distanceSelectEl: HTMLSelectElement;
    private dummySelectEl: HTMLSelectElement;
    private overlaySelectEl: HTMLSelectElement;
    private statusEl: HTMLDivElement;
    private progressEl: HTMLDivElement;
    private metricsEl: HTMLPreElement;
    private canvasEl: HTMLCanvasElement;
    private historyEl: HTMLDivElement;
    private akTunePanelEl: HTMLDivElement;
    private akKickSliderEl: HTMLInputElement;
    private akKickValueEl: HTMLSpanElement;
    private akSpreadSliderEl: HTMLInputElement;
    private akSpreadValueEl: HTMLSpanElement;
    private akPatternSliderEl: HTMLInputElement;
    private akPatternValueEl: HTMLSpanElement;
    private akRecoverySliderEl: HTMLInputElement;
    private akRecoveryValueEl: HTMLSpanElement;
    private akTuneResetEl: HTMLButtonElement;

    private runButtonEl: HTMLButtonElement;
    private runMatrixButtonEl: HTMLButtonElement;
    private stopMatrixButtonEl: HTMLButtonElement;
    private clearButtonEl: HTMLButtonElement;
    private resetTrainerButtonEl: HTMLButtonElement;
    private respawnDummiesButtonEl: HTMLButtonElement;
    private exportButtonEl: HTMLButtonElement;
    private menuButtonEl: HTMLButtonElement;

    private activeRun: SprayRunRecord | null = null;
    private runHistory: SprayRunRecord[] = [];
    private lastRun: SprayRunRecord | null = null;
    private lastMatrixResult: SprayMatrixResult | null = null;

    private runSeed = 0;
    private runStartPerfMs = 0;
    private runWarmupUntilMs = 0;
    private runNextTriggerAtMs = 0;
    private waitingForPointerLock = false;

    private matrixActive = false;
    private matrixQueue: MatrixQueueItem[] = [];
    private matrixRows: SprayMatrixResult['rows'] = [];
    private matrixInvalidCaptures: SprayMatrixResult['invalidCaptures'] = [];
    private matrixCompletedCount = 0;
    private matrixTotalCount = 0;
    private matrixStartPerfMs = 0;
    private matrixNextRunAtMs = 0;

    private overlayMode: OverlayMode = 'delta';
    private viewMode: SprayLabViewMode = 'calibration';
    private dummyGroup = new Group();
    private dummyTargets: SprayDummy[] = [];
    private dummyPartByUUID = new Map<string, DummyPartInfo>();
    private freeSessionStartedAt = 0;
    private freeShots = 0;
    private freeHits = 0;
    private freeHeadshots = 0;
    private freeDamage = 0;
    private freeArmorDamage = 0;
    private freeKills = 0;
    private freeTtkTotalMs = 0;
    private freeTtkCount = 0;
    private freeTtkBestMs = Number.POSITIVE_INFINITY;
    private freeHitgroupCount: Record<DummyHitgroup, number> = {
        HEAD: 0,
        CHEST: 0,
        STOMACH: 0,
        ARM: 0,
        LEG: 0,
    };
    private freeHitLog: DummyHitRecord[] = [];
    private freeWeaponStats = new Map<string, FreeWeaponStats>();
    private freeLastShotAt = 0;

    private anchorPosition = new Vector3(0, 0, 0);
    private anchorYaw = 0;

    private tempVecA = new Vector3();
    private tempVecB = new Vector3();

    init(): void {
        this.createSprayWalls();
        this.buildUi();

        window.addEventListener('game:play-now', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as PlayNowDetail;
            const mode = `${detail.mode || 'ffa'}`.trim().toLowerCase();
            this.modeName = mode;
            if (mode === 'spray_lab') this.activate();
            else this.deactivate();
        });

        window.addEventListener('game:return-main-menu', () => {
            this.modeName = 'ffa';
            this.deactivate();
        });

        GameLogicEventPipe.addEventListener(WeaponFireEvent.type, (event: Event) => {
            this.onWeaponFire(event as CustomEvent);
        });

        GameLogicEventPipe.addEventListener(BulletImpactEvent.type, (event: Event) => {
            this.onBulletImpact(event as CustomEvent);
        });
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        if (!this.modeActive) return;
        const freeMode = this.isFreeModeActive();
        if (!freeMode || this.activeRun || this.matrixActive) {
            this.lockPlayerToAnchor();
        } else {
            this.stabilizeFreeModePlayer();
            this.updateFreeDummies(deltaTime || 0.016, elapsedTime || GameContext.GameLoop.Clock.getElapsedTime());
        }
        const nowMs = performance.now();

        if (this.activeRun) {
            if (nowMs - this.runStartPerfMs > RUN_FAIL_TIMEOUT_MS) {
                this.finishRun('Run timeout (possible no-wall hit).');
                return;
            }

            if (this.waitingForPointerLock) {
                if (!GameContext.PointLock.isLocked) return;
                this.waitingForPointerLock = false;
                this.runWarmupUntilMs = nowMs + 260;
                this.runNextTriggerAtMs = this.runWarmupUntilMs;
            }

            if (nowMs < this.runWarmupUntilMs) return;

            this.lockPlayerToAnchor();

            const weapon = this.getCurrentWeapon();
            if (!weapon) {
                this.finishRun('No weapon equipped for spray run.');
                return;
            }

            if (this.activeRun.firedShots >= this.activeRun.shotGoal) {
                this.finishRun(`Run complete: ${this.activeRun.points.length}/${this.activeRun.shotGoal} simulated captures.`);
                return;
            }

            if (weapon.bulletLeftMagzine <= 0) {
                this.finishRun(`Magazine empty: ${this.activeRun.points.length}/${this.activeRun.shotGoal} simulated captures.`);
                return;
            }

            const intervalMs = Math.max(55, (Number(weapon.fireRate) || 0.1) * 1000);
            if (nowMs >= this.runNextTriggerAtMs) {
                // Pulse trigger each shot so semi-auto and bolt-action weapons remain deterministic too.
                this.dispatchTriggerUp();
                this.dispatchTriggerDown();
                this.runNextTriggerAtMs = nowMs + intervalMs;
            }
            return;
        }

        if (!this.matrixActive) return;
        if (nowMs < this.matrixNextRunAtMs) return;

        if (!this.matrixQueue.length) {
            this.finishMatrix();
            return;
        }

        const next = this.matrixQueue.shift()!;
        const started = this.beginRunForConfig(next.weaponId, next.state, next.distance, true);
        if (!started) {
            this.matrixCompletedCount += 1;
            this.matrixInvalidCaptures.push({
                weaponId: next.weaponId,
                state: next.state,
                distance: next.distance,
                hitRatio: 0,
                reason: 'run-start-failed',
            });
            this.updateMatrixProgress();
            this.matrixNextRunAtMs = nowMs + MATRIX_STEP_DELAY_MS;
        }
    }

    private activate() {
        const modeRules = getModeRules('spray_lab');
        if (!modeRules.enableSprayLabUi) return;

        this.modeActive = true;
        this.viewMode = this.viewModeSelectEl?.value === 'free' && ENABLE_SPRAY_LAB_FREE_MODE ? 'free' : 'calibration';
        if (this.viewModeSelectEl) this.viewModeSelectEl.value = this.viewMode;
        this.resetMatrixState();
        if (!this.wallGroup.parent) this.scene.add(this.wallGroup);
        this.wallGroup.visible = true;
        this.dummyGroup.visible = ENABLE_SPRAY_LAB_FREE_MODE;
        this.uiRoot.classList.remove('hidden');

        this.anchorPosition.set(0, 96, 0);
        this.anchorYaw = 0;
        this.placeWalls();
        this.movePlayerToAnchor();
        this.resetFreeTrainerStats(false);
        this.respawnAllDummies();

        this.localPlayer.health = 100;
        this.localPlayer.armor = 100;
        this.localPlayer.hasHelmet = true;

        this.setStatus(this.viewMode === 'free'
            ? 'Free Aim Trainer ready. Dummylere ates et, hit dağılımını ve damage metriklerini izle.'
            : 'Spray Lab ready. Select weapon/state/distance and press RUN.');
        this.updateMatrixProgress();
        this.syncAkTuneUiState();
        this.renderHistory();
        this.broadcastLookLock(false);
        this.refreshActionButtons();
        this.renderOverlay();
        if (this.viewMode === 'free') this.renderFreeMetrics();
        else if (!this.lastRun) this.metricsEl.textContent = 'Calibration mode idle. Select weapon/state/distance and press RUN.';
    }

    private deactivate() {
        if (!this.modeActive) return;
        this.modeActive = false;
        this.stopMatrix('Spray Lab closed.');
        this.stopRunInternals();
        this.clearSpraySeedOverride();
        this.resetMatrixState();
        this.wallGroup.visible = false;
        this.dummyGroup.visible = false;
        if (this.wallGroup.parent) this.wallGroup.parent.remove(this.wallGroup);
        this.uiRoot.classList.add('hidden');
        this.broadcastLookLock(false);
    }

    private createSprayWalls() {
        this.wallGroup.name = 'spray-lab-walls';
        this.wallGroup.visible = false;
        const wallWidth = 26;
        const wallHeight = 16;

        const floorMaterial = new MeshBasicMaterial({
            map: this.createFloorTexture(),
            side: DoubleSide,
            color: new Color(0xffffff),
        });
        const floor = new Mesh(new PlaneGeometry(84, 84, 1, 1), floorMaterial);
        floor.name = 'spray-lab-floor';
        floor.rotation.x = -Math.PI * 0.5;
        floor.userData['GameObjectMaterialEnum'] = GameObjectMaterialEnum.GrassGround;
        floor.userData['sprayLabFloor'] = true;
        this.floorMesh = floor;
        this.wallGroup.add(floor);

        SPRAY_LAB_DISTANCES.forEach((distance) => {
            const material = new MeshBasicMaterial({
                map: this.createGridTexture(distance),
                side: DoubleSide,
                color: new Color(0xffffff),
            });
            const wall = new Mesh(new PlaneGeometry(wallWidth, wallHeight, 1, 1), material);
            wall.name = `spray-lab-wall-${distance}m`;
            wall.userData['GameObjectMaterialEnum'] = GameObjectMaterialEnum.GrassGround;
            wall.userData['sprayLabWallDistance'] = distance;
            wall.userData['sprayLabWall'] = true;
            this.wallByDistance.set(distance, wall);
            this.wallGroup.add(wall);

            if (distance === SILHOUETTE_TEST_DISTANCE) {
                const silhouetteMaterial = new MeshBasicMaterial({
                    map: this.createSilhouetteTexture(),
                    side: DoubleSide,
                    transparent: true,
                    color: new Color(0xffffff),
                });
                const silhouette = new Mesh(new PlaneGeometry(2.0, 3.6, 1, 1), silhouetteMaterial);
                silhouette.name = `spray-lab-silhouette-${distance}m`;
                silhouette.userData['sprayLabSilhouette'] = true;
                // Keep it visible but non-interactive for raycasts.
                silhouette.raycast = (..._args: any[]) => undefined;
                this.silhouetteByDistance.set(distance, silhouette);
                this.wallGroup.add(silhouette);
            }
        });

        this.dummyGroup.name = 'spray-lab-dummies';
        this.dummyGroup.visible = false;
        this.wallGroup.add(this.dummyGroup);
        this.createDummyTargets();
    }

    private createFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new CanvasTexture(canvas);

        ctx.fillStyle = '#0b1320';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i <= 32; i++) {
            const p = Math.floor((i / 32) * canvas.width);
            const strongLine = i % 8 === 0;
            ctx.strokeStyle = strongLine ? 'rgba(152, 181, 219, 0.32)' : 'rgba(119, 146, 183, 0.16)';
            ctx.lineWidth = strongLine ? 2 : 1;

            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, canvas.height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, p);
            ctx.lineTo(canvas.width, p);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(216, 231, 255, 0.64)';
        ctx.font = 'bold 58px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SPRAY LAB', canvas.width / 2, canvas.height / 2);

        const texture = new CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    private createGridTexture(distance: number) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new CanvasTexture(canvas);

        ctx.fillStyle = '#101826';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i <= 16; i++) {
            const p = Math.floor((i / 16) * canvas.width);
            ctx.strokeStyle = i === 8 ? 'rgba(239, 245, 255, 0.48)' : 'rgba(151, 175, 206, 0.18)';
            ctx.lineWidth = i === 8 ? 3 : 1;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, canvas.height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, p);
            ctx.lineTo(canvas.width, p);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(238, 245, 255, 0.92)';
        ctx.font = 'bold 84px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${distance}m`, canvas.width / 2, 112);

        const texture = new CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    private createSilhouetteTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new CanvasTexture(canvas);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(181, 216, 255, 0.15)';
        ctx.strokeStyle = 'rgba(188, 224, 255, 0.65)';
        ctx.lineWidth = 4;

        const cx = canvas.width * 0.5;
        const headY = 158;
        const bodyY = 410;
        const pelvisY = 600;
        const legsY = 820;

        ctx.beginPath();
        ctx.ellipse(cx, headY, 62, 74, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cx, bodyY, 120, 168, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cx, pelvisY, 102, 124, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cx - 48, legsY, 58, 144, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 48, legsY, 58, 144, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(220, 239, 255, 0.68)';
        ctx.font = 'bold 44px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('10m Target', cx, 64);

        const texture = new CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    private createNameSprite(text: string) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(8, 13, 20, 0.88)';
            ctx.fillRect(0, 22, canvas.width, 84);
            ctx.strokeStyle = 'rgba(170, 225, 255, 0.9)';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 24, canvas.width - 4, 80);
            ctx.fillStyle = '#e6f4ff';
            ctx.font = 'bold 44px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(text, canvas.width * 0.5, 79);
        }
        const texture = new CanvasTexture(canvas);
        texture.needsUpdate = true;
        const sprite = new Sprite(new SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        }));
        sprite.scale.set(2.6, 0.6, 1);
        sprite.position.set(0, 2.34, 0);
        return sprite;
    }

    private createDummyTargets() {
        this.dummyGroup.clear();
        this.dummyTargets = [];
        this.dummyPartByUUID.clear();

        const bodyMaterial = new MeshBasicMaterial({ color: new Color(0xc8d5e7) });
        const chestMaterial = new MeshBasicMaterial({ color: new Color(0xb9c8db) });
        const legMaterial = new MeshBasicMaterial({ color: new Color(0x9bb2cb) });
        const headMaterial = new MeshBasicMaterial({ color: new Color(0xf1d4c0) });
        const hitboxMaterial = new MeshBasicMaterial({ color: new Color(0xffffff), transparent: true, opacity: 0 });

        const configs = [
            { id: 'dummy_a', name: 'DUMMY_A', spawn: new Vector3(0, this.anchorPosition.y, -10), moveAxis: 'x' as const, moveRadius: 0, moveSpeed: 0, phase: 0.1 },
            { id: 'dummy_b', name: 'DUMMY_B', spawn: new Vector3(-6, this.anchorPosition.y, -14), moveAxis: 'x' as const, moveRadius: 2.8, moveSpeed: 1.05, phase: 1.7 },
            { id: 'dummy_c', name: 'DUMMY_C', spawn: new Vector3(6, this.anchorPosition.y, -14), moveAxis: 'x' as const, moveRadius: 2.2, moveSpeed: 1.28, phase: 4.2 },
            { id: 'dummy_d', name: 'DUMMY_D', spawn: new Vector3(-4, this.anchorPosition.y, -20), moveAxis: 'z' as const, moveRadius: 1.8, moveSpeed: 0.82, phase: 2.4 },
            { id: 'dummy_e', name: 'DUMMY_E', spawn: new Vector3(5, this.anchorPosition.y, -22), moveAxis: 'x' as const, moveRadius: 3.6, moveSpeed: 0.66, phase: 5.4 },
        ];

        const registerPart = (
            dummy: SprayDummy,
            geometry: BoxGeometry,
            material: MeshBasicMaterial,
            position: Vector3,
            hitgroup: DummyHitgroup,
            partMaterial: GameObjectMaterialEnum,
        ) => {
            const visible = new Mesh(geometry, material);
            visible.position.copy(position);
            visible.userData['sprayLabDummyVisual'] = true;
            dummy.group.add(visible);

            const hitbox = new Mesh(geometry.clone(), hitboxMaterial.clone());
            hitbox.position.copy(position);
            hitbox.userData['sprayLabDummyId'] = dummy.id;
            hitbox.userData['sprayLabDummyHitgroup'] = hitgroup;
            hitbox.userData['GameObjectMaterialEnum'] = partMaterial;
            dummy.group.add(hitbox);
            this.dummyPartByUUID.set(hitbox.uuid, { dummyId: dummy.id, hitgroup, mesh: hitbox });
        };

        configs.forEach((config) => {
            const dummyRoot = new Group();
            dummyRoot.name = config.name;
            dummyRoot.position.copy(config.spawn);

            const nameSprite = this.createNameSprite(`${config.name} 100`);
            dummyRoot.add(nameSprite);

            const dummy: SprayDummy = {
                id: config.id,
                name: config.name,
                group: dummyRoot,
                nameSprite,
                spawnPosition: config.spawn.clone(),
                moveAxis: config.moveAxis,
                moveRadius: config.moveRadius,
                moveSpeed: config.moveSpeed,
                phase: config.phase,
                hp: 100,
                armor: 100,
                hasHelmet: true,
                alive: true,
                respawnAt: 0,
                hitsTaken: 0,
                damageTaken: 0,
                lifeFirstHitAt: -1,
            };

            registerPart(dummy, new BoxGeometry(0.36, 0.36, 0.3), headMaterial.clone(), new Vector3(0, 1.68, 0), 'HEAD', GameObjectMaterialEnum.PlayerHead);
            registerPart(dummy, new BoxGeometry(0.64, 0.58, 0.38), chestMaterial.clone(), new Vector3(0, 1.2, 0), 'CHEST', GameObjectMaterialEnum.PlayerChest);
            registerPart(dummy, new BoxGeometry(0.56, 0.44, 0.34), bodyMaterial.clone(), new Vector3(0, 0.82, 0), 'STOMACH', GameObjectMaterialEnum.PlayerBelly);
            registerPart(dummy, new BoxGeometry(0.18, 0.5, 0.2), bodyMaterial.clone(), new Vector3(-0.46, 1.16, 0), 'ARM', GameObjectMaterialEnum.PlayerUpperLimb);
            registerPart(dummy, new BoxGeometry(0.18, 0.5, 0.2), bodyMaterial.clone(), new Vector3(0.46, 1.16, 0), 'ARM', GameObjectMaterialEnum.PlayerUpperLimb);
            registerPart(dummy, new BoxGeometry(0.24, 0.72, 0.24), legMaterial.clone(), new Vector3(-0.18, 0.34, 0), 'LEG', GameObjectMaterialEnum.PlayerLowerLimb);
            registerPart(dummy, new BoxGeometry(0.24, 0.72, 0.24), legMaterial.clone(), new Vector3(0.18, 0.34, 0), 'LEG', GameObjectMaterialEnum.PlayerLowerLimb);

            this.dummyTargets.push(dummy);
            this.dummyGroup.add(dummyRoot);
        });

        this.refreshDummySelectOptions();
        this.placeDummyTargets();
        this.updateDummyLabels();
    }

    private refreshDummySelectOptions() {
        if (!this.dummySelectEl) return;
        const selected = `${this.dummySelectEl.value || 'all'}`;
        this.dummySelectEl.innerHTML = [
            '<option value="all">all dummies</option>',
            ...this.dummyTargets.map((dummy) => `<option value="${dummy.id}">${dummy.name}</option>`),
        ].join('');
        const hasCurrent = this.dummyTargets.some((dummy) => dummy.id === selected);
        this.dummySelectEl.value = hasCurrent ? selected : 'all';
    }

    private updateDummyLabels() {
        this.dummyTargets.forEach((dummy) => {
            const spriteMaterial = dummy.nameSprite.material as SpriteMaterial;
            const texture = spriteMaterial.map as CanvasTexture;
            if (!texture) return;
            const canvas = texture.image as HTMLCanvasElement;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const hp = Math.max(0, Math.floor(dummy.hp));
            const ar = Math.max(0, Math.floor(dummy.armor));
            const status = dummy.alive ? `${dummy.name} ${hp}/${ar}` : `${dummy.name} RESPAWN`;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = dummy.alive ? 'rgba(8, 13, 20, 0.88)' : 'rgba(26, 8, 10, 0.84)';
            ctx.fillRect(0, 22, canvas.width, 84);
            ctx.strokeStyle = dummy.alive ? 'rgba(170, 225, 255, 0.9)' : 'rgba(255, 146, 146, 0.9)';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 24, canvas.width - 4, 80);
            ctx.fillStyle = '#e6f4ff';
            ctx.font = 'bold 40px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(status, canvas.width * 0.5, 79);
            texture.needsUpdate = true;
        });
    }

    private placeDummyTargets() {
        this.dummyTargets.forEach((dummy) => {
            dummy.group.position.copy(dummy.spawnPosition);
        });
    }

    private resetDummy(dummy: SprayDummy) {
        dummy.hp = 100;
        dummy.armor = 100;
        dummy.hasHelmet = true;
        dummy.alive = true;
        dummy.respawnAt = 0;
        dummy.hitsTaken = 0;
        dummy.damageTaken = 0;
        dummy.lifeFirstHitAt = -1;
        dummy.group.position.copy(dummy.spawnPosition);
        dummy.group.visible = true;
    }

    private respawnAllDummies() {
        this.dummyTargets.forEach((dummy) => this.resetDummy(dummy));
        this.updateDummyLabels();
        this.setStatus('Dummy targets reset.');
    }

    private updateFreeDummies(deltaTime: number, elapsedTime: number) {
        const dt = Math.max(0, Number(deltaTime) || 0.016);
        const elapsed = Math.max(0, Number(elapsedTime) || GameContext.GameLoop.Clock.getElapsedTime());
        this.dummyTargets.forEach((dummy) => {
            if (!dummy.alive) {
                if (elapsed >= dummy.respawnAt) this.resetDummy(dummy);
                return;
            }

            const moveWave = Math.sin((elapsed * dummy.moveSpeed) + dummy.phase);
            if (dummy.moveAxis === 'x') {
                dummy.group.position.x = dummy.spawnPosition.x + (moveWave * dummy.moveRadius);
                dummy.group.position.z = dummy.spawnPosition.z;
            } else {
                dummy.group.position.x = dummy.spawnPosition.x;
                dummy.group.position.z = dummy.spawnPosition.z + (moveWave * dummy.moveRadius);
            }

            const yawTarget = Math.atan2(
                this.anchorPosition.x - dummy.group.position.x,
                this.anchorPosition.z - dummy.group.position.z,
            );
            dummy.group.rotation.y = MathUtils.lerp(dummy.group.rotation.y, yawTarget, Math.min(1, dt * 4.8));
        });
        this.updateDummyLabels();
    }

    private stabilizeFreeModePlayer() {
        const movement = this.localPlayer.movementController;
        if (!movement?.playerCollider) return;

        const collider = movement.playerCollider;
        const center = this.tempVecA.set(
            (collider.start.x + collider.end.x) * 0.5,
            (collider.start.y + collider.end.y) * 0.5,
            (collider.start.z + collider.end.z) * 0.5,
        );

        const clampedX = MathUtils.clamp(center.x, this.anchorPosition.x - FREE_ARENA_HALF_SIZE, this.anchorPosition.x + FREE_ARENA_HALF_SIZE);
        const clampedZ = MathUtils.clamp(center.z, this.anchorPosition.z - FREE_ARENA_HALF_SIZE, this.anchorPosition.z + FREE_ARENA_HALF_SIZE);

        const deltaX = clampedX - center.x;
        const deltaZ = clampedZ - center.z;
        if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaZ) > 0.0001) {
            collider.start.x += deltaX;
            collider.end.x += deltaX;
            collider.start.z += deltaZ;
            collider.end.z += deltaZ;
            movement.playerVelocity.x *= 0.25;
            movement.playerVelocity.z *= 0.25;
        }
        const floorStartY = this.anchorPosition.y + 0.35;
        const floorEndY = this.anchorPosition.y + 1.45;
        if (collider.start.y <= floorStartY) {
            if (movement.playerVelocity.y < 0) movement.playerVelocity.y = 0;
            collider.start.y = floorStartY;
            collider.end.y = floorEndY;
            movement.playerOnFloor = true;
            movement.airborneTime = 0;
        } else {
            movement.playerOnFloor = false;
        }
    }

    private placeWalls() {
        if (this.floorMesh) {
            this.floorMesh.position.set(this.anchorPosition.x, this.anchorPosition.y, this.anchorPosition.z);
            this.floorMesh.updateMatrixWorld(true);
        }

        this.dummyTargets.forEach((dummy) => {
            dummy.spawnPosition.y = this.anchorPosition.y;
        });
        this.placeDummyTargets();

        const wallHeight = this.anchorPosition.y + 1.45;
        const forward = this.tempVecA.set(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), this.anchorYaw).normalize();

        SPRAY_LAB_DISTANCES.forEach((distance) => {
            const wall = this.wallByDistance.get(distance);
            if (!wall) return;
            const pos = this.tempVecB.copy(this.anchorPosition).addScaledVector(forward, distance);
            wall.position.set(pos.x, wallHeight, pos.z);
            wall.lookAt(this.anchorPosition.x, wallHeight, this.anchorPosition.z);

            const silhouette = this.silhouetteByDistance.get(distance);
            if (silhouette) {
                silhouette.position.copy(wall.position);
                silhouette.quaternion.copy(wall.quaternion);
                silhouette.translateZ(0.015);
                silhouette.translateY(-1.62);
                silhouette.updateMatrixWorld(true);
            }
        });

        this.updateWallHighlight();
    }

    private buildUi() {
        this.uiRoot = document.createElement('div');
        this.uiRoot.id = 'spray-lab-ui';
        this.uiRoot.className = 'hidden';

        const modeOptions = [
            '<option value="calibration">calibration</option>',
            ...(ENABLE_SPRAY_LAB_FREE_MODE ? ['<option value="free">free aim trainer</option>'] : []),
        ].join('');

        const weaponOptions = SPRAY_LAB_WEAPON_IDS.map((weaponId) => {
            const entry = getWeaponEntry(weaponId);
            const name = entry ? entry.displayName : weaponId.toUpperCase();
            return `<option value="${weaponId}">${name}</option>`;
        }).join('');

        this.uiRoot.innerHTML = `
            <div class="spray-lab-shell">
                <div class="spray-lab-title">SPRAY LAB</div>
                <div class="spray-lab-grid">
                    <label>Mode
                        <select id="spray-lab-view-mode">${modeOptions}</select>
                    </label>
                    <label>Weapon
                        <select id="spray-lab-weapon">${weaponOptions}</select>
                    </label>
                    <label>State
                        <select id="spray-lab-state">
                            <option value="unscoped">unscoped</option>
                            <option value="scoped">scoped</option>
                        </select>
                    </label>
                    <label>Distance
                        <select id="spray-lab-distance">
                            <option value="10">10m</option>
                            <option value="20">20m</option>
                        </select>
                    </label>
                    <label>Overlay
                        <select id="spray-lab-overlay">
                            <option value="delta">Delta</option>
                            <option value="current">Current</option>
                            <option value="reference">Reference</option>
                        </select>
                    </label>
                    <label>Dummy Focus
                        <select id="spray-lab-dummy">
                            <option value="all">all dummies</option>
                        </select>
                    </label>
                </div>
                <div class="spray-lab-actions">
                    <button id="spray-lab-run-btn">RUN</button>
                    <button id="spray-lab-matrix-btn">RUN MATRIX</button>
                    <button id="spray-lab-stop-btn">STOP</button>
                    <button id="spray-lab-clear-btn">CLEAR</button>
                    <button id="spray-lab-reset-trainer-btn">RESET TRAINER</button>
                    <button id="spray-lab-respawn-dummies-btn">RESPAWN DUMMIES</button>
                    <button id="spray-lab-export-btn">EXPORT</button>
                    <button id="spray-lab-menu-btn">MAIN MENU</button>
                </div>
                <div class="spray-lab-status" id="spray-lab-status"></div>
                <div class="spray-lab-progress" id="spray-lab-progress"></div>
                <div class="spray-lab-ak-tune hidden" id="spray-lab-ak-tune">
                    <div class="spray-lab-ak-tune-title">AK47 LIVE TUNE (DEV)</div>
                    <label>
                        <span>Camera Kick</span>
                        <span id="spray-lab-ak-kick-value">1.08x</span>
                        <input id="spray-lab-ak-kick" type="range" min="0.40" max="2.20" step="0.01" value="1.08"/>
                    </label>
                    <label>
                        <span>Random Spread</span>
                        <span id="spray-lab-ak-spread-value">0.78x</span>
                        <input id="spray-lab-ak-spread" type="range" min="0.25" max="2.20" step="0.01" value="0.78"/>
                    </label>
                    <label>
                        <span>Pattern Scale</span>
                        <span id="spray-lab-ak-pattern-value">1.14x</span>
                        <input id="spray-lab-ak-pattern" type="range" min="0.45" max="1.90" step="0.01" value="1.14"/>
                    </label>
                    <label>
                        <span>Recovery</span>
                        <span id="spray-lab-ak-recovery-value">0.92x</span>
                        <input id="spray-lab-ak-recovery" type="range" min="0.45" max="2.10" step="0.01" value="0.92"/>
                    </label>
                    <button id="spray-lab-ak-tune-reset">RESET AK TUNE</button>
                </div>
                <canvas id="spray-lab-canvas" width="460" height="280"></canvas>
                <pre id="spray-lab-metrics"></pre>
                <div class="spray-lab-history" id="spray-lab-history"></div>
            </div>
        `;
        this.viewModeSelectEl = this.uiRoot.querySelector('#spray-lab-view-mode') as HTMLSelectElement;
        this.weaponSelectEl = this.uiRoot.querySelector('#spray-lab-weapon') as HTMLSelectElement;
        this.stateSelectEl = this.uiRoot.querySelector('#spray-lab-state') as HTMLSelectElement;
        this.distanceSelectEl = this.uiRoot.querySelector('#spray-lab-distance') as HTMLSelectElement;
        this.dummySelectEl = this.uiRoot.querySelector('#spray-lab-dummy') as HTMLSelectElement;
        this.overlaySelectEl = this.uiRoot.querySelector('#spray-lab-overlay') as HTMLSelectElement;
        this.statusEl = this.uiRoot.querySelector('#spray-lab-status') as HTMLDivElement;
        this.progressEl = this.uiRoot.querySelector('#spray-lab-progress') as HTMLDivElement;
        this.akTunePanelEl = this.uiRoot.querySelector('#spray-lab-ak-tune') as HTMLDivElement;
        this.akKickSliderEl = this.uiRoot.querySelector('#spray-lab-ak-kick') as HTMLInputElement;
        this.akKickValueEl = this.uiRoot.querySelector('#spray-lab-ak-kick-value') as HTMLSpanElement;
        this.akSpreadSliderEl = this.uiRoot.querySelector('#spray-lab-ak-spread') as HTMLInputElement;
        this.akSpreadValueEl = this.uiRoot.querySelector('#spray-lab-ak-spread-value') as HTMLSpanElement;
        this.akPatternSliderEl = this.uiRoot.querySelector('#spray-lab-ak-pattern') as HTMLInputElement;
        this.akPatternValueEl = this.uiRoot.querySelector('#spray-lab-ak-pattern-value') as HTMLSpanElement;
        this.akRecoverySliderEl = this.uiRoot.querySelector('#spray-lab-ak-recovery') as HTMLInputElement;
        this.akRecoveryValueEl = this.uiRoot.querySelector('#spray-lab-ak-recovery-value') as HTMLSpanElement;
        this.akTuneResetEl = this.uiRoot.querySelector('#spray-lab-ak-tune-reset') as HTMLButtonElement;
        this.metricsEl = this.uiRoot.querySelector('#spray-lab-metrics') as HTMLPreElement;
        this.canvasEl = this.uiRoot.querySelector('#spray-lab-canvas') as HTMLCanvasElement;
        this.historyEl = this.uiRoot.querySelector('#spray-lab-history') as HTMLDivElement;

        this.runButtonEl = this.uiRoot.querySelector('#spray-lab-run-btn') as HTMLButtonElement;
        this.runMatrixButtonEl = this.uiRoot.querySelector('#spray-lab-matrix-btn') as HTMLButtonElement;
        this.stopMatrixButtonEl = this.uiRoot.querySelector('#spray-lab-stop-btn') as HTMLButtonElement;
        this.clearButtonEl = this.uiRoot.querySelector('#spray-lab-clear-btn') as HTMLButtonElement;
        this.resetTrainerButtonEl = this.uiRoot.querySelector('#spray-lab-reset-trainer-btn') as HTMLButtonElement;
        this.respawnDummiesButtonEl = this.uiRoot.querySelector('#spray-lab-respawn-dummies-btn') as HTMLButtonElement;
        this.exportButtonEl = this.uiRoot.querySelector('#spray-lab-export-btn') as HTMLButtonElement;
        this.menuButtonEl = this.uiRoot.querySelector('#spray-lab-menu-btn') as HTMLButtonElement;

        this.runButtonEl.addEventListener('click', () => this.beginRun());
        this.runMatrixButtonEl.addEventListener('click', () => this.runMatrix());
        this.stopMatrixButtonEl.addEventListener('click', () => this.stopMatrix('Matrix aborted by user.'));
        this.clearButtonEl.addEventListener('click', () => this.clearRuns());
        this.resetTrainerButtonEl.addEventListener('click', () => this.resetFreeTrainerStats(true));
        this.respawnDummiesButtonEl.addEventListener('click', () => this.respawnAllDummies());
        this.exportButtonEl.addEventListener('click', () => this.exportReports());
        this.akKickSliderEl.addEventListener('input', () => this.applyAkRuntimeTuneFromUi());
        this.akSpreadSliderEl.addEventListener('input', () => this.applyAkRuntimeTuneFromUi());
        this.akPatternSliderEl.addEventListener('input', () => this.applyAkRuntimeTuneFromUi());
        this.akRecoverySliderEl.addEventListener('input', () => this.applyAkRuntimeTuneFromUi());
        this.akTuneResetEl.addEventListener('click', () => {
            const tune = resetAkRuntimeTune();
            this.akKickSliderEl.value = tune.cameraKickMul.toFixed(2);
            this.akSpreadSliderEl.value = tune.randomSpreadMul.toFixed(2);
            this.akPatternSliderEl.value = tune.patternScaleMul.toFixed(2);
            this.akRecoverySliderEl.value = tune.recoveryMul.toFixed(2);
            this.syncAkTuneUiState();
            this.setStatus(`AK runtime tune reset (kick=${tune.cameraKickMul.toFixed(2)}x spread=${tune.randomSpreadMul.toFixed(2)}x pattern=${tune.patternScaleMul.toFixed(2)}x recovery=${tune.recoveryMul.toFixed(2)}x).`);
        });
        this.menuButtonEl.addEventListener('click', () => {
            this.dispatchTriggerUp();
            window.dispatchEvent(new CustomEvent('game:return-main-menu'));
            window.dispatchEvent(new CustomEvent('game:open-main-menu'));
        });

        this.viewModeSelectEl.addEventListener('change', () => {
            const previousMode = this.viewMode;
            this.viewMode = this.viewModeSelectEl.value === 'free' && ENABLE_SPRAY_LAB_FREE_MODE ? 'free' : 'calibration';
            if (this.viewMode === 'free' && previousMode !== 'free') this.resetFreeTrainerStats(false);
            this.updateWallHighlight();
            this.updateMatrixProgress();
            this.syncAkTuneUiState();
            this.refreshActionButtons();
            this.renderHistory();
            this.renderOverlay();
            this.renderFreeMetrics();
            if (this.viewMode === 'calibration' && !this.activeRun && !this.lastRun) {
                this.metricsEl.textContent = 'Calibration mode idle. Select weapon/state/distance and press RUN.';
            }
            this.setStatus(this.viewMode === 'free'
                ? 'Free Aim Trainer aktif. Dummylere ates edip detayli metrikleri takip edebilirsin.'
                : 'Calibration mode aktif. RUN / RUN MATRIX ile deterministic pattern olc.');
        });
        this.weaponSelectEl.addEventListener('change', () => {
            this.enforceScopeStateSupport();
            this.updateWallHighlight();
            this.syncAkTuneUiState();
            this.renderOverlay();
        });
        this.stateSelectEl.addEventListener('change', () => {
            this.enforceScopeStateSupport();
            this.renderOverlay();
        });
        this.distanceSelectEl.addEventListener('change', () => {
            this.updateWallHighlight();
            this.renderOverlay();
        });
        this.overlaySelectEl.addEventListener('change', () => {
            this.overlayMode = (this.overlaySelectEl.value as OverlayMode) || 'delta';
            this.renderOverlay();
        });
        this.dummySelectEl.addEventListener('change', () => {
            this.renderOverlay();
            this.renderHistory();
            this.renderFreeMetrics();
        });

        GameContext.GameView.Container.appendChild(this.uiRoot);
        this.refreshDummySelectOptions();
        this.syncAkTuneUiState();
        this.refreshActionButtons();
    }

    private applyAkRuntimeTuneFromUi() {
        const kick = Number(this.akKickSliderEl.value) || 1;
        const spread = Number(this.akSpreadSliderEl.value) || 1;
        const pattern = Number(this.akPatternSliderEl.value) || 1;
        const recovery = Number(this.akRecoverySliderEl.value) || 1;
        const tune = setAkRuntimeTune({
            cameraKickMul: kick,
            randomSpreadMul: spread,
            patternScaleMul: pattern,
            recoveryMul: recovery,
        });
        this.akKickValueEl.textContent = `${tune.cameraKickMul.toFixed(2)}x`;
        this.akSpreadValueEl.textContent = `${tune.randomSpreadMul.toFixed(2)}x`;
        this.akPatternValueEl.textContent = `${tune.patternScaleMul.toFixed(2)}x`;
        this.akRecoveryValueEl.textContent = `${tune.recoveryMul.toFixed(2)}x`;
        this.renderOverlay();
        if (this.isFreeModeActive()) this.renderFreeMetrics();
    }

    private syncAkTuneUiState() {
        if (!this.akTunePanelEl) return;
        const tune = getAkRuntimeTune();
        this.akKickSliderEl.value = tune.cameraKickMul.toFixed(2);
        this.akSpreadSliderEl.value = tune.randomSpreadMul.toFixed(2);
        this.akPatternSliderEl.value = tune.patternScaleMul.toFixed(2);
        this.akRecoverySliderEl.value = tune.recoveryMul.toFixed(2);
        this.akKickValueEl.textContent = `${tune.cameraKickMul.toFixed(2)}x`;
        this.akSpreadValueEl.textContent = `${tune.randomSpreadMul.toFixed(2)}x`;
        this.akPatternValueEl.textContent = `${tune.patternScaleMul.toFixed(2)}x`;
        this.akRecoveryValueEl.textContent = `${tune.recoveryMul.toFixed(2)}x`;
        const selectedWeaponId = normalizeWeaponId(this.weaponSelectEl?.value || '');
        const show = selectedWeaponId === 'ak47';
        this.akTunePanelEl.classList.toggle('hidden', !show);
    }

    private beginRun() {
        if (!this.modeActive || this.activeRun || this.matrixActive) return;
        if (this.isFreeModeActive()) {
            this.setStatus('Calibration RUN free mode icinde kapali. Mode -> calibration sec.');
            return;
        }

        const weaponId = normalizeWeaponId(this.weaponSelectEl.value);
        const state = toScopeState(this.stateSelectEl.value);
        const distance = toDistance(this.distanceSelectEl.value);
        this.beginRunForConfig(weaponId, state, distance, false);
    }

    private beginRunForConfig(
        weaponIdRaw: string,
        stateRaw: SprayScopeState,
        distanceRaw: SprayDistanceMeters,
        startedByMatrix: boolean,
    ): boolean {
        if (!this.modeActive || this.activeRun) return false;

        const weaponId = normalizeWeaponId(weaponIdRaw);
        const weaponEntry = getWeaponEntry(weaponId);
        if (!weaponEntry) {
            this.setStatus(`Unknown weapon: ${weaponId}`);
            return false;
        }

        let state: SprayScopeState = stateRaw;
        const distance: SprayDistanceMeters = distanceRaw;

        if (state === 'scoped' && !isScopedStateSupported(weaponId)) {
            state = 'unscoped';
            this.stateSelectEl.value = 'unscoped';
            if (!startedByMatrix) {
                this.setStatus('Scoped mode only supports AUG/SG553/AWP. Fallback to unscoped.');
            }
        }

        const equipped = this.equipWeaponForRun(weaponId);
        if (!equipped) {
            this.setStatus(`Failed to equip ${weaponId} for spray run.`);
            return false;
        }
        this.applySpraySeedOverride(weaponId);

        this.weaponSelectEl.value = weaponId;
        this.stateSelectEl.value = state;
        this.distanceSelectEl.value = `${distance}`;

        this.movePlayerToAnchor();
        this.placeWalls();
        this.updateWallHighlight();
        this.syncScopeState(weaponId, state);

        this.runSeed += 1;
        const shotGoal = getMagazineSize(weaponId);
        const now = GameContext.GameLoop.Clock.getElapsedTime();

        this.activeRun = {
            id: this.runSeed,
            weaponId,
            weaponName: weaponEntry.displayName,
            state,
            distance,
            shotGoal,
            startedAt: now,
            endedAt: now,
            firedShots: 0,
            wallHits: 0,
            misses: 0,
            captureMode: 'simulated',
            validReason: 'quality-not-evaluated',
            shotSpacingMean: 0,
            shotSpacingMax: 0,
            silhouetteHitCount: 0,
            silhouetteHitRatio: 0,
            points: [],
        };

        this.runStartPerfMs = performance.now();
        this.runWarmupUntilMs = this.runStartPerfMs + 260;
        this.runNextTriggerAtMs = this.runWarmupUntilMs;
        this.waitingForPointerLock = !GameContext.PointLock.isLocked;
        this.dispatchTriggerUp();
        if (this.waitingForPointerLock) GameContext.PointLock.lock();

        this.broadcastLookLock(true);
        if (startedByMatrix) {
            this.setStatus(`Matrix running: ${weaponEntry.displayName} | ${state} | ${distance}m`);
            this.updateMatrixProgress();
        } else {
            this.setStatus(`RUN started: ${weaponEntry.displayName} | ${state} | ${distance}m`);
        }

        this.refreshActionButtons();
        this.renderOverlay();
        return true;
    }

    private finishRun(statusText?: string) {
        if (!this.activeRun) return;

        const finishedRun = this.activeRun;
        this.dispatchTriggerUp();
        this.evaluateRunMetrics(finishedRun);
        finishedRun.endedAt = GameContext.GameLoop.Clock.getElapsedTime();

        this.lastRun = finishedRun;
        this.runHistory.push(finishedRun);
        this.activeRun = null;
        this.waitingForPointerLock = false;
        this.broadcastLookLock(false);

        if (this.matrixActive) {
            this.matrixCompletedCount += 1;
            const quality = finishedRun.captureQuality || { valid: false, hitRatio: 0, reason: 'quality-not-evaluated' };
            if (quality.valid && finishedRun.metrics) {
                this.matrixRows.push({
                    weaponId: finishedRun.weaponId,
                    state: finishedRun.state,
                    distance: finishedRun.distance,
                    sampleCount: finishedRun.metrics.sampleCount,
                    rmseFirst10: finishedRun.metrics.rmseFirst10,
                    rmseFirst30: finishedRun.metrics.rmseFirst30,
                    rmseAll: finishedRun.metrics.rmseAll,
                    maxError: finishedRun.metrics.maxError,
                    pass: finishedRun.metrics.pass,
                    hitRatio: quality.hitRatio,
                });
            } else {
                this.matrixInvalidCaptures.push({
                    weaponId: finishedRun.weaponId,
                    state: finishedRun.state,
                    distance: finishedRun.distance,
                    hitRatio: quality.hitRatio,
                    reason: quality.reason,
                });
            }
            this.updateMatrixProgress();
            this.matrixNextRunAtMs = performance.now() + MATRIX_STEP_DELAY_MS;
            if (!this.matrixQueue.length) this.finishMatrix();
            else this.setStatus(statusText || `Matrix sample done: ${finishedRun.weaponName} ${finishedRun.distance}m.`);
        } else {
            this.setStatus(statusText || 'Run finished.');
        }

        this.refreshActionButtons();
        this.renderHistory();
        this.renderOverlay();
    }

    private stopRunInternals() {
        this.dispatchTriggerUp();
        this.activeRun = null;
        this.waitingForPointerLock = false;
        this.broadcastLookLock(false);
        this.refreshActionButtons();
    }

    private onWeaponFire(event: CustomEvent) {
        if (!this.modeActive) return;

        const weapon = event.detail.weaponInstance;
        const weaponId = normalizeWeaponId(`${weapon?.weaponId || weapon?.weaponName || ''}`);

        if (this.isFreeModeActive() && !this.activeRun && !this.matrixActive) {
            this.registerFreeShot(weaponId);
        }

        if (!this.activeRun) return;

        if (weaponId !== this.activeRun.weaponId) return;
        if (this.activeRun.firedShots >= this.activeRun.shotGoal) return;

        const run = this.activeRun;
        run.firedShots += 1;
        const shotIndex = run.firedShots;

        const recoiled = event.detail.bPointRecoiledScreenCoord as Vector2 | undefined;
        const spreadX = Number(recoiled?.x) || 0;
        const spreadY = Number(recoiled?.y) || 0;
        const rawX = spreadX * run.distance * SPRAY_WALL_SCALE;
        const rawY = -spreadY * run.distance * SPRAY_WALL_SCALE;

        if (!run.originLocal) run.originLocal = new Vector2(rawX, rawY);

        run.points.push({
            shotIndex,
            x: rawX - run.originLocal.x,
            y: rawY - run.originLocal.y,
            time: GameContext.GameLoop.Clock.getElapsedTime(),
            captureType: 'simulated',
        });
        run.captureMode = 'simulated';
        run.points.sort((a, b) => a.shotIndex - b.shotIndex);
        run.misses = Math.max(0, run.firedShots - run.wallHits);
        this.evaluateRunMetrics(run);
        this.renderOverlay();
    }

    private onBulletImpact(event: CustomEvent) {
        if (!this.modeActive) return;
        const detail = event.detail || {};
        this.processDummyHit(detail);

        if (!this.activeRun) return;

        const weaponId = normalizeWeaponId(`${detail.weaponId || detail.weaponName || ''}`);
        if (weaponId !== this.activeRun.weaponId) return;

        const run = this.activeRun;
        const selectedWall = this.wallByDistance.get(run.distance);
        const objectUUID = `${detail.objectUUID || ''}`;

        if (!selectedWall || objectUUID !== selectedWall.uuid) return;

        run.wallHits += 1;
        run.misses = Math.max(0, run.firedShots - run.wallHits);
        this.evaluateRunMetrics(run);
        this.renderOverlay();
    }

    private evaluateRunMetrics(run: SprayRunRecord) {
        const indexedCurrent = this.toIndexedPoints(run);
        const capturedCurrent = this.toCapturedPoints(run);
        const hitCount = run.points.length;
        run.misses = Math.max(0, run.firedShots - run.wallHits);
        const spacing = this.computeShotSpacing(capturedCurrent);
        const silhouette = this.computeSilhouetteStats(capturedCurrent, run.distance);
        run.shotSpacingMean = spacing.mean;
        run.shotSpacingMax = spacing.max;
        run.silhouetteHitCount = silhouette.hitCount;
        run.silhouetteHitRatio = silhouette.hitRatio;
        const hitRatio = run.shotGoal > 0 ? Math.max(0, Math.min(1, hitCount / run.shotGoal)) : 0;
        const baseValid = hitCount === run.shotGoal && run.firedShots >= run.shotGoal;
        const referenceGateReason = REFERENCE_IS_EXTERNAL
            ? 'ok'
            : `reference-source-not-external (${REFERENCE_SOURCE_TYPE})`;
        const referenceLookup = getReferencePatternStrict(
            REFERENCE_PATTERNS,
            run.weaponId,
            run.state,
            run.distance,
            run.shotGoal,
        );

        let scaleMismatchReason = '';
        if (referenceLookup.found) {
            const referenceSpacing = this.computeShotSpacing(referenceLookup.pattern);
            if (referenceSpacing.mean > 0.000001) {
                const spacingRatio = spacing.mean / referenceSpacing.mean;
                if (spacingRatio > 8 || spacingRatio < 0.125) {
                    scaleMismatchReason = `spacing-scale-mismatch (${spacingRatio.toFixed(2)}x vs reference)`;
                }
            }
        }

        run.captureQuality = {
            valid: baseValid && REFERENCE_IS_EXTERNAL && referenceLookup.found && !scaleMismatchReason,
            hitRatio,
            reason: !baseValid
                ? `capture-incomplete (${hitCount}/${run.shotGoal} simulated shots)`
                : (scaleMismatchReason || (!REFERENCE_IS_EXTERNAL ? referenceGateReason : referenceLookup.reason)),
        };
        run.validReason = run.captureQuality.reason;

        if (referenceLookup.found) {
            run.metrics = compareSprayPattern({
                weaponId: run.weaponId,
                state: run.state,
                distance: run.distance,
                current: indexedCurrent,
                reference: referenceLookup.pattern,
            });
            if (run.captureQuality.valid === false) {
                run.metrics.pass = false;
            }
        } else {
            run.metrics = undefined;
        }

        const metric = run.metrics;
        this.metricsEl.textContent = [
            `Weapon: ${run.weaponName} (${run.weaponId})`,
            `State: ${run.state} | Distance: ${run.distance}m`,
            `Capture: simulated-spread (deterministic) | wall-hit ${run.wallHits}/${run.firedShots} | wall-miss ${run.misses}`,
            `Shots: ${hitCount}/${run.shotGoal} | Fired: ${run.firedShots}`,
            `Silhouette(10m): ${run.silhouetteHitCount}/${run.shotGoal} | ratio=${run.silhouetteHitRatio.toFixed(3)} | target>=0.867 (26/30)`,
            `Shot Spacing: mean=${run.shotSpacingMean.toFixed(4)} max=${run.shotSpacingMax.toFixed(4)}`,
            ...(run.weaponId === 'ak47'
                ? (() => {
                    const tune = getAkRuntimeTune();
                    return [`AK Tune: kick=${tune.cameraKickMul.toFixed(2)}x | spread=${tune.randomSpreadMul.toFixed(2)}x | pattern=${tune.patternScaleMul.toFixed(2)}x | recovery=${tune.recoveryMul.toFixed(2)}x`];
                })()
                : []),
            `Quality: ${run.captureQuality.valid ? 'VALID' : 'INVALID'} | hitRatio=${hitRatio.toFixed(3)} | reason=${run.captureQuality.reason}`,
            ...(metric
                ? [
                    `RMSE(1..10): ${metric.rmseFirst10.toFixed(3)} ${metric.thresholds.rmseFirst10 !== undefined ? `/ <= ${metric.thresholds.rmseFirst10}` : ''}`,
                    `RMSE(1..30): ${metric.rmseFirst30.toFixed(3)} ${metric.thresholds.rmseFirst30 !== undefined ? `/ <= ${metric.thresholds.rmseFirst30}` : ''}`,
                    `RMSE(all): ${metric.rmseAll.toFixed(3)} / <= ${metric.thresholds.rmseAll}`,
                    `MAX: ${metric.maxError.toFixed(3)} / <= ${metric.thresholds.max}`,
                    `PASS: ${metric.pass ? 'YES' : 'NO'} | reference=${REFERENCE_SOURCE} (${REFERENCE_SOURCE_TYPE} @ ${REFERENCE_VERSION})`,
                ]
                : [`Reference: MISSING | source=${REFERENCE_SOURCE} (${REFERENCE_SOURCE_TYPE} @ ${REFERENCE_VERSION})`]),
        ].join('\n');
    }

    private registerFreeShot(weaponIdRaw: string) {
        const weaponId = normalizeWeaponId(weaponIdRaw || `${this.getCurrentWeapon()?.weaponId || ''}`);
        this.freeShots += 1;
        this.freeLastShotAt = GameContext.GameLoop.Clock.getElapsedTime();

        const stat = this.freeWeaponStats.get(weaponId) || { shots: 0, hits: 0, damage: 0, headshots: 0, kills: 0 };
        stat.shots += 1;
        this.freeWeaponStats.set(weaponId, stat);
        this.updateMatrixProgress();
        this.renderFreeMetrics();
    }

    private processDummyHit(detail: any) {
        if (!this.isFreeModeActive()) return;
        const objectUUID = `${detail?.objectUUID || ''}`;
        if (!objectUUID) return;

        const partInfo = this.dummyPartByUUID.get(objectUUID);
        if (!partInfo) return;

        const dummy = this.dummyTargets.find((item) => item.id === partInfo.dummyId);
        if (!dummy || !dummy.alive) return;

        const weaponId = normalizeWeaponId(`${detail?.weaponId || detail?.weaponName || ''}`);
        const weaponName = `${detail?.weaponName || getWeaponEntry(weaponId)?.displayName || weaponId.toUpperCase()}`;
        const distance = Math.max(0, Number(detail?.distance) || 0);
        const material = detail?.material as GameObjectMaterialEnum;
        const hitgroup = toHitgroupFromPart(material) as DummyHitgroup;
        const breakdown = computeDamageBreakdown(weaponId || weaponName, hitgroup, distance, dummy.armor, dummy.hasHelmet);

        const armorDamageApplied = Math.min(dummy.armor, breakdown.armorDamage);
        dummy.armor = Math.max(0, dummy.armor - armorDamageApplied);
        dummy.hp = Math.max(0, dummy.hp - breakdown.healthDamage);
        dummy.hitsTaken += 1;
        dummy.damageTaken += breakdown.healthDamage;
        if (dummy.lifeFirstHitAt < 0) dummy.lifeFirstHitAt = GameContext.GameLoop.Clock.getElapsedTime();

        const kill = dummy.hp <= 0;
        if (kill) {
            dummy.alive = false;
            dummy.respawnAt = GameContext.GameLoop.Clock.getElapsedTime() + FREE_DUMMY_RESPAWN_SECONDS;
            dummy.group.visible = false;
        }

        this.freeHits += 1;
        this.freeDamage += breakdown.healthDamage;
        this.freeArmorDamage += armorDamageApplied;
        this.freeHitgroupCount[hitgroup] += 1;
        if (hitgroup === 'HEAD') this.freeHeadshots += 1;

        const weaponStat = this.freeWeaponStats.get(weaponId) || { shots: 0, hits: 0, damage: 0, headshots: 0, kills: 0 };
        weaponStat.hits += 1;
        weaponStat.damage += breakdown.healthDamage;
        if (hitgroup === 'HEAD') weaponStat.headshots += 1;
        if (kill) weaponStat.kills += 1;
        this.freeWeaponStats.set(weaponId, weaponStat);

        HitDamageEvent.detail.damage = breakdown.healthDamage;
        HitDamageEvent.detail.victimName = dummy.name;
        HitDamageEvent.detail.weaponName = weaponName;
        HitDamageEvent.detail.headshot = hitgroup === 'HEAD';
        HitDamageEvent.detail.killed = kill;
        GameLogicEventPipe.dispatchEvent(HitDamageEvent);

        if (kill) {
            this.freeKills += 1;
            KillFeedEvent.detail.killerName = 'YOU';
            KillFeedEvent.detail.victimName = dummy.name;
            KillFeedEvent.detail.weaponName = weaponName;
            KillFeedEvent.detail.headshot = hitgroup === 'HEAD';
            GameLogicEventPipe.dispatchEvent(KillFeedEvent);
            if (dummy.lifeFirstHitAt > 0) {
                const ttkMs = Math.max(0, (GameContext.GameLoop.Clock.getElapsedTime() - dummy.lifeFirstHitAt) * 1000);
                this.freeTtkTotalMs += ttkMs;
                this.freeTtkCount += 1;
                this.freeTtkBestMs = Math.min(this.freeTtkBestMs, ttkMs);
            }
            dummy.lifeFirstHitAt = -1;
        }

        const impactPoint = detail?.point instanceof Vector3
            ? (detail.point as Vector3).clone()
            : new Vector3();
        const localPoint = dummy.group.worldToLocal(impactPoint);

        const hitRecord: DummyHitRecord = {
            at: GameContext.GameLoop.Clock.getElapsedTime(),
            weaponId,
            weaponName,
            dummyId: dummy.id,
            dummyName: dummy.name,
            hitgroup,
            distance,
            healthDamage: breakdown.healthDamage,
            armorDamage: armorDamageApplied,
            hpAfter: dummy.hp,
            armorAfter: dummy.armor,
            kill,
            localX: localPoint.x,
            localY: localPoint.y,
        };

        this.freeHitLog.push(hitRecord);
        if (this.freeHitLog.length > FREE_HIT_LOG_LIMIT) {
            this.freeHitLog.splice(0, this.freeHitLog.length - FREE_HIT_LOG_LIMIT);
        }

        this.updateDummyLabels();
        this.updateMatrixProgress();
        this.renderFreeMetrics();
        this.renderHistory();
        this.renderOverlay();
    }

    private resetFreeTrainerStats(resetDummies: boolean) {
        this.freeSessionStartedAt = GameContext.GameLoop.Clock.getElapsedTime();
        this.freeShots = 0;
        this.freeHits = 0;
        this.freeHeadshots = 0;
        this.freeDamage = 0;
        this.freeArmorDamage = 0;
        this.freeKills = 0;
        this.freeTtkTotalMs = 0;
        this.freeTtkCount = 0;
        this.freeTtkBestMs = Number.POSITIVE_INFINITY;
        this.freeHitgroupCount = {
            HEAD: 0,
            CHEST: 0,
            STOMACH: 0,
            ARM: 0,
            LEG: 0,
        };
        this.freeHitLog = [];
        this.freeWeaponStats.clear();
        if (resetDummies) this.respawnAllDummies();
        this.updateMatrixProgress();
        this.renderFreeMetrics();
        this.renderHistory();
        this.renderOverlay();
    }

    private renderFreeMetrics() {
        if (!this.metricsEl) return;
        if (!this.isFreeModeActive()) return;

        const elapsed = Math.max(0.0001, GameContext.GameLoop.Clock.getElapsedTime() - this.freeSessionStartedAt);
        const misses = Math.max(0, this.freeShots - this.freeHits);
        const accuracy = this.freeShots > 0 ? (this.freeHits / this.freeShots) : 0;
        const hsRatio = this.freeHits > 0 ? (this.freeHeadshots / this.freeHits) : 0;
        const avgTtk = this.freeTtkCount > 0 ? (this.freeTtkTotalMs / this.freeTtkCount) : 0;
        const dps = this.freeDamage / elapsed;
        const dpm = dps * 60;
        const akTune = getAkRuntimeTune();

        const weaponLines = [...this.freeWeaponStats.entries()]
            .sort((a, b) => b[1].damage - a[1].damage)
            .slice(0, 6)
            .map(([weaponId, stat]) => {
                const entry = getWeaponEntry(weaponId);
                const name = entry?.displayName || weaponId.toUpperCase();
                const wAcc = stat.shots > 0 ? (stat.hits / stat.shots) : 0;
                return `${name.padEnd(10, ' ')} shots:${stat.shots.toString().padStart(3, ' ')} hits:${stat.hits.toString().padStart(3, ' ')} acc:${(wAcc * 100).toFixed(1).padStart(5, ' ')}% dmg:${stat.damage.toString().padStart(4, ' ')} hs:${stat.headshots.toString().padStart(3, ' ')} kill:${stat.kills.toString().padStart(3, ' ')}`;
            });

        const dummyStateLines = this.dummyTargets.map((dummy) => {
            const dist = dummy.group.position.distanceTo(this.anchorPosition);
            return `${dummy.name} ${dummy.alive ? 'LIVE ' : 'RESP '} hp:${Math.floor(dummy.hp).toString().padStart(3, ' ')} ar:${Math.floor(dummy.armor).toString().padStart(3, ' ')} hits:${dummy.hitsTaken.toString().padStart(3, ' ')} dmg:${Math.floor(dummy.damageTaken).toString().padStart(4, ' ')} dist:${dist.toFixed(1)}m`;
        });

        this.metricsEl.textContent = [
            'FREE AIM TRAINER (DEV-ONLY)',
            `AK Runtime Tune: kick=${akTune.cameraKickMul.toFixed(2)}x | spread=${akTune.randomSpreadMul.toFixed(2)}x | pattern=${akTune.patternScaleMul.toFixed(2)}x | recovery=${akTune.recoveryMul.toFixed(2)}x`,
            `Session: ${elapsed.toFixed(1)}s | LastShotAt: ${this.freeLastShotAt > 0 ? this.freeLastShotAt.toFixed(2) : '-'}`,
            `Shots: ${this.freeShots} | Hits: ${this.freeHits} | Miss: ${misses} | Accuracy: ${(accuracy * 100).toFixed(2)}%`,
            `Damage: ${this.freeDamage} HP + ${this.freeArmorDamage} AR | DPS: ${dps.toFixed(2)} | DPM: ${dpm.toFixed(1)}`,
            `Kills: ${this.freeKills} | HS: ${this.freeHeadshots} (${(hsRatio * 100).toFixed(1)}%) | AvgTTK: ${avgTtk.toFixed(1)}ms | BestTTK: ${this.freeTtkCount > 0 ? this.freeTtkBestMs.toFixed(1) : '-'}`,
            `Hitgroups: HEAD ${this.freeHitgroupCount.HEAD} | CHEST ${this.freeHitgroupCount.CHEST} | STOM ${this.freeHitgroupCount.STOMACH} | ARM ${this.freeHitgroupCount.ARM} | LEG ${this.freeHitgroupCount.LEG}`,
            '',
            'Weapon Stats:',
            ...(weaponLines.length ? weaponLines : ['(no data)']),
            '',
            'Dummy States:',
            ...dummyStateLines,
        ].join('\n');
    }

    private computeShotSpacing(points: SprayPoint2D[]) {
        if (!Array.isArray(points) || points.length < 2) return { mean: 0, max: 0 };
        const steps: number[] = [];
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            steps.push(Math.hypot(dx, dy));
        }
        const sum = steps.reduce((acc, value) => acc + value, 0);
        return {
            mean: steps.length > 0 ? sum / steps.length : 0,
            max: steps.length > 0 ? Math.max(...steps) : 0,
        };
    }

    private pointHitsSilhouette(point: SprayPoint2D, distance: SprayDistanceMeters) {
        if (distance !== SILHOUETTE_TEST_DISTANCE) return false;
        const x = Number(point.x) || 0;
        const y = Number(point.y) || 0;

        const head = ((x / 0.26) ** 2) + (((y + 0.1) / 0.22) ** 2) <= 1;
        const body = ((x / 0.85) ** 2) + (((y + 1.62) / 1.68) ** 2) <= 1;
        return head || body;
    }

    private computeSilhouetteStats(points: SprayPoint2D[], distance: SprayDistanceMeters) {
        if (!Array.isArray(points) || points.length === 0) return { hitCount: 0, hitRatio: 0 };
        if (distance !== SILHOUETTE_TEST_DISTANCE) return { hitCount: 0, hitRatio: 0 };
        let hitCount = 0;
        for (const point of points) {
            if (this.pointHitsSilhouette(point, distance)) hitCount += 1;
        }
        return {
            hitCount,
            hitRatio: points.length > 0 ? Math.max(0, Math.min(1, hitCount / points.length)) : 0,
        };
    }

    private runMatrix() {
        if (!this.modeActive || this.activeRun || this.matrixActive) return;
        if (this.isFreeModeActive()) {
            this.setStatus('RUN MATRIX free mode icinde kapali. Mode -> calibration sec.');
            return;
        }
        this.dispatchTriggerUp();

        const queue: MatrixQueueItem[] = [];
        SPRAY_LAB_WEAPON_IDS.forEach((weaponIdRaw) => {
            const weaponId = normalizeWeaponId(weaponIdRaw);
            const states: SprayScopeState[] = ['unscoped'];
            if (isScopedStateSupported(weaponId)) states.push('scoped');
            states.forEach((state) => {
                SPRAY_LAB_DISTANCES.forEach((distance) => {
                    queue.push({ weaponId, state, distance });
                });
            });
        });

        if (!queue.length) {
            this.setStatus('Matrix queue is empty.');
            return;
        }

        this.matrixQueue = queue;
        this.matrixRows = [];
        this.matrixInvalidCaptures = [];
        this.matrixCompletedCount = 0;
        this.matrixActive = true;
        this.matrixTotalCount = queue.length;
        this.matrixStartPerfMs = performance.now();
        this.matrixNextRunAtMs = this.matrixStartPerfMs + MATRIX_START_DELAY_MS;
        this.lastMatrixResult = null;

        this.updateMatrixProgress();
        this.setStatus(`Matrix queued: ${this.matrixTotalCount} live runs.`);
        this.metricsEl.textContent = [
            `Matrix Mode: LIVE`,
            `Queue: ${this.matrixTotalCount} runs`,
            `Reference: ${REFERENCE_SOURCE} (${REFERENCE_SOURCE_TYPE} @ ${REFERENCE_VERSION})`,
            `Gate: ${REFERENCE_IS_EXTERNAL ? 'STRICT-EXTERNAL OK' : 'STRICT-EXTERNAL FAIL (runs invalid)'}`,
        ].join('\n');
        this.refreshActionButtons();
        this.renderHistory();
        this.renderOverlay();
    }

    private finishMatrix() {
        if (!this.matrixActive) return;
        this.matrixActive = false;
        this.matrixQueue = [];

        const rows = [...this.matrixRows];
        const invalidCaptures = [...this.matrixInvalidCaptures];
        const passCount = rows.filter((row) => row.pass).length;
        this.lastMatrixResult = {
            generatedAt: new Date().toISOString(),
            reference: REFERENCE_SOURCE,
            referenceSourceType: REFERENCE_SOURCE_TYPE,
            referenceVersion: REFERENCE_VERSION,
            rows,
            invalidCaptures,
            validCount: rows.length,
            invalidCount: invalidCaptures.length,
            passCount,
            totalCount: this.matrixTotalCount,
        };

        const elapsedSeconds = Math.max(0, (performance.now() - this.matrixStartPerfMs) / 1000);
        const worstRows = [...rows]
            .sort((a, b) => (b.rmseAll - a.rmseAll))
            .slice(0, 4)
            .map((row) => `${row.weaponId} ${row.state} ${row.distance}m => rmseAll ${row.rmseAll.toFixed(3)} | max ${row.maxError.toFixed(3)} | ${row.pass ? 'PASS' : 'FAIL'}`);

        this.metricsEl.textContent = [
            `Matrix Result: ${passCount}/${rows.length} pass (valid ${rows.length}, invalid ${invalidCaptures.length}, total ${this.matrixTotalCount})`,
            `Duration: ${elapsedSeconds.toFixed(1)}s`,
            `Reference: ${REFERENCE_SOURCE} (${REFERENCE_SOURCE_TYPE} @ ${REFERENCE_VERSION})`,
            ...(worstRows.length ? ['', 'Worst deltas:', ...worstRows] : []),
        ].join('\n');

        this.updateMatrixProgress();
        this.setStatus(`Matrix complete: pass ${passCount}/${rows.length} | invalid ${invalidCaptures.length} | total ${this.matrixTotalCount}.`);
        this.refreshActionButtons();
        this.renderHistory();
        this.renderOverlay();
    }

    private stopMatrix(reason = 'Matrix stopped.') {
        if (!this.matrixActive && !this.activeRun) return;

        this.matrixActive = false;
        this.matrixQueue = [];
        this.matrixTotalCount = Math.max(this.matrixTotalCount, this.matrixRows.length);

        if (this.activeRun) {
            this.stopRunInternals();
        }

        this.updateMatrixProgress();
        this.setStatus(reason);
        this.refreshActionButtons();
        this.renderHistory();
    }

    private clearRuns() {
        if (this.activeRun || this.matrixActive) return;
        if (this.isFreeModeActive()) {
            this.resetFreeTrainerStats(true);
            this.setStatus('Free trainer stats cleared.');
            return;
        }
        this.runHistory = [];
        this.lastRun = null;
        this.lastMatrixResult = null;
        this.matrixRows = [];
        this.matrixInvalidCaptures = [];
        this.matrixCompletedCount = 0;
        this.matrixTotalCount = 0;
        this.metricsEl.textContent = '';
        this.updateMatrixProgress();
        this.setStatus('Spray runs cleared.');
        this.renderHistory();
        this.refreshActionButtons();
        this.renderOverlay();
    }

    private isFreeModeActive() {
        return this.modeActive && ENABLE_SPRAY_LAB_FREE_MODE && this.viewMode === 'free';
    }

    private matrixComboKey(weaponId: string, state: SprayScopeState, distance: SprayDistanceMeters) {
        return `${normalizeWeaponId(weaponId)}|${state}|${distance}`;
    }

    private getExpectedMatrixCombos(): MatrixQueueItem[] {
        const combos: MatrixQueueItem[] = [];
        SPRAY_LAB_WEAPON_IDS.forEach((weaponIdRaw) => {
            const weaponId = normalizeWeaponId(weaponIdRaw);
            const states: SprayScopeState[] = ['unscoped'];
            if (isScopedStateSupported(weaponId)) states.push('scoped');
            states.forEach((state) => {
                SPRAY_LAB_DISTANCES.forEach((distance) => {
                    combos.push({ weaponId, state, distance });
                });
            });
        });
        return combos;
    }

    private getRequiredValidationComboKeys() {
        const keys = new Set<string>();
        SPRAY_LAB_VALIDATION_WEAPON_IDS.forEach((weaponIdRaw) => {
            const weaponId = normalizeWeaponId(weaponIdRaw);
            SPRAY_LAB_DISTANCES.forEach((distance) => {
                keys.add(this.matrixComboKey(weaponId, 'unscoped', distance));
            });
        });
        return keys;
    }

    private hasCompleteMatrixCoverage() {
        const expectedCount = this.getExpectedMatrixCombos().length;
        if (!this.lastMatrixResult) return false;
        if (this.lastMatrixResult.totalCount !== expectedCount) return false;
        if (this.lastMatrixResult.validCount !== expectedCount || this.lastMatrixResult.rows.length !== expectedCount) return false;
        if (this.lastMatrixResult.invalidCount > 0) return false;

        const requiredKeys = this.getRequiredValidationComboKeys();
        const rowKeys = new Set(
            this.lastMatrixResult.rows.map((row) => this.matrixComboKey(row.weaponId, row.state, row.distance)),
        );
        const missingRequired = [...requiredKeys].filter((key) => !rowKeys.has(key));
        return missingRequired.length === 0;
    }

    private findLastRunByCombo(weaponId: string, state: SprayScopeState, distance: SprayDistanceMeters) {
        const normalizedWeapon = normalizeWeaponId(weaponId);
        for (let i = this.runHistory.length - 1; i >= 0; i--) {
            const run = this.runHistory[i];
            if (run.weaponId === normalizedWeapon && run.state === state && run.distance === distance) return run;
        }
        return null;
    }

    private canExportSuite() {
        if (this.matrixActive || this.activeRun) {
            return { ok: false, reason: 'Matrix veya run aktifken export alinamaz. Once testi tamamla.' };
        }
        if (!REFERENCE_IS_EXTERNAL) {
            return { ok: false, reason: `Strict reference gate: external zorunlu (current=${REFERENCE_SOURCE_TYPE}).` };
        }

        // Full matrix varsa final suite export davranisini koru.
        if (this.hasCompleteMatrixCoverage()) {
            return { ok: true, reason: '' };
        }

        // Matrix olmadan secili combo icin tekli export izni.
        const weaponId = normalizeWeaponId(this.weaponSelectEl.value);
        const state = toScopeState(this.stateSelectEl.value);
        const distance = toDistance(this.distanceSelectEl.value);
        const run = this.findLastRunByCombo(weaponId, state, distance);
        if (!run) {
            return { ok: false, reason: 'Tekli export icin secili silahla once RUN calistir. Tum paket icin RUN MATRIX kullan.' };
        }

        const quality = run.captureQuality || {
            valid: false,
            hitRatio: run.shotGoal > 0 ? Math.max(0, Math.min(1, run.points.length / run.shotGoal)) : 0,
            reason: 'quality-not-evaluated',
        };
        if (!quality.valid) {
            return { ok: false, reason: `Secili run invalid: ${quality.reason}. RUN ile tekrar olc.` };
        }

        const referenceLookup = getReferencePatternStrict(
            REFERENCE_PATTERNS,
            run.weaponId,
            run.state,
            run.distance,
            run.shotGoal,
        );
        if (!referenceLookup.found) {
            return { ok: false, reason: `Reference eksik: ${referenceLookup.reason}` };
        }

        return { ok: true, reason: '' };
    }

    private buildSuiteExport(expectedCombos: MatrixQueueItem[] = this.getExpectedMatrixCombos()): SpraySuiteExport {
        const generatedAt = new Date().toISOString();
        const expected = expectedCombos;
        const expectedCount = expected.length;

        const latestRunByCombo = new Map<string, SprayRunRecord>();
        for (let i = this.runHistory.length - 1; i >= 0; i--) {
            const run = this.runHistory[i];
            const key = this.matrixComboKey(run.weaponId, run.state, run.distance);
            if (!latestRunByCombo.has(key)) latestRunByCombo.set(key, run);
        }

        const combos: SpraySuiteCombo[] = expected.map((combo) => {
            const key = this.matrixComboKey(combo.weaponId, combo.state, combo.distance);
            const run = latestRunByCombo.get(key);
            const entry = getWeaponEntry(combo.weaponId);
            const weaponName = entry?.displayName || combo.weaponId.toUpperCase();
            const shotGoal = run?.shotGoal || getMagazineSize(combo.weaponId);

            if (!run) {
                return {
                    key,
                    weaponId: combo.weaponId,
                    weaponName,
                    state: combo.state,
                    distance: combo.distance,
                    shotGoal,
                    hitCount: 0,
                    firedShots: 0,
                    wallHits: 0,
                    misses: shotGoal,
                    hitRatio: 0,
                    captureMode: 'simulated',
                    validReason: 'missing-run-for-combo',
                    shotSpacingMean: 0,
                    shotSpacingMax: 0,
                    silhouetteHitCount: 0,
                    silhouetteHitRatio: 0,
                    valid: false,
                    pass: false,
                    invalidReason: 'missing-run-for-combo',
                    captureQuality: { valid: false, hitRatio: 0, reason: 'missing-run-for-combo' },
                    metrics: null,
                    current: [],
                    reference: [],
                    delta: [],
                };
            }

            const current = this.toIndexedPoints(run);
            const referenceLookup = getReferencePatternStrict(
                REFERENCE_PATTERNS,
                run.weaponId,
                run.state,
                run.distance,
                run.shotGoal,
            );
            const reference = referenceLookup.pattern;
            const deltas: Array<{ shotIndex: number; dx: number; dy: number; error: number }> = [];
            const len = Math.min(current.length, reference.length);
            for (let i = 0; i < len; i++) {
                const dx = current[i].x - reference[i].x;
                const dy = current[i].y - reference[i].y;
                deltas.push({
                    shotIndex: i + 1,
                    dx,
                    dy,
                    error: Math.hypot(dx, dy),
                });
            }

            const quality = run.captureQuality || {
                valid: false,
                hitRatio: run.shotGoal > 0 ? Math.max(0, Math.min(1, run.points.length / run.shotGoal)) : 0,
                reason: 'quality-not-evaluated',
            };

            const metrics = run.metrics || (referenceLookup.found
                ? compareSprayPattern({
                    weaponId: run.weaponId,
                    state: run.state,
                    distance: run.distance,
                    current,
                    reference,
                })
                : null);

            const valid = !!quality.valid && referenceLookup.found && REFERENCE_IS_EXTERNAL;
            const pass = !!metrics?.pass && valid;
            const invalidReason = valid
                ? ''
                : (!quality.valid
                    ? quality.reason
                    : (!REFERENCE_IS_EXTERNAL
                        ? `reference-source-not-external (${REFERENCE_SOURCE_TYPE})`
                        : referenceLookup.reason));

            return {
                key,
                weaponId: run.weaponId,
                weaponName: run.weaponName,
                state: run.state,
                distance: run.distance,
                shotGoal: run.shotGoal,
                hitCount: run.points.length,
                firedShots: run.firedShots,
                wallHits: run.wallHits,
                misses: run.misses,
                hitRatio: quality.hitRatio,
                captureMode: run.captureMode,
                validReason: run.validReason || quality.reason,
                shotSpacingMean: run.shotSpacingMean,
                shotSpacingMax: run.shotSpacingMax,
                silhouetteHitCount: run.silhouetteHitCount,
                silhouetteHitRatio: run.silhouetteHitRatio,
                valid,
                pass,
                invalidReason,
                captureQuality: quality,
                metrics,
                current,
                reference,
                delta: deltas,
            };
        });

        const validCount = combos.filter((combo) => combo.valid).length;
        const invalidCount = expectedCount - validCount;
        const passCount = combos.filter((combo) => combo.pass).length;

        return {
            generatedAt,
            reference: REFERENCE_SOURCE,
            referenceSourceType: REFERENCE_SOURCE_TYPE,
            referenceVersion: REFERENCE_VERSION,
            expectedCount,
            totalCount: combos.length,
            validCount,
            invalidCount,
            passCount,
            allValidCoverage: combos.length === expectedCount && invalidCount === 0,
            allPass: combos.length === expectedCount && passCount === expectedCount,
            combos,
        };
    }

    private toInlineJson(value: any) {
        return JSON.stringify(value)
            .replaceAll('</script>', '<\\/script>')
            .replaceAll('\u2028', '\\u2028')
            .replaceAll('\u2029', '\\u2029');
    }

    private renderSuiteHtml(suite: SpraySuiteExport) {
        const suiteJson = this.toInlineJson(suite);
        return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Spray Suite Export</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:18px;background:#0b111a;color:#e6efff;font-family:ui-monospace,Consolas,monospace}
h1{margin:0 0 8px 0;font-size:26px;letter-spacing:.04em}
.sub{opacity:.75;margin-bottom:14px}
.summary{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:8px;margin:12px 0 16px}
.pill{background:#111b2a;border:1px solid #2a3a55;border-radius:8px;padding:10px 12px}
.pill b{display:block;color:#86ffe3;font-size:18px}
table{width:100%;border-collapse:collapse;margin:8px 0 18px;background:#0f1724;border:1px solid #25344d}
th,td{font-size:12px;padding:7px 8px;border-bottom:1px solid #1c2940;text-align:left}
th{background:#121f33;color:#acc8f7}
tr.invalid{background:rgba(255,100,100,.09)}
tr.pass td:last-child{color:#7affc9}
tr.fail td:last-child{color:#ff9b9b}
.grid{display:grid;grid-template-columns:repeat(2,minmax(480px,1fr));gap:12px}
.card{background:#0f1724;border:1px solid #22334f;border-radius:10px;padding:10px}
.card.invalid{border-color:#5b2a35;background:linear-gradient(180deg,#101924,#14121a)}
.card h3{margin:0 0 8px 0;font-size:15px;letter-spacing:.02em}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.meta span{font-size:11px;padding:3px 7px;border-radius:999px;background:#122238;border:1px solid #263f60;color:#c8dbff}
.meta .bad{background:#34131b;border-color:#6e2a3b;color:#ffb8c6}
.meta .good{background:#103125;border-color:#2f785e;color:#95ffd1}
canvas{width:100%;height:250px;display:block;border:1px solid #2a3e5e;background:#0d1420;border-radius:8px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(80px,1fr));gap:6px;margin-top:8px}
.stats div{background:#111b2b;border:1px solid #273a58;border-radius:7px;padding:5px 7px;font-size:11px}
.stats b{display:block;font-size:13px;color:#f6d882}
.reason{margin-top:8px;font-size:11px;color:#ffb7c3}
@media (max-width:1200px){.grid{grid-template-columns:1fr}.summary{grid-template-columns:repeat(3,minmax(120px,1fr))}}
</style>
</head>
<body>
<h1>SPRAY SUITE EXPORT</h1>
<div class="sub">Reference: ${this.escapeHtml(suite.reference)} (${this.escapeHtml(suite.referenceSourceType)} @ ${this.escapeHtml(suite.referenceVersion)}) | Generated: ${this.escapeHtml(suite.generatedAt)}</div>
<div class="summary" id="summary"></div>
<table>
<thead><tr><th>#</th><th>Weapon</th><th>State</th><th>Dist</th><th>Hits</th><th>Wall</th><th>Silhouette</th><th>Spacing(mean/max)</th><th>RMSE</th><th>MAX</th><th>Valid</th><th>Pass</th></tr></thead>
<tbody id="rows"></tbody>
</table>
<div class="grid" id="grid"></div>
<script>
const suite = ${suiteJson};
const fmt = (v, d=3) => Number.isFinite(v) ? Number(v).toFixed(d) : '-';
const summary = document.getElementById('summary');
const rows = document.getElementById('rows');
const grid = document.getElementById('grid');
summary.innerHTML = [
  ['Expected', suite.expectedCount],
  ['Total', suite.totalCount],
  ['Valid', suite.validCount],
  ['Invalid', suite.invalidCount],
  ['Pass', suite.passCount],
  ['All Valid', suite.allValidCoverage ? 'YES' : 'NO'],
].map(([k,v]) => '<div class="pill"><span>'+k+'</span><b>'+v+'</b></div>').join('');

function drawPattern(ctx, pts, toCanvas, lineColor, dotColor) {
  if (!pts || !pts.length) return;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = toCanvas(p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  pts.forEach((p, i) => {
    const q = toCanvas(p);
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(q.x, q.y, i === 0 ? 3.5 : 2.3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSilhouetteGuide(ctx, toCanvas) {
  const drawEllipse = (cx, cy, rx, ry) => {
    const seg = 48;
    ctx.beginPath();
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const p = toCanvas({ x: cx + (Math.cos(t) * rx), y: cy + (Math.sin(t) * ry) });
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(156, 208, 255, 0.08)';
  ctx.strokeStyle = 'rgba(156, 208, 255, 0.45)';
  ctx.lineWidth = 1.2;
  drawEllipse(0, -1.62, 0.85, 1.68);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(189, 226, 255, 0.12)';
  drawEllipse(0, -0.1, 0.26, 0.22);
  ctx.fill();
  ctx.stroke();
}

function drawCombo(canvas, combo) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0f1623';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * w;
    const y = (i / 10) * h;
    ctx.strokeStyle = i === 5 ? 'rgba(222,236,255,0.26)' : 'rgba(136,164,206,0.15)';
    ctx.lineWidth = i === 5 ? 1.6 : 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const points = [];
  if (Array.isArray(combo.current)) points.push(...combo.current);
  if (Array.isArray(combo.reference)) points.push(...combo.reference);
  const maxAbs = points.reduce((m, p) => Math.max(m, Math.abs(p.x || 0), Math.abs(p.y || 0)), 1.2);
  const scale = (Math.min(w, h) * 0.42) / maxAbs;
  const toCanvas = (p) => ({ x: (w * 0.5) + (p.x * scale), y: (h * 0.5) + (p.y * scale) });
  if (Number(combo.distance) === 10) drawSilhouetteGuide(ctx, toCanvas);

  const buildComp = (pts) => {
    if (!Array.isArray(pts) || pts.length < 2) return [];
    const out = [{ x: 0, y: 0 }];
    let cx = 0;
    let cy = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = (pts[i].x || 0) - (pts[i - 1].x || 0);
      const dy = (pts[i].y || 0) - (pts[i - 1].y || 0);
      cx -= dx;
      cy -= dy;
      out.push({ x: cx, y: cy });
    }
    return out;
  };

  drawPattern(ctx, combo.reference || [], toCanvas, '#efc85b', '#ffeab2');
  drawPattern(ctx, combo.current || [], toCanvas, '#5bd9ff', '#d4f6ff');
  drawPattern(ctx, buildComp(combo.reference || []), toCanvas, 'rgba(255,96,140,0.72)', 'rgba(255,186,211,0.95)');
  const len = Math.min((combo.current || []).length, (combo.reference || []).length);
  for (let i = 0; i < len; i++) {
    const c = toCanvas(combo.current[i]);
    const r = toCanvas(combo.reference[i]);
    const err = Math.hypot((combo.current[i].x - combo.reference[i].x), (combo.current[i].y - combo.reference[i].y));
    const alpha = Math.min(0.95, 0.18 + (err / 10));
    ctx.strokeStyle = 'rgba(255,110,110,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(236,244,255,0.9)';
  ctx.font = '11px monospace';
  ctx.fillText('Current(Blue) / Reference(Gold) / Delta(Red) / Compensation(Pink)', 8, 15);
}

suite.combos.forEach((combo, idx) => {
  const tr = document.createElement('tr');
  tr.className = (combo.valid ? '' : 'invalid ') + (combo.pass ? 'pass' : 'fail');
  tr.innerHTML = '<td>'+(idx+1)+'</td>'
    + '<td>'+combo.weaponName+'</td>'
    + '<td>'+combo.state+'</td>'
    + '<td>'+combo.distance+'m</td>'
    + '<td>'+combo.hitCount+'/'+combo.shotGoal+'</td>'
    + '<td>'+combo.wallHits+'/'+combo.firedShots+'</td>'
    + '<td>'+combo.silhouetteHitCount+'/'+combo.shotGoal+' ('+fmt(combo.silhouetteHitRatio,3)+')</td>'
    + '<td>'+fmt(combo.shotSpacingMean,4)+' / '+fmt(combo.shotSpacingMax,4)+'</td>'
    + '<td>'+fmt(combo.metrics?.rmseAll)+'</td>'
    + '<td>'+fmt(combo.metrics?.maxError)+'</td>'
    + '<td>'+(combo.valid ? 'YES' : 'NO')+'</td>'
    + '<td>'+(combo.pass ? 'PASS' : 'FAIL')+'</td>';
  rows.appendChild(tr);

  const card = document.createElement('section');
  card.className = 'card' + (combo.valid ? '' : ' invalid');
  card.innerHTML = '<h3>'+combo.weaponName+' - '+combo.state.toUpperCase()+' - '+combo.distance+'m</h3>'
    + '<div class="meta">'
    + '<span>' + combo.weaponId + '</span>'
    + '<span>capture=' + combo.captureMode + '</span>'
    + '<span>' + combo.firedShots + ' fired</span>'
    + '<span>' + combo.hitCount + '/' + combo.shotGoal + ' hit</span>'
    + '<span>' + combo.wallHits + '/' + combo.firedShots + ' wall</span>'
    + '<span>' + combo.misses + ' miss</span>'
    + '<span>' + combo.silhouetteHitCount + '/' + combo.shotGoal + ' silhouette</span>'
    + '<span class="' + (combo.valid ? 'good' : 'bad') + '">VALID: ' + (combo.valid ? 'YES' : 'NO') + '</span>'
    + '<span class="' + (combo.pass ? 'good' : 'bad') + '">PASS: ' + (combo.pass ? 'YES' : 'NO') + '</span>'
    + '</div>'
    + '<canvas width="420" height="250"></canvas>'
    + '<div class="stats">'
    + '<div><span>RMSE 1..10</span><b>' + fmt(combo.metrics?.rmseFirst10) + '</b></div>'
    + '<div><span>RMSE 1..30</span><b>' + fmt(combo.metrics?.rmseFirst30) + '</b></div>'
    + '<div><span>RMSE All</span><b>' + fmt(combo.metrics?.rmseAll) + '</b></div>'
    + '<div><span>MAX</span><b>' + fmt(combo.metrics?.maxError) + '</b></div>'
    + '<div><span>Silhouette</span><b>' + combo.silhouetteHitCount + '/' + combo.shotGoal + '</b></div>'
    + '<div><span>Spacing Mean</span><b>' + fmt(combo.shotSpacingMean, 4) + '</b></div>'
    + '<div><span>Spacing Max</span><b>' + fmt(combo.shotSpacingMax, 4) + '</b></div>'
    + '<div><span>Valid Reason</span><b>' + (combo.valid ? 'ok' : (combo.validReason || combo.invalidReason || 'n/a')) + '</b></div>'
    + '</div>'
    + (combo.invalidReason ? '<div class="reason">Reason: ' + combo.invalidReason + '</div>' : '');
  grid.appendChild(card);
  drawCombo(card.querySelector('canvas'), combo);
});
</script>
</body>
</html>`;
    }

    private buildFreeTrainerExport() {
        const elapsed = Math.max(0, GameContext.GameLoop.Clock.getElapsedTime() - this.freeSessionStartedAt);
        const byWeapon = [...this.freeWeaponStats.entries()].map(([weaponId, stats]) => ({
            weaponId,
            weaponName: getWeaponEntry(weaponId)?.displayName || weaponId.toUpperCase(),
            ...stats,
            accuracy: stats.shots > 0 ? stats.hits / stats.shots : 0,
        }));
        const akTune = getAkRuntimeTune();
        return {
            generatedAt: new Date().toISOString(),
            sessionSeconds: elapsed,
            akRuntimeTune: akTune,
            totals: {
                shots: this.freeShots,
                hits: this.freeHits,
                misses: Math.max(0, this.freeShots - this.freeHits),
                accuracy: this.freeShots > 0 ? this.freeHits / this.freeShots : 0,
                damage: this.freeDamage,
                armorDamage: this.freeArmorDamage,
                kills: this.freeKills,
                headshots: this.freeHeadshots,
                hsRatio: this.freeHits > 0 ? this.freeHeadshots / this.freeHits : 0,
                avgTtkMs: this.freeTtkCount > 0 ? this.freeTtkTotalMs / this.freeTtkCount : 0,
                bestTtkMs: this.freeTtkCount > 0 ? this.freeTtkBestMs : 0,
            },
            hitgroups: { ...this.freeHitgroupCount },
            dummies: this.dummyTargets.map((dummy) => ({
                id: dummy.id,
                name: dummy.name,
                alive: dummy.alive,
                hp: dummy.hp,
                armor: dummy.armor,
                hitsTaken: dummy.hitsTaken,
                damageTaken: dummy.damageTaken,
                position: {
                    x: dummy.group.position.x,
                    y: dummy.group.position.y,
                    z: dummy.group.position.z,
                },
            })),
            byWeapon,
            hits: [...this.freeHitLog],
        };
    }

    private renderFreeTrainerHtml(report: ReturnType<SprayLabSystem['buildFreeTrainerExport']>) {
        const reportJson = this.toInlineJson(report);
        return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Spray Free Trainer Export</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:18px;background:#0b111a;color:#e6efff;font-family:ui-monospace,Consolas,monospace}
h1{margin:0 0 8px 0;font-size:24px;letter-spacing:.03em}
.sub{opacity:.78;margin-bottom:12px}
.summary{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:8px;margin:10px 0 16px}
.pill{background:#111b2a;border:1px solid #2a3a55;border-radius:8px;padding:10px 12px}
.pill b{display:block;color:#86ffe3;font-size:18px}
table{width:100%;border-collapse:collapse;margin:8px 0 18px;background:#0f1724;border:1px solid #25344d}
th,td{font-size:12px;padding:7px 8px;border-bottom:1px solid #1c2940;text-align:left}
th{background:#121f33;color:#acc8f7}
.mono{font-family:ui-monospace,Consolas,monospace}
</style>
</head>
<body>
<h1>SPRAY LAB FREE TRAINER EXPORT</h1>
<div class="sub">Generated: ${this.escapeHtml(report.generatedAt)} | Session: ${report.sessionSeconds.toFixed(2)}s | AK tune kick=${report.akRuntimeTune.cameraKickMul.toFixed(2)}x spread=${report.akRuntimeTune.randomSpreadMul.toFixed(2)}x pattern=${report.akRuntimeTune.patternScaleMul.toFixed(2)}x recovery=${report.akRuntimeTune.recoveryMul.toFixed(2)}x</div>
<div class="summary" id="summary"></div>
<h3>Weapon Breakdown</h3>
<table><thead><tr><th>Weapon</th><th>Shots</th><th>Hits</th><th>Acc</th><th>Dmg</th><th>HS</th><th>Kills</th></tr></thead><tbody id="weapons"></tbody></table>
<h3>Hit Log (Last ${FREE_HIT_LOG_LIMIT})</h3>
<table><thead><tr><th>Time</th><th>Weapon</th><th>Dummy</th><th>Part</th><th>HPDMG</th><th>ARDMG</th><th>HP</th><th>AR</th><th>Dist</th><th>Kill</th></tr></thead><tbody id="hits"></tbody></table>
<script>
const report = ${reportJson};
const summary = document.getElementById('summary');
summary.innerHTML = [
  ['Shots', report.totals.shots],
  ['Hits', report.totals.hits],
  ['Accuracy', (report.totals.accuracy*100).toFixed(2)+'%'],
  ['Damage', report.totals.damage],
  ['Headshots', report.totals.headshots],
  ['Kills', report.totals.kills],
].map(([k,v]) => '<div class="pill"><span>'+k+'</span><b>'+v+'</b></div>').join('');
const weaponRows = document.getElementById('weapons');
report.byWeapon.sort((a,b)=>b.damage-a.damage).forEach((row)=>{
  const tr = document.createElement('tr');
  tr.innerHTML = '<td>'+row.weaponName+'</td>'
    + '<td>'+row.shots+'</td>'
    + '<td>'+row.hits+'</td>'
    + '<td>'+(row.accuracy*100).toFixed(2)+'%</td>'
    + '<td>'+row.damage+'</td>'
    + '<td>'+row.headshots+'</td>'
    + '<td>'+row.kills+'</td>';
  weaponRows.appendChild(tr);
});
const hitRows = document.getElementById('hits');
report.hits.slice().reverse().forEach((hit) => {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td class="mono">'+Number(hit.at).toFixed(2)+'</td>'
    + '<td>'+hit.weaponName+'</td>'
    + '<td>'+hit.dummyName+'</td>'
    + '<td>'+hit.hitgroup+'</td>'
    + '<td>'+Math.round(hit.healthDamage)+'</td>'
    + '<td>'+Math.round(hit.armorDamage)+'</td>'
    + '<td>'+Math.round(hit.hpAfter)+'</td>'
    + '<td>'+Math.round(hit.armorAfter)+'</td>'
    + '<td>'+Number(hit.distance).toFixed(2)+'m</td>'
    + '<td>'+(hit.kill?'YES':'-')+'</td>';
  hitRows.appendChild(tr);
});
</script>
</body>
</html>`;
    }

    private exportReports() {
        if (this.isFreeModeActive()) {
            if (this.freeShots <= 0 && this.freeHitLog.length <= 0) {
                this.setStatus('Free trainer export icin once dummy test yap.');
                return;
            }
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const freeReport = this.buildFreeTrainerExport();
            this.downloadFile(`spray-free-trainer-${stamp}.html`, this.renderFreeTrainerHtml(freeReport), 'text/html');
            if (ENABLE_DEBUG_SPRAY_EXPORT_JSON) {
                this.downloadFile(`spray-free-trainer-${stamp}.json`, JSON.stringify(freeReport, null, 2), 'application/json');
            }
            this.setStatus(`Exported spray-free-trainer-${stamp}.html.`);
            return;
        }

        const gate = this.canExportSuite();
        if (!gate.ok) {
            this.setStatus(gate.reason);
            return;
        }

        const selectedCombo: MatrixQueueItem = {
            weaponId: normalizeWeaponId(this.weaponSelectEl.value),
            state: toScopeState(this.stateSelectEl.value),
            distance: toDistance(this.distanceSelectEl.value),
        };
        const exportFullMatrix = this.hasCompleteMatrixCoverage();
        const suite = this.buildSuiteExport(exportFullMatrix ? this.getExpectedMatrixCombos() : [selectedCombo]);
        if (!suite.allValidCoverage) {
            this.setStatus(`Export aborted: valid coverage ${suite.validCount}/${suite.expectedCount}.`);
            return;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const suiteHtml = this.renderSuiteHtml(suite);
        this.downloadFile(`spray-suite-${stamp}.html`, suiteHtml, 'text/html');

        if (ENABLE_DEBUG_SPRAY_EXPORT_JSON) {
            this.downloadFile(`spray-suite-${stamp}.json`, JSON.stringify(suite, null, 2), 'application/json');
        }

        this.setStatus(`Exported spray-suite-${stamp}.html (${exportFullMatrix ? 'matrix' : 'single'})${ENABLE_DEBUG_SPRAY_EXPORT_JSON ? ' (+debug json)' : ''}.`);
    }

    private renderOverlay() {
        const ctx = this.canvasEl.getContext('2d');
        if (!ctx) return;

        const width = this.canvasEl.width;
        const height = this.canvasEl.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#0f1624';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i <= 10; i++) {
            const x = (i / 10) * width;
            const y = (i / 10) * height;
            ctx.strokeStyle = i === 5 ? 'rgba(224,236,255,0.28)' : 'rgba(144,166,198,0.14)';
            ctx.lineWidth = i === 5 ? 1.8 : 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        if (this.isFreeModeActive()) {
            this.drawFreeTrainerOverlay(ctx, width, height);
            return;
        }

        const run = this.activeRun || this.findLastRunForSelection();
        if (!run) {
            ctx.fillStyle = 'rgba(236, 244, 255, 0.72)';
            ctx.font = '13px monospace';
            ctx.fillText('No run data yet. Press RUN.', 14, 22);
            return;
        }

        const referenceLookup = getReferencePatternStrict(
            REFERENCE_PATTERNS,
            run.weaponId,
            run.state,
            run.distance,
            run.shotGoal,
        );
        const reference = referenceLookup.pattern;
        const current = this.toIndexedPoints(run);

        const viewPoints: SprayPoint2D[] = [];
        if (this.overlayMode !== 'reference') viewPoints.push(...current);
        if (this.overlayMode !== 'current' && referenceLookup.found) viewPoints.push(...reference);

        const maxAbs = viewPoints.reduce((max, point) => Math.max(max, Math.abs(point.x), Math.abs(point.y)), 1.2);
        const scale = (Math.min(width, height) * 0.42) / maxAbs;

        const toCanvas = (point: SprayPoint2D) => ({
            x: width * 0.5 + point.x * scale,
            y: height * 0.5 + point.y * scale,
        });

        if (run.distance === SILHOUETTE_TEST_DISTANCE) {
            this.drawSilhouetteGuide(ctx, toCanvas);
        }

        if (this.overlayMode !== 'reference') {
            this.drawPattern(ctx, current, toCanvas, '#59d8ff', '#cbf4ff');
        }
        if (this.overlayMode !== 'current' && referenceLookup.found) {
            this.drawPattern(ctx, reference, toCanvas, '#f2d061', '#fff4cc');
        }
        if (referenceLookup.found) {
            const compensation = this.buildCompensationPath(reference);
            this.drawPattern(ctx, compensation, toCanvas, 'rgba(255, 109, 159, 0.72)', 'rgba(255, 197, 222, 0.95)');
        }
        if (this.overlayMode === 'delta' && referenceLookup.found) {
            const len = Math.min(current.length, reference.length);
            for (let i = 0; i < len; i++) {
                const c = toCanvas(current[i]);
                const r = toCanvas(reference[i]);
                const err = Math.hypot(current[i].x - reference[i].x, current[i].y - reference[i].y);
                const alpha = Math.min(0.95, 0.18 + err / 10);
                ctx.strokeStyle = `rgba(255, 123, 123, ${alpha.toFixed(3)})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(c.x, c.y);
                ctx.lineTo(r.x, r.y);
                ctx.stroke();
            }
        }

        ctx.fillStyle = 'rgba(236, 244, 255, 0.82)';
        ctx.font = '11px monospace';
        ctx.fillText(`Current: ${run.weaponName} | ${run.state} | ${run.distance}m`, 12, 16);
        ctx.fillText(`Overlay: ${this.overlayMode.toUpperCase()} | Shots ${run.points.length}/${run.shotGoal} | Wall ${run.wallHits}/${run.firedShots} | Miss ${run.misses}`, 12, 32);
        ctx.fillText(`Silhouette: ${run.silhouetteHitCount}/${run.shotGoal} (${run.silhouetteHitRatio.toFixed(3)}) | Spacing ${run.shotSpacingMean.toFixed(4)}/${run.shotSpacingMax.toFixed(4)}`, 12, 48);
        if (!referenceLookup.found) {
            ctx.fillStyle = 'rgba(255, 168, 168, 0.92)';
            ctx.fillText(`REFERENCE MISSING: ${referenceLookup.reason}`, 12, 64);
        }
    }
    private drawPattern(
        ctx: CanvasRenderingContext2D,
        pattern: SprayPoint2D[],
        toCanvas: (point: SprayPoint2D) => { x: number; y: number },
        lineColor: string,
        labelColor: string,
    ) {
        if (!pattern.length) return;

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        pattern.forEach((point, index) => {
            const p = toCanvas(point);
            if (index === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        pattern.forEach((point, index) => {
            const p = toCanvas(point);
            ctx.fillStyle = lineColor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, index === 0 ? 4 : 3, 0, Math.PI * 2);
            ctx.fill();

            if (index < 12) {
                ctx.fillStyle = labelColor;
                ctx.font = '10px monospace';
                ctx.fillText(`${point.shotIndex}`, p.x + 4, p.y - 4);
            }
        });
    }

    private drawSilhouetteGuide(
        ctx: CanvasRenderingContext2D,
        toCanvas: (point: SprayPoint2D) => { x: number; y: number },
    ) {
        const drawEllipse = (cx: number, cy: number, rx: number, ry: number, fill: string, stroke: string) => {
            const segments = 48;
            ctx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const t = (i / segments) * Math.PI * 2;
                const p = toCanvas({
                    shotIndex: 0,
                    x: cx + (Math.cos(t) * rx),
                    y: cy + (Math.sin(t) * ry),
                });
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.2;
            ctx.fill();
            ctx.stroke();
        };

        drawEllipse(0, -1.62, 0.85, 1.68, 'rgba(156, 208, 255, 0.08)', 'rgba(156, 208, 255, 0.45)');
        drawEllipse(0, -0.1, 0.26, 0.22, 'rgba(189, 226, 255, 0.12)', 'rgba(189, 226, 255, 0.55)');
    }

    private drawFreeTrainerOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const selectedDummyId = `${this.dummySelectEl?.value || 'all'}`;
        const source = selectedDummyId === 'all'
            ? this.freeHitLog
            : this.freeHitLog.filter((hit) => hit.dummyId === selectedDummyId);
        const recent = source.slice(-FREE_OVERLAY_POINT_LIMIT);

        const maxAbsX = Math.max(0.9, ...recent.map((hit) => Math.abs(hit.localX || 0)));
        const maxAbsY = Math.max(2.0, ...recent.map((hit) => Math.abs((hit.localY || 0) - 1.0)));
        const scale = Math.min(width / (maxAbsX * 3.1), height / (maxAbsY * 2.8));
        const centerX = width * 0.5;
        const centerY = height * 0.78;
        const toCanvas = (x: number, y: number) => ({
            x: centerX + (x * scale),
            y: centerY - (y * scale),
        });

        const drawRect = (x: number, y: number, w: number, h: number, fill: string, stroke: string) => {
            const a = toCanvas(x - (w * 0.5), y + (h * 0.5));
            const b = toCanvas(x + (w * 0.5), y - (h * 0.5));
            const rx = Math.min(a.x, b.x);
            const ry = Math.min(a.y, b.y);
            const rw = Math.abs(b.x - a.x);
            const rh = Math.abs(b.y - a.y);
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.2;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);
        };

        drawRect(0, 1.68, 0.36, 0.36, 'rgba(255, 208, 191, 0.16)', 'rgba(255, 226, 210, 0.7)');
        drawRect(0, 1.2, 0.64, 0.58, 'rgba(162, 195, 237, 0.13)', 'rgba(171, 218, 255, 0.65)');
        drawRect(0, 0.82, 0.56, 0.44, 'rgba(162, 195, 237, 0.13)', 'rgba(171, 218, 255, 0.65)');
        drawRect(-0.46, 1.16, 0.18, 0.5, 'rgba(142, 173, 211, 0.11)', 'rgba(160, 196, 236, 0.58)');
        drawRect(0.46, 1.16, 0.18, 0.5, 'rgba(142, 173, 211, 0.11)', 'rgba(160, 196, 236, 0.58)');
        drawRect(-0.18, 0.34, 0.24, 0.72, 'rgba(137, 164, 199, 0.10)', 'rgba(151, 184, 226, 0.56)');
        drawRect(0.18, 0.34, 0.24, 0.72, 'rgba(137, 164, 199, 0.10)', 'rgba(151, 184, 226, 0.56)');

        const colorByHitgroup: Record<DummyHitgroup, string> = {
            HEAD: '#7dffce',
            CHEST: '#6ec7ff',
            STOMACH: '#f5e67b',
            ARM: '#ffb870',
            LEG: '#ff7575',
        };
        const withAlpha = (hex: string, alpha: number) => {
            const value = `${hex}`.replace('#', '');
            const r = parseInt(value.slice(0, 2), 16) || 255;
            const g = parseInt(value.slice(2, 4), 16) || 255;
            const b = parseInt(value.slice(4, 6), 16) || 255;
            return `rgba(${r}, ${g}, ${b}, ${MathUtils.clamp(alpha, 0, 1).toFixed(3)})`;
        };

        recent.forEach((hit, index) => {
            const p = toCanvas(hit.localX || 0, hit.localY || 0);
            const age01 = index / Math.max(1, recent.length - 1);
            const radius = 2 + (age01 * 1.8);
            const alpha = 0.2 + (age01 * 0.78);
            ctx.fillStyle = withAlpha(colorByHitgroup[hit.hitgroup], alpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
            if (hit.kill) {
                ctx.strokeStyle = 'rgba(255, 109, 109, 0.92)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius + 1.8, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        const hits = source.length;
        const acc = this.freeShots > 0 ? (this.freeHits / this.freeShots) : 0;
        ctx.fillStyle = 'rgba(236, 244, 255, 0.92)';
        ctx.font = '12px monospace';
        ctx.fillText(`FREE TRAINER | Target=${selectedDummyId} | Hits=${hits} | Recent=${recent.length}`, 12, 18);
        ctx.fillText(`Shots=${this.freeShots} Hits=${this.freeHits} Acc=${(acc * 100).toFixed(1)}% Dmg=${this.freeDamage} Kills=${this.freeKills}`, 12, 35);
        ctx.fillText(`Legend: HEAD(green) CHEST(blue) STOM(yellow) ARM(orange) LEG(red) | KILL=ring`, 12, 52);
    }

    private buildCompensationPath(pattern: SprayPoint2D[]) {
        if (!Array.isArray(pattern) || pattern.length < 2) return [];
        const result: SprayPoint2D[] = [{ shotIndex: 1, x: 0, y: 0 }];
        let x = 0;
        let y = 0;
        for (let i = 1; i < pattern.length; i++) {
            const dx = pattern[i].x - pattern[i - 1].x;
            const dy = pattern[i].y - pattern[i - 1].y;
            x -= dx;
            y -= dy;
            result.push({
                shotIndex: i + 1,
                x,
                y,
            });
        }
        return result;
    }

    private toIndexedPoints(run: SprayRunRecord): SprayPoint2D[] {
        const byShot = new Map<number, SprayCapturePoint>();
        run.points.forEach((point) => {
            if (!byShot.has(point.shotIndex)) byShot.set(point.shotIndex, point);
        });

        const arr: SprayPoint2D[] = [];
        for (let i = 1; i <= run.shotGoal; i++) {
            const point = byShot.get(i);
            arr.push({
                shotIndex: i,
                x: point ? point.x : 0,
                y: point ? point.y : 0,
            });
        }
        return arr;
    }

    private toCapturedPoints(run: SprayRunRecord): SprayPoint2D[] {
        return [...run.points]
            .sort((a, b) => a.shotIndex - b.shotIndex)
            .map((point) => ({
                shotIndex: point.shotIndex,
                x: point.x,
                y: point.y,
            }));
    }

    private findLastRunForSelection() {
        const weaponId = normalizeWeaponId(this.weaponSelectEl.value);
        const state = toScopeState(this.stateSelectEl.value);
        const distance = toDistance(this.distanceSelectEl.value);

        for (let i = this.runHistory.length - 1; i >= 0; i--) {
            const run = this.runHistory[i];
            if (run.weaponId === weaponId && run.state === state && run.distance === distance) return run;
        }
        return this.lastRun;
    }

    private refreshActionButtons() {
        const runBusy = !!this.activeRun;
        const matrixBusy = this.matrixActive;
        const busy = runBusy || matrixBusy;
        const freeMode = this.isFreeModeActive();

        this.runButtonEl.disabled = busy || freeMode;
        this.runMatrixButtonEl.disabled = busy || freeMode;
        this.stopMatrixButtonEl.disabled = !busy;
        this.clearButtonEl.disabled = busy;
        this.resetTrainerButtonEl.disabled = busy || !freeMode;
        this.respawnDummiesButtonEl.disabled = busy || !freeMode;
        this.viewModeSelectEl.disabled = busy;
        this.dummySelectEl.disabled = !freeMode;
        this.exportButtonEl.disabled = busy || (
            freeMode
                ? (this.freeShots <= 0 && this.freeHitLog.length <= 0)
                : (!this.runHistory.length && !this.lastMatrixResult)
        );

        this.runMatrixButtonEl.textContent = this.matrixActive ? 'MATRIX...' : 'RUN MATRIX';
        this.exportButtonEl.textContent = freeMode ? 'EXPORT TRAINER' : 'EXPORT';
    }

    private updateMatrixProgress() {
        if (this.isFreeModeActive()) {
            const elapsed = Math.max(0, GameContext.GameLoop.Clock.getElapsedTime() - this.freeSessionStartedAt);
            const misses = Math.max(0, this.freeShots - this.freeHits);
            const acc = this.freeShots > 0 ? (this.freeHits / this.freeShots) : 0;
            this.progressEl.innerHTML = [
                `<span class="spray-lab-progress-pill is-live">FREE TRAINER</span>`,
                `<span>session ${elapsed.toFixed(1)}s</span>`,
                `<span>shots ${this.freeShots}</span>`,
                `<span>hits ${this.freeHits}</span>`,
                `<span>miss ${misses}</span>`,
                `<span>acc ${(acc * 100).toFixed(1)}%</span>`,
                `<span>dmg ${this.freeDamage}</span>`,
                `<span>kill ${this.freeKills}</span>`,
            ].join('');
            return;
        }

        if (this.matrixActive) {
            const done = this.matrixCompletedCount;
            const total = Math.max(1, this.matrixTotalCount);
            const pass = this.matrixRows.filter((row) => row.pass).length;
            const invalid = this.matrixInvalidCaptures.length;
            const remaining = this.matrixQueue.length + (this.activeRun ? 1 : 0);
            const elapsedSec = Math.max(0, (performance.now() - this.matrixStartPerfMs) / 1000);
            const avgPerRun = done > 0 ? elapsedSec / done : 0;
            const etaSec = avgPerRun > 0 ? avgPerRun * remaining : 0;
            const current = this.activeRun
                ? `${this.activeRun.weaponName} ${this.activeRun.state} ${this.activeRun.distance}m`
                : this.matrixQueue[0]
                    ? `${this.matrixQueue[0].weaponId} ${this.matrixQueue[0].state} ${this.matrixQueue[0].distance}m`
                    : 'finishing';

            this.progressEl.innerHTML = [
                `<span class="spray-lab-progress-pill is-live">LIVE MATRIX</span>`,
                `<span>${done}/${total} done</span>`,
                `<span>valid ${this.matrixRows.length}</span>`,
                `<span>invalid ${invalid}</span>`,
                `<span>pass ${pass}</span>`,
                `<span>remain ${remaining}</span>`,
                `<span>ETA ${etaSec > 0 ? `${etaSec.toFixed(1)}s` : '--'}</span>`,
                `<span class="spray-lab-progress-current">${this.escapeHtml(current)}</span>`,
            ].join('');
            return;
        }

        if (this.lastMatrixResult) {
            this.progressEl.innerHTML = [
                `<span class="spray-lab-progress-pill">LAST MATRIX</span>`,
                `<span>${this.lastMatrixResult.passCount}/${this.lastMatrixResult.validCount} pass</span>`,
                `<span>invalid ${this.lastMatrixResult.invalidCount}</span>`,
                `<span>${this.escapeHtml(this.lastMatrixResult.generatedAt)}</span>`,
            ].join('');
            return;
        }

        this.progressEl.textContent = 'Matrix idle.';
    }

    private resetMatrixState() {
        this.matrixActive = false;
        this.matrixQueue = [];
        this.matrixRows = [];
        this.matrixInvalidCaptures = [];
        this.matrixCompletedCount = 0;
        this.matrixTotalCount = 0;
        this.matrixStartPerfMs = 0;
        this.matrixNextRunAtMs = 0;
    }

    private renderHistory() {
        if (this.isFreeModeActive()) {
            const selectedDummy = `${this.dummySelectEl?.value || 'all'}`;
            const source = selectedDummy === 'all'
                ? this.freeHitLog
                : this.freeHitLog.filter((row) => row.dummyId === selectedDummy);
            const recent = source.slice(-14).reverse();
            if (!recent.length) {
                this.historyEl.innerHTML = '<div class="spray-lab-history-empty">No free-mode hit data yet.</div>';
                return;
            }

            const rows = recent.map((hit) => {
                const status = hit.kill ? 'KILL' : '-';
                const statusClass = hit.kill ? 'is-pass' : '';
                return `<div class="spray-lab-history-row">
                    <span>${hit.at.toFixed(2)}</span>
                    <span>${this.escapeHtml(hit.weaponName)}</span>
                    <span>${this.escapeHtml(hit.dummyName)}</span>
                    <span>${hit.hitgroup}</span>
                    <span>${Math.round(hit.healthDamage)}</span>
                    <span>${Math.round(hit.armorDamage)}</span>
                    <span>${Math.round(hit.hpAfter)}</span>
                    <span>${Math.round(hit.armorAfter)}</span>
                    <span class="${statusClass}">${status}</span>
                </div>`;
            }).join('');

            this.historyEl.innerHTML = `
                <div class="spray-lab-history-summary">Free Trainer Log: ${source.length} hits | filter=${this.escapeHtml(selectedDummy)}</div>
                <div class="spray-lab-history-head">
                    <span>TIME</span><span>WEAPON</span><span>DUMMY</span><span>PART</span><span>HPDMG</span><span>ARDMG</span><span>HP</span><span>AR</span><span>FLAG</span>
                </div>
                ${rows}
            `;
            return;
        }

        const recent = this.runHistory.slice(-12).reverse();
        const matrixSummary = this.lastMatrixResult
            ? `<div class="spray-lab-history-summary">Last matrix: pass ${this.lastMatrixResult.passCount}/${this.lastMatrixResult.validCount} | invalid ${this.lastMatrixResult.invalidCount} | total ${this.lastMatrixResult.totalCount} (${this.escapeHtml(this.lastMatrixResult.generatedAt)})</div>`
            : '';

        if (!recent.length) {
            this.historyEl.innerHTML = `${matrixSummary}<div class="spray-lab-history-empty">No run history yet.</div>`;
            return;
        }

        const rows = recent.map((run) => {
            const metric = run.metrics;
            const quality = run.captureQuality || { valid: false, hitRatio: 0, reason: 'n/a' };
            const pass = !!metric?.pass && quality.valid;
            const passClass = pass ? 'is-pass' : 'is-fail';
            const rmse = metric ? metric.rmseAll.toFixed(3) : '-';
            const max = metric ? metric.maxError.toFixed(3) : '-';
            const statusText = quality.valid ? (pass ? 'VALID/PASS' : 'VALID/FAIL') : 'INVALID';
            return `<div class="spray-lab-history-row">
                <span>#${run.id}</span>
                <span>${this.escapeHtml(run.weaponName)}</span>
                <span>${run.state}</span>
                <span>${run.distance}m</span>
                <span>${run.points.length}/${run.shotGoal}</span>
                <span>${run.silhouetteHitCount}/${run.shotGoal}</span>
                <span>${rmse}</span>
                <span>${max}</span>
                <span class="${passClass}" title="${this.escapeHtml(quality.reason)}">${statusText}</span>
            </div>`;
        }).join('');

        this.historyEl.innerHTML = `
            ${matrixSummary}
            <div class="spray-lab-history-head">
                <span>ID</span><span>WEAPON</span><span>STATE</span><span>DIST</span><span>HIT</span><span>SILH</span><span>RMSE</span><span>MAX</span><span>STATUS</span>
            </div>
            ${rows}
        `;
    }

    private escapeHtml(value: string) {
        return `${value || ''}`
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private updateWallHighlight() {
        const freeMode = this.isFreeModeActive();
        const selectedDistance = toDistance(this.distanceSelectEl?.value || '10');
        SPRAY_LAB_DISTANCES.forEach((distance) => {
            const wall = this.wallByDistance.get(distance);
            if (!wall) return;
            const material = wall.material as MeshBasicMaterial;
            const selected = distance === selectedDistance;
            wall.visible = freeMode ? false : selected;
            material.opacity = selected ? 0.98 : 0.55;
            material.transparent = true;

            const silhouette = this.silhouetteByDistance.get(distance);
            if (silhouette) silhouette.visible = freeMode ? false : selected;
        });
        this.dummyGroup.visible = freeMode;
    }

    private enforceScopeStateSupport() {
        const weaponId = normalizeWeaponId(this.weaponSelectEl.value);
        if (this.stateSelectEl.value === 'scoped' && !isScopedStateSupported(weaponId)) {
            this.stateSelectEl.value = 'unscoped';
        }
    }

    private syncScopeState(weaponId: string, state: SprayScopeState) {
        const shouldScope = state === 'scoped' && isScopedStateSupported(weaponId);
        for (let i = 0; i < 3; i++) {
            const scopedNow = ScopeSystem.isScopedForWeapon(weaponId);
            if (scopedNow === shouldScope) break;
            UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_SCOPE_TOGGLE;
            UserInputEventPipe.dispatchEvent(UserInputEvent);
        }
    }

    private broadcastLookLock(blocked: boolean) {
        window.dispatchEvent(new CustomEvent('game:spray-lab-look-lock', {
            detail: { blocked: !!blocked },
        }));
    }

    private dispatchTriggerDown() {
        UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_TRIGGLE_DOWN;
        UserInputEventPipe.dispatchEvent(UserInputEvent);
    }

    private dispatchTriggerUp() {
        UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_TRIGGLE_UP;
        UserInputEventPipe.dispatchEvent(UserInputEvent);
    }

    private getCurrentWeapon() {
        const inventory = this.localPlayer.inventorySystem;
        if (!inventory) return null;
        return inventory.weapons.get(inventory.nowEquipInventory) || null;
    }

    private equipWeaponForRun(weaponId: string) {
        const entry = getWeaponEntry(weaponId);
        if (!entry) return false;

        const currentLoadout = normalizeLoadoutProfile(this.localPlayer.activeLoadout || {});
        if (entry.slot === 'primary') currentLoadout.primary = weaponId;
        if (entry.slot === 'secondary') currentLoadout.secondary = weaponId;
        if (entry.slot === 'knife') currentLoadout.knife = weaponId;

        const pack = createWeaponsForLoadout(currentLoadout);
        this.localPlayer.activeLoadout = pack.normalized;

        const targetSlot = entry.slot === 'secondary'
            ? InventorySlotEnum.Secondary
            : entry.slot === 'knife'
                ? InventorySlotEnum.Malee
                : InventorySlotEnum.Primary;

        this.localPlayer.inventorySystem.applyLoadoutPack(pack.bySlot, targetSlot);
        this.localPlayer.inventorySystem.resetWeaponsToSpawnAmmo();
        this.localPlayer.inventorySystem.switchEquipment(targetSlot);
        this.localPlayer.inventorySystem.refreshCurrentWeaponState();
        return true;
    }

    private applySpraySeedOverride(weaponId: string) {
        const weapon = this.getCurrentWeapon();
        if (!weapon) return;
        weapon.spraySeedOverride = seedFromWeapon(weaponId, SPRAY_LAB_SEED_TAG);
    }

    private clearSpraySeedOverride() {
        const inventory = this.localPlayer.inventorySystem;
        if (!inventory) return;
        inventory.weapons.forEach((weapon) => {
            weapon.spraySeedOverride = undefined;
        });
    }

    private movePlayerToAnchor() {
        const movement = this.localPlayer.movementController;
        if (!movement || !movement.playerCollider) return;

        const x = this.anchorPosition.x;
        const y = this.anchorPosition.y;
        const z = this.anchorPosition.z;
        movement.playerCollider.start.set(x, y + 0.35, z);
        movement.playerCollider.end.set(x, y + 1.45, z);
        movement.playerCollider.radius = 0.35;
        movement.playerVelocity.set(0, 0, 0);
        movement.playerOnFloor = true;
        movement.landingImpact = 0;
        movement.clearInputState();

        const camera = GameContext.Cameras.PlayerCamera;
        camera.position.copy(movement.playerCollider.end);
        camera.rotation.set(0, this.anchorYaw, 0);
    }

    private lockPlayerToAnchor() {
        const movement = this.localPlayer.movementController;
        if (!movement || !movement.playerCollider) return;

        movement.keyStates.clear();
        movement.playerVelocity.set(0, 0, 0);
        movement.playerCollider.start.x = this.anchorPosition.x;
        movement.playerCollider.start.y = this.anchorPosition.y + 0.35;
        movement.playerCollider.start.z = this.anchorPosition.z;
        movement.playerCollider.end.x = this.anchorPosition.x;
        movement.playerCollider.end.y = this.anchorPosition.y + 1.45;
        movement.playerCollider.end.z = this.anchorPosition.z;
        movement.playerOnFloor = true;
        movement.landingImpact = 0;

        // Keep lab shots deterministic by removing accumulated camera drift each frame.
        const camera = GameContext.Cameras.PlayerCamera;
        camera.position.copy(movement.playerCollider.end);
        camera.rotation.set(0, this.anchorYaw, 0);
    }

    private downloadFile(filename: string, content: string, mime: string) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    }
}

