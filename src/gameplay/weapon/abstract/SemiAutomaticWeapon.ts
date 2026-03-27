import { GameContext } from '@src/core/GameContext';
import { MovementController } from '@src/gameplay/input/controllers/MovementController';
import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';
import { UserInputEvent, UserInputEventPipe } from '@src/gameplay/pipes/UserinputEventPipe';
import { UserInputEventEnum, WeaponAnimationEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { AnimationEventPipe, WeaponAnimationEvent } from '@src/gameplay/pipes/AnimationEventPipe';
import { GameLogicEventPipe, WeaponFireEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { WeaponInterface } from './WeaponInterface';
import { LoopOnce, LoopRepeat, MathUtils, Vector2 } from 'three';
import { computeShot, recoverRecoil, seedFromWeapon } from '@src/gameplay/combat/CombatTuning';
import { ScopeSystem } from '../ScopeSystem';

const bPointRecoiledScreenCoord: THREE.Vector2 = new Vector2();
const SPRAY_LAB_STAND_SNAPSHOT = {
    onFloor: true,
    crouching: false,
    walking: false,
    horizontalSpeed: 0,
    verticalSpeed: 0,
    speed01: 0,
    landingImpact: 0,
    airborneTime: 0,
};

/**
 * Semi automatic weapon base with deterministic recoil recovery.
 */
export abstract class SemiAutomaticWeapon implements WeaponInterface {
    private animationMixer: THREE.AnimationMixer;
    private weaponSkinnedMesh: THREE.SkinnedMesh;
    private camera: THREE.Camera = GameContext.Cameras.PlayerCamera;
    private scene: THREE.Scene = GameContext.Scenes.Handmodel;
    private localPlayer: LocalPlayer = LocalPlayer.getInstance();

    lastFireTime = 0;
    bulletLeftMagzine: number;
    bulletLeftTotal: number;
    active = false;

    weaponUUID = MathUtils.generateUUID();
    weaponClassificationEnum: WeaponClassificationEnum;
    weaponId?: string;
    weaponName: string;
    weaponNameSuffix: string;
    magazineSize: number;
    recoverTime: number;
    reloadTime: number;
    speed: number;
    killaward: number;
    damage: number;
    fireRate: number;
    tracerSpeed?: number;
    spraySeedOverride?: number;
    recoilControl: number;
    accurateRange: number;
    armorPenetration: number;

    recoverLine = 0;
    private recoilIndex = 0;
    private recoilPitchDebt = 0;
    private recoilYawDebt = 0;
    private shotCounter = 0;
    private recoilSeed = 1;
    private lastShotGapSeconds = 999;

    private equipAnim: THREE.AnimationAction;
    private reloadAnim: THREE.AnimationAction;
    private fireAnim: THREE.AnimationAction;
    private holdAnim: THREE.AnimationAction;
    private viewAnim: THREE.AnimationAction;

    init() {
        this.recoilSeed = seedFromWeapon(this.weaponId || this.weaponName || 'weapon', this.weaponUUID);
        this.resetRecoilState();

        UserInputEventPipe.addEventListener(UserInputEvent.type, (e: CustomEvent) => {
            if (this.localPlayer.health <= 0) return;
            if (!this.active) return;
            switch (e.detail.enum) {
                case UserInputEventEnum.BUTTON_RELOAD:
                    if (this.magazineSize <= this.bulletLeftMagzine) return;
                    this.active = false;
                    WeaponAnimationEvent.detail.enum = WeaponAnimationEventEnum.RELOAD;
                    WeaponAnimationEvent.detail.weaponInstance = this;
                    AnimationEventPipe.dispatchEvent(WeaponAnimationEvent);
                    break;
                case UserInputEventEnum.BUTTON_TRIGGLE_DOWN:
                    if (!GameContext.PointLock.isLocked) return;
                    if (!this.active) return;
                    if (this.bulletLeftMagzine <= 0) {
                        this.active = false;
                        WeaponAnimationEvent.detail.enum = WeaponAnimationEventEnum.RELOAD;
                        WeaponAnimationEvent.detail.weaponInstance = this;
                        AnimationEventPipe.dispatchEvent(WeaponAnimationEvent);
                        return;
                    }
                    {
                        const now = performance.now();
                        if (now - this.lastFireTime < this.fireRate * 1000) return;
                        this.lastShotGapSeconds = this.lastFireTime > 0 ? Math.max(0.001, (now - this.lastFireTime) / 1000) : 999;
                        this.lastFireTime = now;
                        this.fire();
                    }
                    break;
            }
        });
    }

    initAnimation() {
        const equipAnimName = `${this.weaponName}_equip`;
        const reloadAnimName = `${this.weaponName}_reload`;
        const fireAnimName = `${this.weaponName}_fire`;
        const holdAnimName = `${this.weaponName}_hold`;
        const viewAnimName = `${this.weaponName}_view`;

        this.weaponSkinnedMesh = GameContext.GameResources.resourceMap.get(`${this.weaponName}_1`) as THREE.SkinnedMesh;
        this.animationMixer = GameContext.GameResources.resourceMap.get('AnimationMixer') as THREE.AnimationMixer;
        this.scene.add(this.weaponSkinnedMesh);

        this.equipAnim = GameContext.GameResources.resourceMap.get(equipAnimName) as THREE.AnimationAction;
        if (this.equipAnim) this.equipAnim.loop = LoopOnce;
        this.reloadAnim = GameContext.GameResources.resourceMap.get(reloadAnimName) as THREE.AnimationAction;
        if (this.reloadAnim) this.reloadAnim.loop = LoopOnce;
        this.fireAnim = GameContext.GameResources.resourceMap.get(fireAnimName) as THREE.AnimationAction;
        if (this.fireAnim) this.fireAnim.loop = LoopOnce;
        this.holdAnim = GameContext.GameResources.resourceMap.get(holdAnimName) as THREE.AnimationAction;
        if (this.holdAnim) this.holdAnim.loop = LoopRepeat;
        this.viewAnim = GameContext.GameResources.resourceMap.get(viewAnimName) as THREE.AnimationAction;
        if (this.viewAnim) this.viewAnim.loop = LoopOnce;

        this.animationMixer.addEventListener('finished', (e: any) => {
            if (e.type !== 'finished') return;
            switch (e.action._clip.name) {
                case equipAnimName:
                    this.active = true;
                    break;
                case reloadAnimName:
                    this.bulletLeftMagzine = this.magazineSize;
                    this.active = true;
                    break;
            }
        });

        AnimationEventPipe.addEventListener(WeaponAnimationEvent.type, (e: CustomEvent) => {
            if (e.detail.weaponInstance !== this) return;
            switch (e.detail.enum) {
                case WeaponAnimationEventEnum.RELIEVE_EQUIP:
                    this.weaponSkinnedMesh.visible = false;
                    this.active = false;
                    this.animationMixer.stopAllAction();
                    if (this.holdAnim) this.holdAnim.reset();
                    if (this.reloadAnim) this.reloadAnim.reset();
                    if (this.equipAnim) this.equipAnim.reset();
                    if (this.fireAnim) this.fireAnim.reset();
                    if (this.viewAnim) this.viewAnim.reset();
                    this.resetRecoilState();
                    break;
                case WeaponAnimationEventEnum.EQUIP:
                    this.weaponSkinnedMesh.visible = true;
                    this.holdAnim.play();
                    this.applyActionDuration(this.equipAnim, this.recoverTime);
                    this.equipAnim.weight = 49;
                    this.equipAnim.reset();
                    this.equipAnim.play();
                    this.active = false;
                    this.resetRecoilState();
                    break;
                case WeaponAnimationEventEnum.FIRE:
                    this.fireAnim.weight = 49;
                    this.fireAnim.reset();
                    this.fireAnim.play();
                    break;
                case WeaponAnimationEventEnum.RELOAD:
                    this.applyActionDuration(this.reloadAnim, this.reloadTime);
                    this.reloadAnim.weight = 49;
                    this.reloadAnim.reset();
                    this.reloadAnim.play();
                    this.active = false;
                    break;
            }
        });
    }

    private applyActionDuration(action: THREE.AnimationAction | undefined, durationSeconds: number) {
        if (!action) return;
        const clipDuration = Math.max(0.001, Number(action.getClip()?.duration) || 0);
        const targetDuration = Math.max(0.001, Number(durationSeconds) || 0);
        if (clipDuration <= 0) {
            action.setEffectiveTimeScale(1);
            return;
        }
        action.setEffectiveTimeScale(clipDuration / targetDuration);
    }

    fire(): void {
        if (this.localPlayer.health <= 0) return;

        const move = Number.isFinite(this.spraySeedOverride)
            ? SPRAY_LAB_STAND_SNAPSHOT
            : MovementController.getSnapshot();
        const weaponSeed = Number.isFinite(this.spraySeedOverride)
            ? (this.spraySeedOverride as number)
            : this.recoilSeed;
        const shot = computeShot({
            profileOrName: this.weaponId || this.weaponName,
            movement: move,
            recoilIndex: this.recoilIndex,
            recoverLine: this.recoverLine,
            weaponSeed,
            shotCounter: this.shotCounter,
            recoilControl: this.recoilControl,
            accurateRange: this.accurateRange,
            timeSinceLastShotSeconds: this.lastShotGapSeconds,
            scopeInaccuracyMultiplier: ScopeSystem.getShotInaccuracyMultiplier(this.weaponId || this.weaponName),
            scoped: ScopeSystem.isScopedForWeapon(this.weaponId || this.weaponName),
        });

        bPointRecoiledScreenCoord.set(shot.spreadX, shot.spreadY);

        this.recoilIndex = shot.nextRecoilIndex;
        this.recoverLine = shot.nextRecoverLine;
        this.shotCounter += 1;

        WeaponAnimationEvent.detail.enum = WeaponAnimationEventEnum.FIRE;
        WeaponAnimationEvent.detail.weaponInstance = this;
        AnimationEventPipe.dispatchEvent(WeaponAnimationEvent);

        WeaponFireEvent.detail.bPointRecoiledScreenCoord = bPointRecoiledScreenCoord;
        WeaponFireEvent.detail.weaponInstance = this;
        GameLogicEventPipe.dispatchEvent(WeaponFireEvent);

        // Apply view-kick after dispatch so bullet raycast is not double-shifted by camera recoil.
        this.camera.rotation.x += shot.cameraPitchKick;
        this.camera.rotation.y += shot.cameraYawKick;
        this.recoilPitchDebt += shot.cameraPitchKick;
        this.recoilYawDebt += shot.cameraYawKick;

        this.bulletLeftMagzine -= 1;
    }

    recover(deltaTime?: number): void {
        const frameDt = Math.min(0.05, Math.max(0.001, deltaTime || 0.016));
        const recovery = recoverRecoil({
            profileOrName: this.weaponId || this.weaponName,
            deltaTime: frameDt,
            triggerDown: false,
            recoilIndex: this.recoilIndex,
            recoverLine: this.recoverLine,
            pitchDebt: this.recoilPitchDebt,
            yawDebt: this.recoilYawDebt,
        });

        if (Math.abs(recovery.pitchRecover) > 0) this.camera.rotation.x -= recovery.pitchRecover;
        if (Math.abs(recovery.yawRecover) > 0) this.camera.rotation.y -= recovery.yawRecover;

        this.recoilIndex = recovery.nextRecoilIndex;
        this.recoverLine = recovery.nextRecoverLine;
        this.recoilPitchDebt = Math.abs(recovery.nextPitchDebt) < 0.000001 ? 0 : recovery.nextPitchDebt;
        this.recoilYawDebt = Math.abs(recovery.nextYawDebt) < 0.000001 ? 0 : recovery.nextYawDebt;
    }

    private resetRecoilState() {
        this.recoilIndex = 0;
        this.recoverLine = 0;
        this.recoilPitchDebt = 0;
        this.recoilYawDebt = 0;
        this.shotCounter = 0;
        this.lastShotGapSeconds = 999;
    }
}
