import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { computeDamageBreakdown, toHitgroupFromPart } from '@src/gameplay/combat/CombatTuning';
import { GameObjectMaterialEnum } from '@src/gameplay/abstract/GameObjectMaterialEnum';
import { KillFeedEvent, GameLogicEventPipe, PlayerDamagedEvent, PlayerDiedEvent, PlayerRespawnedEvent, WeaponFireEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { getRuntimePlayerAppearance } from '@src/gameplay/player/PlayerAppearance';
import { applyRemoteRuntimeTuning, getRuntimeTuningSnapshot, subscribeRuntimeTuning } from '@src/gameplay/tuning/RuntimeTuning';
import { backendApi } from '@src/services/BackendApi';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';
import {
    BoxGeometry,
    CanvasTexture,
    Color,
    Group,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Sprite,
    SpriteMaterial,
    Vector3,
} from 'three';

type PlayNowRoomDetail = {
    room?: {
        id?: string;
        partyId?: string;
        label?: string;
    };
    auth?: {
        token?: string;
        userId?: string;
        username?: string;
    };
};

type DamageResult = {
    matched: boolean;
    killed: boolean;
    victimName: string;
    damage: number;
};

type RemoteState = {
    id: string;
    username: string;
    hp: number;
    armor: number;
    hasHelmet: boolean;
    position: Vector3;
    yaw: number;
    pitch: number;
    fireSeq: number;
    weaponId: string;
};

type RemoteVisual = {
    root: Group;
    headJoint: Object3D;
    rightArmJoint: Object3D;
    leftArmJoint: Object3D;
    weaponMesh: Mesh;
    muzzleMesh: Mesh;
    target: Vector3;
        targetYaw: number;
        flashTime: number;
        lastFireSeq: number;
        label: Sprite;
        labelKey: string;
        dead: boolean;
        deathStartedAt: number;
        deathPosition: Vector3;
        deathYaw: number;
        deathSide: number;
        deathHeadshot: boolean;
};

const bodyBox = new BoxGeometry(0.54, 0.5, 0.3);
const bellyBox = new BoxGeometry(0.48, 0.34, 0.28);
const headBox = new BoxGeometry(0.34, 0.34, 0.34);
const torsoHitboxBox = new BoxGeometry(0.72, 1.08, 0.5);
const armBox = new BoxGeometry(0.16, 0.42, 0.16);
const legBox = new BoxGeometry(0.2, 0.56, 0.2);
const weaponBox = new BoxGeometry(0.52, 0.12, 0.14);
const barrelBox = new BoxGeometry(0.34, 0.06, 0.06);
const stockBox = new BoxGeometry(0.18, 0.1, 0.12);
const sightBox = new BoxGeometry(0.06, 0.08, 0.04);
const muzzleBox = new BoxGeometry(0.08, 0.08, 0.08);
const hpBarBox = new BoxGeometry(0.9, 0.08, 0.08);

const PLAYER_RESPAWN_SECONDS = 5;
const REMOTE_CORPSE_FALL_SECONDS = 0.7;

const hashColor = (key: string) => {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash) + key.charCodeAt(i);
    const hue = Math.abs(hash % 360) / 360;
    return new Color().setHSL(hue, 0.72, 0.58);
};

const normalizeYaw = (value: number) => {
    let angle = value;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
};

const normalizeWeaponName = (raw: string) => {
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
    return compact || 'default';
};

const weaponColorById = (weaponId: string) => {
    switch (normalizeWeaponName(weaponId)) {
        case 'awp': return 0x514b33;
        case 'mp9': return 0x2b3b44;
        case 'usp_s': return 0x51565e;
        case 'm9': return 0x8a8f97;
        case 'ak47': return 0x2f2f2f;
        default: return 0x30353f;
    }
};

const makeLabelText = (username: string, hp: number) => `${(username || 'PLAYER').slice(0, 14)}  ${Math.max(0, Math.round(hp))} HP`;
const getNodeKey = (node: Object3D, root: Object3D) => {
    const parts = [];
    let current: Object3D | null = node;
    while (current && current !== root) {
        parts.push(`${current.name || current.type || 'node'}`);
        current = current.parent;
    }
    return parts.reverse().join('/');
};

const makeNameSprite = (label: string, tint: Color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(8,12,18,0.74)';
        ctx.fillRect(0, 10, canvas.width, 52);
        ctx.strokeStyle = `#${tint.getHexString()}`;
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 12, canvas.width - 4, 48);
        ctx.fillStyle = '#eef4ff';
        ctx.font = '700 26px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
    }
    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new Sprite(material);
    sprite.scale.set(2.2, 0.42, 1);
    sprite.position.set(0, 2.25, 0);
    return sprite;
};

const getCurrentWeaponId = () => {
    const weapon = LocalPlayer.getInstance()?.inventorySystem?.currentWeapon;
    return `${weapon?.weaponId || weapon?.weaponName || ''}`.trim().toLowerCase();
};

export class OnlineRoomSystem implements CycleInterface, LoopInterface {
    private static instance: OnlineRoomSystem | null = null;

    public static getInstance() {
        return this.instance;
    }

    private ws: WebSocket | null = null;
    private wsUrl = '';
    private activeRoomId = '';
    private activeUserId = '';
    private activeUsername = '';
    private activeToken = '';
    private sendAccumulator = 0;
    private localFireSeq = 0;
    private localRespawnAt = -1;
    private lastRuntimeBotsVersion = 0;
    private lastSentRuntimeBotsJson = '';
    private applyingRemoteRuntime = false;
    private remoteStates = new Map<string, RemoteState>();
    private remoteVisuals = new Map<string, RemoteVisual>();
    private meshToRemoteId = new Map<string, string>();
    private onlineScene = GameContext.Scenes.Level;

    constructor() {
        OnlineRoomSystem.instance = this;
    }

    init(): void {
        window.addEventListener('game:play-now', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as PlayNowRoomDetail;
            const roomId = `${detail?.room?.id || ''}`.trim();
            const token = `${detail?.auth?.token || ''}`.trim();
            const userId = `${detail?.auth?.userId || ''}`.trim();
            const username = `${detail?.auth?.username || ''}`.trim();
            if (!roomId || !token || !userId) {
                this.disconnect();
                return;
            }
            void this.connect(roomId, token, userId, username);
        });

        window.addEventListener('game:return-main-menu', () => {
            this.disconnect();
        });

        GameLogicEventPipe.addEventListener(WeaponFireEvent.type, () => {
            this.localFireSeq += 1;
        });

        subscribeRuntimeTuning((snapshot) => {
            if (this.applyingRemoteRuntime) return;
            const nextJson = JSON.stringify(snapshot?.bots || {});
            if (!nextJson || nextJson === this.lastSentRuntimeBotsJson) return;
            this.lastSentRuntimeBotsJson = nextJson;
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.activeRoomId) return;
            this.ws.send(JSON.stringify({
                type: 'runtime_tuning',
                bots: snapshot?.bots || {},
            }));
        });
    }

    applyDamageFromHitObject(hitObject: Object3D, weaponName: string, distanceWorld: number): DamageResult {
        const remoteId = this.resolveRemoteId(hitObject);
        if (!remoteId) return { matched: false, killed: false, victimName: '', damage: 0 };
        const target = this.remoteStates.get(remoteId);
        if (!target || target.hp <= 0 || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return { matched: true, killed: false, victimName: target?.username || '', damage: 0 };
        }

        const part = hitObject.userData['GameObjectMaterialEnum'] as GameObjectMaterialEnum;
        const hitgroup = toHitgroupFromPart(part);
        const weaponId = normalizeWeaponName(weaponName);
        const damage = computeDamageBreakdown(weaponId, hitgroup, distanceWorld, target.armor, target.hasHelmet);
        const hpDamage = Math.max(1, damage.healthDamage);
        const killed = (target.hp - hpDamage) <= 0;

        target.hp = Math.max(0, target.hp - hpDamage);
        target.armor = Math.max(0, target.armor - Math.max(0, damage.armorDamage));
        if (target.armor <= 0) target.hasHelmet = false;
        this.syncRemoteVisuals();

        this.ws.send(JSON.stringify({
            type: 'player_hit',
            targetId: remoteId,
            weaponId,
            weaponName,
            damage: hpDamage,
            armorDamage: Math.max(0, damage.armorDamage),
            headshot: part === GameObjectMaterialEnum.PlayerHead,
            attackerName: this.activeUsername || 'YOU',
        }));

        return { matched: true, killed, victimName: target.username, damage: hpDamage };
    }

    private async connect(roomId: string, token: string, userId: string, username: string) {
        if (this.activeRoomId === roomId && this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.disconnect();

        this.activeRoomId = roomId;
        this.activeToken = token;
        this.activeUserId = userId;
        this.activeUsername = username || 'PLAYER';
        this.localFireSeq = 0;
        this.localRespawnAt = -1;

        try {
            const payload = await backendApi.multiplayerBootstrap(token);
            const bootstrapUrl = `${payload?.ws?.url || ''}`.trim();
            if (!bootstrapUrl) return;
            const url = new URL(bootstrapUrl);
            url.searchParams.set('token', token);
            this.wsUrl = url.toString();
            this.ws = new WebSocket(this.wsUrl);

            this.ws.addEventListener('open', () => {
                this.ws?.send(JSON.stringify({
                    type: 'join_ffa',
                    roomId: this.activeRoomId,
                }));
                this.ws?.send(JSON.stringify({
                    type: 'runtime_tuning',
                    bots: getRuntimeTuningSnapshot().bots,
                }));
            });

            this.ws.addEventListener('message', (message) => {
                let data: any = null;
                try {
                    data = JSON.parse(`${message.data || ''}`);
                } catch {
                    data = null;
                }
                if (!data || typeof data !== 'object') return;
                if (data.type === 'state') {
                    this.applyServerState(data.players || {});
                    this.applyRuntimeBotsFromState(data);
                }
                if (data.type === 'damage_taken') this.applyDamageTaken(data);
                if (data.type === 'player_died') this.applyRemoteDeathEvent(data);
            });

            this.ws.addEventListener('close', () => {
                this.clearRemoteVisuals();
                this.remoteStates.clear();
                this.ws = null;
            });
        } catch {
            this.disconnect();
        }
    }

    private applyServerState(players: Record<string, any>) {
        const nextStates = new Map<string, RemoteState>();
        Object.entries(players || {}).forEach(([id, state]) => {
            if (!id || id === this.activeUserId) return;
            nextStates.set(id, {
                id,
                username: `${state?.username || 'PLAYER'}`.trim() || 'PLAYER',
                hp: Math.max(0, Number(state?.hp) || 100),
                armor: Math.max(0, Number(state?.armor) || 0),
                hasHelmet: state?.hasHelmet !== false,
                position: new Vector3(
                    Number(state?.x) || 0,
                    (Number(state?.y) || 0) - 1.55,
                    Number(state?.z) || 0,
                ),
                yaw: Number.isFinite(Number(state?.yaw)) ? Number(state?.yaw) : 0,
                pitch: Number.isFinite(Number(state?.pitch)) ? Number(state?.pitch) : 0,
                fireSeq: Math.max(0, Number(state?.fireSeq) || 0),
                weaponId: `${state?.weaponId || ''}`.trim().toLowerCase(),
            });
        });
        this.remoteStates = nextStates;
        this.syncRemoteVisuals();
    }

    private applyRuntimeBotsFromState(data: any) {
        const version = Math.max(0, Number(data?.runtimeBotsVersion) || 0);
        if (!version || version <= this.lastRuntimeBotsVersion) return;
        const runtimeBots = data?.runtimeBots;
        if (!runtimeBots || typeof runtimeBots !== 'object') return;
        this.lastRuntimeBotsVersion = version;
        this.applyingRemoteRuntime = true;
        try {
            applyRemoteRuntimeTuning({ bots: runtimeBots });
        } finally {
            this.applyingRemoteRuntime = false;
        }
    }

    private applyDamageTaken(data: any) {
        const localPlayer = LocalPlayer.getInstance();
        const nextHealth = Math.max(0, Number(data?.health) || 0);
        const nextArmor = Math.max(0, Number(data?.armor) || 0);
        const damage = Math.max(1, Number(data?.damage) || 0);
        const armorDamage = Math.max(0, Number(data?.armorDamage) || 0);
        const headshot = data?.headshot === true;
        const attackerName = `${data?.attackerName || 'ENEMY'}`;
        const weaponName = `${data?.weaponName || data?.weaponId || 'RIFLE'}`;
        const before = localPlayer.health;

        localPlayer.health = nextHealth;
        localPlayer.armor = nextArmor;
        localPlayer.hasHelmet = nextArmor > 0;

        PlayerDamagedEvent.detail.damage = damage;
        PlayerDamagedEvent.detail.armorDamage = armorDamage;
        PlayerDamagedEvent.detail.health = localPlayer.health;
        PlayerDamagedEvent.detail.armor = localPlayer.armor;
        PlayerDamagedEvent.detail.headshot = headshot;
        PlayerDamagedEvent.detail.attackerName = attackerName;
        PlayerDamagedEvent.detail.attackerX = Number(data?.attackerX) || 0;
        PlayerDamagedEvent.detail.attackerY = Number(data?.attackerY) || 0;
        PlayerDamagedEvent.detail.attackerZ = Number(data?.attackerZ) || 0;
        GameLogicEventPipe.dispatchEvent(PlayerDamagedEvent);

        if (before > 0 && localPlayer.health <= 0) {
            this.localRespawnAt = GameContext.GameLoop.Clock.getElapsedTime() + PLAYER_RESPAWN_SECONDS;
            localPlayer.armor = 0;
            localPlayer.hasHelmet = false;
            localPlayer.deaths += 1;
            if (localPlayer.movementController) localPlayer.movementController.clearInputState();

            PlayerDiedEvent.detail.killerName = attackerName;
            PlayerDiedEvent.detail.weaponName = weaponName;
            PlayerDiedEvent.detail.headshot = headshot;
            PlayerDiedEvent.detail.respawnAt = this.localRespawnAt;
            PlayerDiedEvent.detail.respawnSeconds = PLAYER_RESPAWN_SECONDS;
            GameLogicEventPipe.dispatchEvent(PlayerDiedEvent);

            KillFeedEvent.detail.killerName = attackerName;
            KillFeedEvent.detail.victimName = 'YOU';
            KillFeedEvent.detail.weaponName = weaponName;
            KillFeedEvent.detail.headshot = headshot;
            GameLogicEventPipe.dispatchEvent(KillFeedEvent);
        }
    }

    private applyRemoteDeathEvent(data: any) {
        const targetId = `${data?.targetId || ''}`.trim();
        if (!targetId || targetId === this.activeUserId) return;
        const state = this.remoteStates.get(targetId);
        if (state) {
            state.hp = 0;
            this.remoteStates.set(targetId, state);
        }
        const visual = this.remoteVisuals.get(targetId);
        if (!visual || visual.dead) return;
        visual.dead = true;
        visual.deathHeadshot = data?.headshot === true;
        visual.deathStartedAt = GameContext.GameLoop.Clock.getElapsedTime();
        visual.deathPosition.set(
            Number(data?.x) || visual.root.position.x,
            (Number(data?.y) || (visual.root.position.y + 1.55)) - 1.55,
            Number(data?.z) || visual.root.position.z,
        );
        visual.deathYaw = Number.isFinite(Number(data?.yaw)) ? Number(data?.yaw) : visual.root.rotation.y;
        visual.deathSide = Math.random() < 0.5 ? -1 : 1;
        visual.muzzleMesh.visible = false;
        (visual.muzzleMesh.material as MeshBasicMaterial).opacity = 0;
        this.clearCombatTags(visual.root);
        visual.label.visible = false;
    }

    private respawnLocalPlayer(elapsed: number) {
        if (this.localRespawnAt < 0 || elapsed < this.localRespawnAt) return;
        const localPlayer = LocalPlayer.getInstance();
        localPlayer.health = 100;
        localPlayer.armor = 100;
        localPlayer.hasHelmet = true;
        this.localRespawnAt = -1;
        const camera = GameContext.Cameras.PlayerCamera;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'player_respawn',
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
            }));
        }
        PlayerRespawnedEvent.detail.at = elapsed;
        GameLogicEventPipe.dispatchEvent(PlayerRespawnedEvent);
    }

    private syncRemoteVisuals() {
        this.remoteVisuals.forEach((visual, id) => {
            if (this.remoteStates.has(id)) return;
            this.clearCombatTags(visual.root);
            this.onlineScene.remove(visual.root);
            this.remoteVisuals.delete(id);
        });

        this.remoteStates.forEach((state, id) => {
            let visual = this.remoteVisuals.get(id);
            if (!visual) {
                visual = this.createRemoteVisual(state);
                this.remoteVisuals.set(id, visual);
                this.onlineScene.add(visual.root);
            }

            if (state.hp <= 0) {
                if (!visual.dead) {
                    visual.dead = true;
                    visual.deathHeadshot = false;
                    visual.deathStartedAt = GameContext.GameLoop.Clock.getElapsedTime();
                    visual.deathPosition.copy(visual.root.position);
                    visual.deathYaw = visual.root.rotation.y;
                    visual.deathSide = Math.random() < 0.5 ? -1 : 1;
                    visual.muzzleMesh.visible = false;
                    (visual.muzzleMesh.material as MeshBasicMaterial).opacity = 0;
                    this.clearCombatTags(visual.root);
                }
                visual.label.visible = false;
            } else {
                if (visual.dead) {
                    visual.dead = false;
                    visual.root.visible = true;
                    visual.root.position.copy(state.position);
                    visual.root.rotation.set(0, state.yaw, 0);
                    visual.headJoint.rotation.set(0, 0, 0);
                    visual.rightArmJoint.rotation.set(0, 0, 0);
                    visual.leftArmJoint.rotation.set(0, 0, 0);
                    visual.weaponMesh.rotation.set(0, -0.08, 0);
                    visual.weaponMesh.position.set(0.26, -0.16, -0.2);
                    this.restoreCombatTags(visual.root, state.id);
                }
                visual.label.visible = true;
                visual.target.copy(state.position);
                visual.targetYaw = state.yaw;
            }
            visual.weaponMesh.material = new MeshBasicMaterial({ color: weaponColorById(state.weaponId) });

            const nextLabelKey = makeLabelText(state.username, state.hp);
            if (visual.labelKey !== nextLabelKey) {
                visual.root.remove(visual.label);
                const tint = hashColor(state.id);
                visual.label = makeNameSprite(nextLabelKey, tint);
                visual.labelKey = nextLabelKey;
                visual.root.add(visual.label);
            }

            const hpBar = visual.root.getObjectByName('remote-hp-bar') as Mesh | null;
            if (hpBar) {
                const hpRatio = Math.max(0.05, Math.min(1, state.hp / 100));
                hpBar.scale.x = hpRatio;
                hpBar.position.x = -0.45 + (hpRatio * 0.45);
                (hpBar.material as MeshBasicMaterial).color.setHSL(0.33 * Math.min(1, state.hp / 100), 0.85, 0.55);
            }

            if (state.fireSeq > visual.lastFireSeq) {
                visual.lastFireSeq = state.fireSeq;
                visual.flashTime = state.weaponId === 'awp' ? 0.09 : 0.06;
                visual.muzzleMesh.visible = true;
                (visual.muzzleMesh.material as MeshBasicMaterial).opacity = state.weaponId === 'awp' ? 0.98 : 0.88;
                visual.muzzleMesh.scale.set(
                    state.weaponId === 'awp' ? 1.8 : 1.3,
                    state.weaponId === 'awp' ? 1.4 : 1.15,
                    state.weaponId === 'awp' ? 2.6 : 1.8,
                );
            }
        });
    }

    private tagPart(mesh: Mesh, remoteId: string, material: GameObjectMaterialEnum) {
        mesh.userData['GameObjectMaterialEnum'] = material;
        mesh.userData['OnlinePlayerId'] = remoteId;
        mesh.userData['OnlinePartMaterial'] = material;
        this.meshToRemoteId.set(mesh.uuid, remoteId);
    }

    private resolveRemoteId(hitObject: Object3D) {
        const tagged = hitObject.userData['OnlinePlayerId'];
        if (typeof tagged === 'string') return tagged;
        return this.meshToRemoteId.get(hitObject.uuid);
    }

    private clearCombatTags(root: Object3D) {
        root.traverse((child: any) => {
            if (!child?.isMesh) return;
            delete child.userData['OnlinePlayerId'];
            delete child.userData['GameObjectMaterialEnum'];
            this.meshToRemoteId.delete(child.uuid);
        });
    }

    private restoreCombatTags(root: Object3D, remoteId: string) {
        root.traverse((child: any) => {
            if (!child?.isMesh) return;
            const material = child.userData['OnlinePartMaterial'];
            if (material === undefined) return;
            child.userData['GameObjectMaterialEnum'] = material;
            child.userData['OnlinePlayerId'] = remoteId;
            this.meshToRemoteId.set(child.uuid, remoteId);
        });
    }

    private createRemoteVisual(state: RemoteState): RemoteVisual {
        const tint = hashColor(state.id);
        const root = new Group();
        const appearance = getRuntimePlayerAppearance(state.id || state.username);

        const skinMat = new MeshBasicMaterial({ color: 0xdab898 });
        const chestMat = new MeshBasicMaterial({ color: tint });
        const bellyMat = new MeshBasicMaterial({ color: tint.clone().multiplyScalar(0.72) });
        const limbMat = new MeshBasicMaterial({ color: 0x3a3a3a });
        const weaponMat = new MeshBasicMaterial({ color: weaponColorById(state.weaponId) });
        const muzzleMat = new MeshBasicMaterial({ color: 0xf0d75a, transparent: true, opacity: 0, depthWrite: false });
        const hitboxMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

        const headJoint = new Group();
        headJoint.position.set(0, 1.5, 0);
        const head = new Mesh(headBox, skinMat);
        head.position.set(0, 0.17, 0);
        this.tagPart(head, state.id, GameObjectMaterialEnum.PlayerHead);
        headJoint.add(head);

        const chest = new Mesh(bodyBox, chestMat);
        chest.position.set(0, 1.18, 0);
        this.tagPart(chest, state.id, GameObjectMaterialEnum.PlayerChest);

        const belly = new Mesh(bellyBox, bellyMat);
        belly.position.set(0, 0.84, 0);
        this.tagPart(belly, state.id, GameObjectMaterialEnum.PlayerBelly);

        const torsoHitbox = new Mesh(torsoHitboxBox, hitboxMat);
        torsoHitbox.position.set(0, 1.04, 0);
        this.tagPart(torsoHitbox, state.id, GameObjectMaterialEnum.PlayerChest);

        const leftArmJoint = new Group();
        leftArmJoint.position.set(-0.34, 1.41, 0);
        const leftArm = new Mesh(armBox, limbMat);
        leftArm.position.set(0, -0.21, 0);
        this.tagPart(leftArm, state.id, GameObjectMaterialEnum.PlayerUpperLimb);
        leftArmJoint.add(leftArm);

        const rightArmJoint = new Group();
        rightArmJoint.position.set(0.34, 1.41, 0);
        const rightArm = new Mesh(armBox, limbMat);
        rightArm.position.set(0, -0.21, 0);
        this.tagPart(rightArm, state.id, GameObjectMaterialEnum.PlayerUpperLimb);
        rightArmJoint.add(rightArm);

        const leftLegJoint = new Group();
        leftLegJoint.position.set(-0.14, 0.58, 0);
        const leftLeg = new Mesh(legBox, limbMat);
        leftLeg.position.set(0, -0.28, 0);
        this.tagPart(leftLeg, state.id, GameObjectMaterialEnum.PlayerLowerLimb);
        leftLegJoint.add(leftLeg);

        const rightLegJoint = new Group();
        rightLegJoint.position.set(0.14, 0.58, 0);
        const rightLeg = new Mesh(legBox, limbMat);
        rightLeg.position.set(0, -0.28, 0);
        this.tagPart(rightLeg, state.id, GameObjectMaterialEnum.PlayerLowerLimb);
        rightLegJoint.add(rightLeg);

        const weaponMesh = new Mesh(weaponBox, weaponMat);
        weaponMesh.position.set(0.26, -0.16, -0.2);
        weaponMesh.rotation.y = -0.08;
        this.tagPart(weaponMesh, state.id, GameObjectMaterialEnum.PlayerChest);
        const barrel = new Mesh(barrelBox, weaponMat);
        barrel.position.set(0.35, 0, 0);
        weaponMesh.add(barrel);
        const stock = new Mesh(stockBox, weaponMat);
        stock.position.set(-0.33, 0, 0);
        weaponMesh.add(stock);
        const sight = new Mesh(sightBox, weaponMat);
        sight.position.set(0.49, 0.07, 0);
        weaponMesh.add(sight);
        rightArmJoint.add(weaponMesh);

        const muzzleMesh = new Mesh(muzzleBox, muzzleMat);
        muzzleMesh.position.set(0.67, -0.16, -0.2);
        muzzleMesh.visible = false;
        rightArmJoint.add(muzzleMesh);

        const hpBack = new Mesh(hpBarBox, new MeshBasicMaterial({ color: 0x0d1218, transparent: true, opacity: 0.75 }));
        hpBack.position.set(0, 2.03, 0);
        const hpBar = new Mesh(hpBarBox, new MeshBasicMaterial({ color: 0x67ff95 }));
        hpBar.name = 'remote-hp-bar';
        hpBar.position.set(0, 2.03, 0.01);

        const labelKey = makeLabelText(state.username, state.hp);
        const label = makeNameSprite(labelKey, tint);

        let visualHeadJoint: Object3D = headJoint;
        let visualRightArmJoint: Object3D = rightArmJoint;
        let visualLeftArmJoint: Object3D = leftArmJoint;
        const usesCustomContentModel = !!appearance?.modelPath;
        const contentModelKey = appearance?.modelPath ? `ContentPlayerModel:${appearance.modelPath}` : '';
        const contentModelResource = contentModelKey ? GameContext.GameResources.resourceMap.get(contentModelKey) as any : null;
        const roleResource = contentModelResource || GameContext.GameResources.resourceMap.get('Role') as any;
        const roleScene = (roleResource?.scene || roleResource) as Object3D | undefined;
        if (roleScene) {
            const visualRoot = cloneSkeleton(roleScene);
            const selectedVariant = 'Character_Female_FBI';
            const variantVisibleMeshes = new Set(Array.isArray(appearance?.visibleMeshes) ? appearance.visibleMeshes : []);
            let importedVisible = 0;
            visualRoot.traverse((child: any) => {
                if (!child?.isMesh) return;
                const meshKey = getNodeKey(child, visualRoot);
                if (variantVisibleMeshes.size > 0) child.visible = variantVisibleMeshes.has(meshKey);
                else if (usesCustomContentModel) child.visible = true;
                else child.visible = child.name === selectedVariant;
                if (appearance?.meshVisibility && Object.prototype.hasOwnProperty.call(appearance.meshVisibility, meshKey)) {
                    child.visible = appearance.meshVisibility[meshKey] !== false;
                }
                if (child.visible) importedVisible += 1;
            });
            if (importedVisible > 0) {
                [head, chest, belly, leftArm, rightArm, leftLeg, rightLeg].forEach((mesh) => { mesh.material = hitboxMat; });
                root.add(visualRoot);
                visualHeadJoint = visualRoot.getObjectByName('mixamorig:Head') || headJoint;
                visualRightArmJoint = visualRoot.getObjectByName('mixamorig:RightArm') || rightArmJoint;
                visualLeftArmJoint = visualRoot.getObjectByName('mixamorig:LeftArm') || leftArmJoint;
            }
        }

        root.add(headJoint, chest, belly, torsoHitbox, leftArmJoint, rightArmJoint, leftLegJoint, rightLegJoint, hpBack, hpBar, label);
        root.position.copy(state.position);
        root.rotation.y = state.yaw;

        return {
            root,
            headJoint: visualHeadJoint,
            rightArmJoint: visualRightArmJoint,
            leftArmJoint: visualLeftArmJoint,
            weaponMesh,
            muzzleMesh,
            target: state.position.clone(),
            targetYaw: state.yaw,
            flashTime: 0,
            lastFireSeq: state.fireSeq,
            label,
            labelKey,
            dead: false,
            deathStartedAt: 0,
            deathPosition: state.position.clone(),
            deathYaw: state.yaw,
            deathSide: Math.random() < 0.5 ? -1 : 1,
            deathHeadshot: false,
        };
    }

    private clearRemoteVisuals() {
        this.remoteVisuals.forEach((visual) => {
            this.clearCombatTags(visual.root);
            this.onlineScene.remove(visual.root);
        });
        this.remoteVisuals.clear();
    }

    private disconnect() {
        if (this.ws) {
            try {
                this.ws.close();
            } catch {
            }
        }
        this.ws = null;
        this.wsUrl = '';
        this.activeRoomId = '';
        this.activeToken = '';
        this.activeUserId = '';
        this.activeUsername = '';
        this.sendAccumulator = 0;
        this.localFireSeq = 0;
        this.localRespawnAt = -1;
        this.lastRuntimeBotsVersion = 0;
        this.lastSentRuntimeBotsJson = '';
        this.remoteStates.clear();
        this.clearRemoteVisuals();
    }

    public getScoreboardRoster() {
        return Array.from(this.remoteStates.values()).map((state) => ({
            id: state.id,
            name: state.username,
            title: 'Online Player',
            nameColor: 'default',
            avatar: 'captain_royal',
            avatarFrame: 'default',
            elo: 12000,
            premierTier: 'blue',
            calibrated: true,
            ping: 32,
        }));
    }

    callEveryFrame(deltaTime?: number): void {
        const dt = Math.min(0.05, Math.max(0.001, deltaTime || 0.016));
        const elapsed = GameContext.GameLoop.Clock.getElapsedTime();
        const camera = GameContext.Cameras.PlayerCamera;

        this.respawnLocalPlayer(elapsed);

        this.remoteVisuals.forEach((visual) => {
            if (visual.dead) {
                const deathT = Math.min(1, Math.max(0, (elapsed - visual.deathStartedAt) / REMOTE_CORPSE_FALL_SECONDS));
                const ease = 1 - Math.pow(1 - deathT, 3);
                visual.root.visible = deathT < 0.96;
                visual.root.position.copy(visual.deathPosition);
                visual.root.rotation.set(
                    (visual.deathHeadshot ? 0.22 : 0.14) * ease,
                    visual.deathYaw,
                    visual.deathSide * (visual.deathHeadshot ? 1.36 : 1.18) * ease,
                );
                visual.headJoint.rotation.x = (visual.deathHeadshot ? -1.18 : -0.9) * ease;
                visual.headJoint.rotation.z = visual.deathSide * (visual.deathHeadshot ? 0.52 : 0.35) * ease;
                visual.rightArmJoint.rotation.x = (visual.deathHeadshot ? -1.38 : -1.15) * ease;
                visual.rightArmJoint.rotation.z = visual.deathSide * -0.45 * ease;
                visual.leftArmJoint.rotation.x = (visual.deathHeadshot ? -1.04 : -0.88) * ease;
                visual.leftArmJoint.rotation.z = visual.deathSide * 0.38 * ease;
                visual.weaponMesh.rotation.x = (visual.deathHeadshot ? 1.02 : 0.85) * ease;
                visual.weaponMesh.rotation.y = -0.08 - visual.deathSide * 0.22 * ease;
                visual.weaponMesh.rotation.z = visual.deathSide * 0.44 * ease;
                visual.weaponMesh.position.set(0.22, -0.12, -0.12);
                return;
            }

            visual.root.visible = true;
            visual.root.position.lerp(visual.target, Math.min(1, dt * 10));
            const yawDelta = normalizeYaw(visual.targetYaw - visual.root.rotation.y);
            visual.root.rotation.y += yawDelta * Math.min(1, dt * 10);
            visual.label.lookAt(camera.position);
            visual.headJoint.rotation.y = yawDelta * 0.42;
            visual.rightArmJoint.rotation.x += (-0.35 - visual.rightArmJoint.rotation.x) * Math.min(1, dt * 8);
            visual.leftArmJoint.rotation.x += (-0.18 - visual.leftArmJoint.rotation.x) * Math.min(1, dt * 8);

            if (visual.flashTime > 0) {
                visual.flashTime = Math.max(0, visual.flashTime - dt);
                (visual.muzzleMesh.material as MeshBasicMaterial).opacity = Math.min(1, visual.flashTime * 18);
                if (visual.flashTime <= 0) {
                    visual.muzzleMesh.visible = false;
                    (visual.muzzleMesh.material as MeshBasicMaterial).opacity = 0;
                }
            }
        });

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.activeRoomId) return;
        this.sendAccumulator += dt;
        if (this.sendAccumulator < 1 / 18) return;
        this.sendAccumulator = 0;

        const localPlayer = LocalPlayer.getInstance();
        const forward = new Vector3();
        camera.getWorldDirection(forward);
        const flatForward = new Vector3(forward.x, 0, forward.z);
        let yaw = camera.rotation.y;
        if (flatForward.lengthSq() > 0.0001) {
            flatForward.normalize();
            yaw = Math.atan2(-flatForward.x, -flatForward.z);
        }
        const pitch = Math.atan2(forward.y, Math.max(0.0001, Math.sqrt((forward.x * forward.x) + (forward.z * forward.z))));

        this.ws.send(JSON.stringify({
            type: 'player_input',
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            hp: localPlayer.health,
            armor: localPlayer.armor,
            hasHelmet: localPlayer.hasHelmet,
            yaw,
            pitch,
            fireSeq: this.localFireSeq,
            weaponId: getCurrentWeaponId(),
        }));
    }
}
