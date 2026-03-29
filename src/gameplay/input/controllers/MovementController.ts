import { Capsule } from 'three/examples/jsm/math/Capsule';
import { Octree } from 'three/examples/jsm/math/Octree';
import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';
import { PointLockEventEnum, UserInputEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { GameLogicEventPipe, PlayerDamagedEvent, WeaponEquipEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { UserInputEvent, UserInputEventPipe } from '@src/gameplay/pipes/UserinputEventPipe';
import { DomEventPipe, PointLockEvent } from '@src/gameplay/pipes/DomEventPipe';
import { getRuntimeTuningSnapshot, subscribeRuntimeTuning } from '@src/gameplay/tuning/RuntimeTuning';
import { MathUtils, Vector3 } from 'three';

const STEPS_PER_FRAME = 5;
const GRAVITY = 30;
const PLAYER_OOB_Y = -220;
const vec3Util = new Vector3();

export const PLAYER_COLLIDER_RADIUS = 0.32;
export const PLAYER_STANDING_END_OFFSET = 1.38;
export const PLAYER_CROUCH_END_OFFSET = 0.97;

export type MovementSnapshot = {
    onFloor: boolean;
    crouching: boolean;
    walking: boolean;
    horizontalSpeed: number;
    verticalSpeed: number;
    speed01: number;
    landingImpact: number;
    airborneTime: number;
};

type SurfaceTune = {
    groundProbeDepth: number;
    walkableFloorNormalY: number;
    groundStickDownSpeed: number;
    stepHeight: number;
    stepMinHorizontalSpeed: number;
    stepBlockNormalY: number;
};

const DEFAULT_CONFIG = {
    groundAccel: 62,
    airAccel: 11.5,
    friction: 8.1,
    stopSpeed: 1.95,
    noInputFrictionMul: 1.6,
    hardStopSpeed: 0.42,
    maxGroundSpeed: 5.05,
    maxAirSpeed: 5.45,
    walkSpeedMul: 0.53,
    crouchSpeedMul: 0.34,
    backwardSpeedMul: 0.96,
    sideSpeedMul: 1.0,
    jumpSpeed: 8.05,
    jumpBufferMs: 120,
    crouchEndOffset: PLAYER_CROUCH_END_OFFSET,
    standingEndOffset: PLAYER_STANDING_END_OFFSET,
    crouchTransitionSpeed: 18,
    landingDecay: 2.4,
    cameraGroundYSmooth: 22,
    cameraAirYSmooth: 46,
    cameraYDeadZone: 0.0035,
    standCheckInset: 0.03,
    standReleaseDelay: 0.12,
    crouchStandEpsilon: 0.02,
    jumpMinIntervalMs: 40,
    bunnyHopSpeedCapMul: 1.2,
    bunnyHopCarryPenalty: 0.93,
    cameraBobCycle: 0.7,
    cameraBob: 0.0125,
    cameraBobUp: 0.5,
    cameraBobBlendSpeed: 13.5,
    cameraBobSpeedSmooth: 11,
    cameraBobGateSmooth: 12,
    cameraBobOffsetSmooth: 18,
    cameraRollFromBob: 0.42,
    damageShakeDurationBase: 0.18,
    damageShakeDurationScale: 0.16,
    damageShakeDecay: 1.85,
    damageShakeFreqBase: 26,
    damageShakeFreqScale: 14,
    damageShakePosX: 0.01,
    damageShakePosY: 0.007,
    damageShakePosZ: 0.005,
    damageShakeRoll: 0.018,
    damagePunchPitch: 0.012,
    damagePunchYaw: 0.008,
    damagePunchSmooth: 22,
};

const DEFAULT_SURFACE_TUNE: SurfaceTune = {
    groundProbeDepth: 0.22,
    walkableFloorNormalY: 0.45,
    groundStickDownSpeed: 2.2,
    stepHeight: 0.28,
    stepMinHorizontalSpeed: 0.45,
    stepBlockNormalY: 0.25,
};

const MIRAGE_SURFACE_TUNE: SurfaceTune = {
    groundProbeDepth: 0.24,
    walkableFloorNormalY: 0.43,
    groundStickDownSpeed: 2.4,
    stepHeight: 0.31,
    stepMinHorizontalSpeed: 0.34,
    stepBlockNormalY: 0.22,
};

const DUST2_SURFACE_TUNE: SurfaceTune = {
    // Dust2 needs more generous floor snapping, but overly aggressive step assist
    // causes frequent wall/trim snagging on dense collision meshes.
    groundProbeDepth: 0.34,
    walkableFloorNormalY: 0.34,
    groundStickDownSpeed: 3.3,
    stepHeight: 0.4,
    stepMinHorizontalSpeed: 0.18,
    stepBlockNormalY: 0.06,
};

let config = { ...DEFAULT_CONFIG };

const CAMERA_PITCH_MIN = Math.PI / 2 - Math.PI;
const CAMERA_PITCH_MAX = Math.PI / 2;

/**
 * Movement controller with CS-like acceleration/friction and crouch state.
 */
export class MovementController implements CycleInterface, LoopInterface {

    static activeController: MovementController;

    static getSnapshot(): MovementSnapshot {
        const current = MovementController.activeController;
        if (!current) {
            return {
                onFloor: true,
                crouching: false,
                walking: false,
                horizontalSpeed: 0,
                verticalSpeed: 0,
                speed01: 0,
                landingImpact: 0,
                airborneTime: 0,
            };
        }

        return {
            onFloor: current.playerOnFloor,
            crouching: current.isCrouching,
            walking: current.isWalking,
            horizontalSpeed: current.horizontalSpeed,
            verticalSpeed: current.playerVelocity.y,
            speed01: Math.min(2, current.horizontalSpeed / Math.max(0.001, current.currentMaxGroundSpeed)),
            landingImpact: current.landingImpact,
            airborneTime: current.airborneTime,
        };
    }

    playerOctree: Octree = GameContext.Physical.WorldOCTree;
    playerCamera: THREE.Camera;
    playerCollider: Capsule;

    playerOnFloor = true;
    isCrouching = false;
    wantsCrouch = false;
    horizontalSpeed = 0;
    landingImpact = 0;
    equippedSpeedScale = 1.0;
    currentMaxGroundSpeed = config.maxGroundSpeed;
    visualCameraY = 0;
    cameraYInitialized = false;
    standBlocked = false;
    standClearTimer = 0;
    lastJumpTimeMs = -99999;
    jumpQueuedUntilMs = -1;
    airborneTime = 0;
    isWalking = false;
    cameraBobClock = 0;
    cameraBobBlend = 0;
    cameraBobSpeed = 0;
    cameraBobGroundGate = 0;
    cameraBobX = 0;
    cameraBobY = 0;
    cameraBobZ = 0;
    cameraBobRoll = 0;
    damageShakeTime = 0;
    damageShakeDuration = 0;
    damageShakeMagnitude = 0;
    damageShakeSeed = 0;
    damageOffsetX = 0;
    damageOffsetY = 0;
    damageOffsetZ = 0;
    damageRoll = 0;
    damagePitchOffset = 0;
    damageYawOffset = 0;
    appliedDamagePitchOffset = 0;
    appliedDamageYawOffset = 0;
    surfaceTune: SurfaceTune = { ...DEFAULT_SURFACE_TUNE };

    keyStates: Map<UserInputEventEnum, boolean> = new Map();
    playerVelocity: THREE.Vector3 = new Vector3();
    playerDirection: THREE.Vector3 = new Vector3();
    tmpDelta = new Vector3();
    tmpHorizontal = new Vector3();
    tmpVertical = new Vector3();

    init(): void {
        this.playerOctree = GameContext.Physical.WorldOCTree;
        this.playerCamera = GameContext.Cameras.PlayerCamera;
        this.applyRuntimeMovementTune();
        subscribeRuntimeTuning(() => {
            this.applyRuntimeMovementTune();
        });
        this.applyMapSurfaceTune();
        this.playerCollider = new Capsule(
            new Vector3(0, PLAYER_COLLIDER_RADIUS, 0),
            new Vector3(0, PLAYER_STANDING_END_OFFSET, 0),
            PLAYER_COLLIDER_RADIUS,
        );
        this.visualCameraY = this.playerCollider.end.y;
        this.cameraYInitialized = true;
        MovementController.activeController = this;

        UserInputEventPipe.addEventListener(UserInputEvent.type, (e: CustomEvent) => {
            switch (e.detail.enum) {
                case UserInputEventEnum.MOVE_FORWARD_DOWN:
                    this.keyStates.set(UserInputEventEnum.MOVE_FORWARD_DOWN, true);
                    break;
                case UserInputEventEnum.MOVE_BACKWARD_DOWN:
                    this.keyStates.set(UserInputEventEnum.MOVE_BACKWARD_DOWN, true);
                    break;
                case UserInputEventEnum.MOVE_LEFT_DOWN:
                    this.keyStates.set(UserInputEventEnum.MOVE_LEFT_DOWN, true);
                    break;
                case UserInputEventEnum.MOVE_RIGHT_DOWN:
                    this.keyStates.set(UserInputEventEnum.MOVE_RIGHT_DOWN, true);
                    break;
                case UserInputEventEnum.MOVE_FORWARD_UP:
                    this.keyStates.set(UserInputEventEnum.MOVE_FORWARD_DOWN, false);
                    break;
                case UserInputEventEnum.MOVE_BACKWARD_UP:
                    this.keyStates.set(UserInputEventEnum.MOVE_BACKWARD_DOWN, false);
                    break;
                case UserInputEventEnum.MOVE_LEFT_UP:
                    this.keyStates.set(UserInputEventEnum.MOVE_LEFT_DOWN, false);
                    break;
                case UserInputEventEnum.MOVE_RIGHT_UP:
                    this.keyStates.set(UserInputEventEnum.MOVE_RIGHT_DOWN, false);
                    break;
                case UserInputEventEnum.CROUCH_DOWN:
                    this.wantsCrouch = true;
                    break;
                case UserInputEventEnum.CROUCH_UP:
                    this.wantsCrouch = false;
                    break;
                case UserInputEventEnum.WALK_DOWN:
                    this.isWalking = true;
                    break;
                case UserInputEventEnum.WALK_UP:
                    this.isWalking = false;
                    break;
                case UserInputEventEnum.JUMP:
                    this.queueJump();
                    break;
            }
        });

        GameLogicEventPipe.addEventListener(WeaponEquipEvent.type, (e: CustomEvent) => {
            const weapon = e.detail.weaponInstance;
            if (!weapon) {
                this.equippedSpeedScale = 1.0;
                return;
            }
            this.equippedSpeedScale = this.resolveWeaponSpeedScale(weapon.speed, weapon.weaponClassificationEnum);
        });

        GameLogicEventPipe.addEventListener(PlayerDamagedEvent.type, (e: CustomEvent) => {
            const rawDamage = Math.max(1, Number(e.detail.damage) || 1);
            const headshot = !!e.detail.headshot;
            const intensityBase = MathUtils.clamp(rawDamage / 45, 0.2, 1.4);
            const intensity = headshot ? intensityBase * 1.18 : intensityBase;

            this.damageShakeTime = 0;
            this.damageShakeDuration = Math.max(
                this.damageShakeDuration * 0.35,
                config.damageShakeDurationBase + intensity * config.damageShakeDurationScale,
            );
            this.damageShakeMagnitude = Math.min(1.8, this.damageShakeMagnitude + intensity * 0.9);
            this.damageShakeSeed = Math.random() * Math.PI * 2;
        });

        DomEventPipe.addEventListener(PointLockEvent.type, (e: CustomEvent) => {
            if (e.detail.enum === PointLockEventEnum.UNLOCK) this.clearInputState();
        });

        window.addEventListener('blur', () => { this.clearInputState(); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') this.clearInputState();
        });
    }

    private applyMapSurfaceTune() {
        const mapAssetPath = `${(GameContext.GameResources.resourceMap.get('Map') as any)?.scene?.userData?.mapAssetPath || ''}`.toLowerCase();
        if (mapAssetPath.includes('dust')) {
            this.surfaceTune = { ...DUST2_SURFACE_TUNE };
            return;
        }
        if (mapAssetPath.includes('mirage')) {
            this.surfaceTune = { ...MIRAGE_SURFACE_TUNE };
            return;
        }
        this.surfaceTune = { ...DEFAULT_SURFACE_TUNE };
    }

    callEveryFrame(deltaTime?: number): void {
        const dt = Math.min(0.05, deltaTime || 0) / STEPS_PER_FRAME;
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
            this.consumeQueuedJump();
            this.landingImpact = Math.max(0, this.landingImpact - config.landingDecay * dt);
            this.handleCrouch(dt);
            this.controls(dt);
            this.updatePlayer(dt);
            this.teleportPlayerIfOob();
        }
    }

    controls(deltaTime: number): void {
        this.playerDirection.set(0, 0, 0);

        if (this.keyStates.get(UserInputEventEnum.MOVE_FORWARD_DOWN)) {
            this.playerDirection.add(this.getForwardVector().normalize());
        }
        if (this.keyStates.get(UserInputEventEnum.MOVE_BACKWARD_DOWN)) {
            this.playerDirection.add(this.getForwardVector().normalize().multiplyScalar(-config.backwardSpeedMul));
        }
        if (this.keyStates.get(UserInputEventEnum.MOVE_LEFT_DOWN)) {
            this.playerDirection.add(this.getSideVector().normalize().multiplyScalar(-config.sideSpeedMul));
        }
        if (this.keyStates.get(UserInputEventEnum.MOVE_RIGHT_DOWN)) {
            this.playerDirection.add(this.getSideVector().normalize().multiplyScalar(config.sideSpeedMul));
        }
        if (this.playerDirection.lengthSq() > 1) this.playerDirection.normalize();
        const hasMoveInput = this.playerDirection.lengthSq() > 0.0001;

        if (this.playerOnFloor) this.applyGroundFriction(deltaTime, hasMoveInput);

        this.currentMaxGroundSpeed = config.maxGroundSpeed * this.equippedSpeedScale;
        const crouchMul = this.isCrouching ? config.crouchSpeedMul : 1;
        const walkMul = this.isWalking ? config.walkSpeedMul : 1;
        const wishSpeed = this.currentMaxGroundSpeed * crouchMul * walkMul;
        const accel = this.playerOnFloor ? config.groundAccel : config.airAccel;
        const maxAirSpeed = config.maxAirSpeed * this.equippedSpeedScale * (this.isWalking ? 0.9 : 1.02);
        const maxSpeed = this.playerOnFloor ? wishSpeed : maxAirSpeed;

        this.accelerate(this.playerDirection, wishSpeed, accel, maxSpeed, deltaTime);
    }

    private applyGroundFriction(deltaTime: number, hasMoveInput: boolean) {
        const speed = Math.sqrt(this.playerVelocity.x * this.playerVelocity.x + this.playerVelocity.z * this.playerVelocity.z);
        if (speed <= 0.0001) return;

        const control = Math.max(speed, config.stopSpeed);
        let drop = control * config.friction * deltaTime;
        if (!hasMoveInput) drop *= config.noInputFrictionMul;

        const next = Math.max(0, speed - drop);
        if (next === speed) return;

        if (!hasMoveInput && next < config.hardStopSpeed) {
            this.playerVelocity.x = 0;
            this.playerVelocity.z = 0;
            return;
        }

        const scale = next / speed;
        this.playerVelocity.x *= scale;
        this.playerVelocity.z *= scale;
    }

    private accelerate(direction: Vector3, wishSpeed: number, accel: number, maxSpeed: number, deltaTime: number) {
        if (direction.lengthSq() <= 0.0001) return;

        const currentSpeed = this.playerVelocity.dot(direction);
        let addSpeed = wishSpeed - currentSpeed;
        if (addSpeed <= 0) return;

        let accelSpeed = accel * deltaTime * wishSpeed;
        if (accelSpeed > addSpeed) accelSpeed = addSpeed;

        this.playerVelocity.addScaledVector(direction, accelSpeed);

        const horizontalSpeed = Math.sqrt(this.playerVelocity.x * this.playerVelocity.x + this.playerVelocity.z * this.playerVelocity.z);
        if (horizontalSpeed > maxSpeed) {
            const scale = maxSpeed / horizontalSpeed;
            this.playerVelocity.x *= scale;
            this.playerVelocity.z *= scale;
        }
    }

    updatePlayer(deltaTime: number) {
        const wasOnFloor = this.playerOnFloor;
        const preVerticalVelocity = this.playerVelocity.y;

        if (this.playerOnFloor) {
            this.playerVelocity.y = Math.max(this.playerVelocity.y, -this.surfaceTune.groundStickDownSpeed);
        } else {
            this.playerVelocity.y -= GRAVITY * deltaTime;
        }

        this.tmpDelta.copy(this.playerVelocity).multiplyScalar(deltaTime);
        const stepped = wasOnFloor && this.tryStepMove(this.tmpDelta);

        if (!stepped) {
            this.playerCollider.translate(this.tmpDelta);

            const result = this.playerOctree.capsuleIntersect(this.playerCollider);
            this.playerOnFloor = false;

            if (result) {
                const floorLike = result.normal.y >= this.surfaceTune.walkableFloorNormalY;
                this.playerOnFloor = floorLike;
                if (!floorLike) {
                    this.playerVelocity.addScaledVector(result.normal, -result.normal.dot(this.playerVelocity));
                } else if (this.playerVelocity.y < 0) {
                    this.playerVelocity.y = 0;
                }
                this.playerCollider.translate(result.normal.multiplyScalar(result.depth));
            } else if (wasOnFloor && preVerticalVelocity <= 0 && this.trySnapToGround()) {
                this.playerOnFloor = true;
                this.playerVelocity.y = 0;
            }
        }

        if (stepped) {
            this.playerOnFloor = true;
            this.playerVelocity.y = 0;
        }

        if (!wasOnFloor && this.playerOnFloor) {
            const impact = Math.min(1, Math.abs(preVerticalVelocity) / 10);
            this.landingImpact = Math.max(this.landingImpact, impact);
        }
        if (this.playerOnFloor) this.airborneTime = 0;
        else this.airborneTime += deltaTime;

        this.horizontalSpeed = Math.sqrt(this.playerVelocity.x * this.playerVelocity.x + this.playerVelocity.z * this.playerVelocity.z);
        this.syncCameraToCollider(deltaTime);
    }

    private tryStepMove(deltaPosition: Vector3) {
        this.tmpHorizontal.set(deltaPosition.x, 0, deltaPosition.z);
        if (this.tmpHorizontal.lengthSq() <= 0.000001) return false;
        if (this.horizontalSpeed < this.surfaceTune.stepMinHorizontalSpeed) return false;
        if (!this.hasStepObstacle(this.tmpHorizontal)) return false;
        return this.tryStepMoveWithHeight(this.tmpHorizontal, this.surfaceTune.stepHeight)
            || this.tryStepMoveWithHeight(this.tmpHorizontal, this.surfaceTune.stepHeight * 1.32);
    }

    private applyRuntimeMovementTune() {
        const movement = getRuntimeTuningSnapshot().movement;
        config = {
            ...DEFAULT_CONFIG,
            groundAccel: movement.groundAccel,
            airAccel: movement.airAccel,
            friction: movement.friction,
            maxGroundSpeed: movement.maxGroundSpeed,
            maxAirSpeed: movement.maxAirSpeed,
            walkSpeedMul: movement.walkSpeedMul,
            crouchSpeedMul: movement.crouchSpeedMul,
            jumpSpeed: movement.jumpSpeed,
        };
    }

    private hasStepObstacle(horizontalDelta: Vector3) {
        const probe = new Capsule(
            this.playerCollider.start.clone(),
            this.playerCollider.end.clone(),
            this.playerCollider.radius,
        );

        probe.translate(horizontalDelta);
        const hit = this.playerOctree.capsuleIntersect(probe);
        if (!hit) return false;

        // Only step when the direct move is blocked by a wall-like obstacle.
        // Floor-like contacts should use the normal movement path to avoid jitter.
        return hit.depth > 0.015 && hit.normal.y < this.surfaceTune.walkableFloorNormalY;
    }

    private tryStepMoveWithHeight(horizontalDelta: Vector3, stepHeight: number) {
        const originalStart = this.playerCollider.start.clone();
        const originalEnd = this.playerCollider.end.clone();

        this.tmpVertical.set(0, stepHeight, 0);
        this.playerCollider.translate(this.tmpVertical);
        const upHit = this.playerOctree.capsuleIntersect(this.playerCollider);
        if (upHit && upHit.normal.y < 0) {
            this.playerCollider.start.copy(originalStart);
            this.playerCollider.end.copy(originalEnd);
            return false;
        }
        if (upHit) this.playerCollider.translate(upHit.normal.multiplyScalar(upHit.depth));

        this.playerCollider.translate(horizontalDelta);
        const sideHit = this.playerOctree.capsuleIntersect(this.playerCollider);
        if (sideHit && sideHit.normal.y < this.surfaceTune.stepBlockNormalY) {
            this.playerCollider.start.copy(originalStart);
            this.playerCollider.end.copy(originalEnd);
            return false;
        }
        if (sideHit) this.playerCollider.translate(sideHit.normal.multiplyScalar(sideHit.depth));

        this.tmpVertical.set(0, -(stepHeight + (this.surfaceTune.groundProbeDepth * 2.25)), 0);
        this.playerCollider.translate(this.tmpVertical);
        const downHit = this.playerOctree.capsuleIntersect(this.playerCollider);
        if (!downHit || downHit.normal.y < this.surfaceTune.walkableFloorNormalY) {
            this.playerCollider.start.copy(originalStart);
            this.playerCollider.end.copy(originalEnd);
            return false;
        }
        this.playerCollider.translate(downHit.normal.multiplyScalar(downHit.depth));
        return true;
    }

    private trySnapToGround() {
        const probe = new Capsule(
            this.playerCollider.start.clone(),
            this.playerCollider.end.clone(),
            this.playerCollider.radius,
        );

        probe.translate(new Vector3(0, -this.surfaceTune.groundProbeDepth, 0));
        const hit = this.playerOctree.capsuleIntersect(probe);
        if (!hit) return false;
        if (hit.normal.y < this.surfaceTune.walkableFloorNormalY) return false;

        this.playerCollider.start.copy(probe.start);
        this.playerCollider.end.copy(probe.end);
        this.playerCollider.translate(hit.normal.multiplyScalar(hit.depth));
        return true;
    }

    private syncCameraToCollider(deltaTime: number) {
        const target = this.playerCollider.end;

        if (!this.cameraYInitialized) {
            this.visualCameraY = target.y;
            this.cameraYInitialized = true;
        }

        const deltaY = target.y - this.visualCameraY;
        if (Math.abs(deltaY) <= config.cameraYDeadZone) {
            this.visualCameraY = target.y;
        } else {
            const smooth = this.playerOnFloor ? config.cameraGroundYSmooth : config.cameraAirYSmooth;
            const alpha = 1 - Math.exp(-smooth * deltaTime);
            this.visualCameraY += deltaY * alpha;
        }

        this.updateWalkCameraBob(deltaTime);
        this.updateDamageCameraShake(deltaTime);
        this.playerCamera.position.copy(target);
        this.playerCamera.position.y = this.visualCameraY + this.cameraBobY + this.damageOffsetY;
        this.playerCamera.position.addScaledVector(this.getSideVector(), this.cameraBobX + this.damageOffsetX);
        this.playerCamera.position.addScaledVector(this.getForwardVector(), this.cameraBobZ + this.damageOffsetZ);
        this.playerCamera.rotation.z = this.cameraBobRoll + this.damageRoll;
        this.applyDamageAimPunch();
    }

    private updateDamageCameraShake(deltaTime: number) {
        let targetX = 0;
        let targetY = 0;
        let targetZ = 0;
        let targetRoll = 0;
        let targetPitch = 0;
        let targetYaw = 0;

        if (this.damageShakeDuration > 0 && this.damageShakeMagnitude > 0.001) {
            this.damageShakeTime += deltaTime;
            const life = MathUtils.clamp(this.damageShakeTime / Math.max(0.001, this.damageShakeDuration), 0, 1);
            const envelope = (1 - life) * (1 - life);
            const pulse = this.damageShakeMagnitude * envelope;
            const freq = config.damageShakeFreqBase + this.damageShakeMagnitude * config.damageShakeFreqScale;
            const phase = (this.damageShakeTime * freq) + this.damageShakeSeed;

            targetX = Math.sin(phase * 1.2) * config.damageShakePosX * pulse;
            targetY = -Math.abs(Math.cos(phase * 1.6)) * config.damageShakePosY * pulse;
            targetZ = Math.sin(phase * 2.0) * config.damageShakePosZ * pulse;
            targetRoll = Math.sin(phase * 1.4) * config.damageShakeRoll * pulse;
            targetPitch = Math.abs(Math.sin(phase * 1.7)) * config.damagePunchPitch * pulse;
            targetYaw = Math.sin(phase * 1.05) * config.damagePunchYaw * pulse;

            this.damageShakeMagnitude = Math.max(0, this.damageShakeMagnitude - deltaTime * config.damageShakeDecay);
            if (life >= 1 && this.damageShakeMagnitude <= 0.02) {
                this.damageShakeDuration = 0;
                this.damageShakeTime = 0;
                this.damageShakeMagnitude = 0;
            }
        }

        const alpha = 1 - Math.exp(-config.damagePunchSmooth * deltaTime);
        this.damageOffsetX = MathUtils.lerp(this.damageOffsetX, targetX, alpha);
        this.damageOffsetY = MathUtils.lerp(this.damageOffsetY, targetY, alpha);
        this.damageOffsetZ = MathUtils.lerp(this.damageOffsetZ, targetZ, alpha);
        this.damageRoll = MathUtils.lerp(this.damageRoll, targetRoll, alpha);
        this.damagePitchOffset = MathUtils.lerp(this.damagePitchOffset, targetPitch, alpha);
        this.damageYawOffset = MathUtils.lerp(this.damageYawOffset, targetYaw, alpha);
    }

    private applyDamageAimPunch() {
        const basePitch = this.playerCamera.rotation.x - this.appliedDamagePitchOffset;
        const baseYaw = this.playerCamera.rotation.y - this.appliedDamageYawOffset;

        const nextPitch = MathUtils.clamp(basePitch + this.damagePitchOffset, CAMERA_PITCH_MIN, CAMERA_PITCH_MAX);
        const nextYaw = baseYaw + this.damageYawOffset;

        this.playerCamera.rotation.x = nextPitch;
        this.playerCamera.rotation.y = nextYaw;
        this.appliedDamagePitchOffset = nextPitch - basePitch;
        this.appliedDamageYawOffset = this.damageYawOffset;
    }

    private updateWalkCameraBob(deltaTime: number) {
        const speed01Raw = MathUtils.clamp(this.horizontalSpeed / Math.max(0.001, this.currentMaxGroundSpeed), 0, 1.25);
        const speedAlpha = 1 - Math.exp(-config.cameraBobSpeedSmooth * deltaTime);
        this.cameraBobSpeed = MathUtils.lerp(this.cameraBobSpeed, speed01Raw, speedAlpha);

        const gateTarget = (GameContext.PointLock.isLocked && this.playerOnFloor) ? 1 : 0;
        const gateAlpha = 1 - Math.exp(-config.cameraBobGateSmooth * deltaTime);
        this.cameraBobGroundGate = MathUtils.lerp(this.cameraBobGroundGate, gateTarget, gateAlpha);

        const crouchMul = this.isCrouching ? 0.62 : 1;
        const bobTarget = this.cameraBobSpeed * this.cameraBobGroundGate * crouchMul;
        const blendAlpha = 1 - Math.exp(-config.cameraBobBlendSpeed * deltaTime);
        this.cameraBobBlend = MathUtils.lerp(this.cameraBobBlend, bobTarget, blendAlpha);

        const cycle = Math.max(0.1, config.cameraBobCycle);
        this.cameraBobClock += deltaTime * MathUtils.lerp(0.45, 1.0, Math.min(1, this.cameraBobBlend));
        const cycle01 = (this.cameraBobClock % cycle) / cycle;
        const wave = cycle01 * Math.PI * 2;
        const bobUp = MathUtils.clamp(config.cameraBobUp, 0.05, 0.95);
        const upCycle = cycle01 < bobUp
            ? (cycle01 / bobUp)
            : (1 - ((cycle01 - bobUp) / (1 - bobUp)));
        const upWave = Math.sin(upCycle * Math.PI);

        const bobBase = config.cameraBob * this.cameraBobBlend;
        const stepWave = Math.pow(Math.abs(Math.sin(wave)), 0.42);
        const targetBobX = Math.sin(wave) * bobBase * 0.95;
        const targetBobY = -stepWave * bobBase * 1.9;
        const targetBobZ = Math.cos(wave * 2) * bobBase * 0.58 - stepWave * bobBase * 0.1;
        const targetRoll = targetBobX * config.cameraRollFromBob;

        const offsetAlpha = 1 - Math.exp(-config.cameraBobOffsetSmooth * deltaTime);
        this.cameraBobX = MathUtils.lerp(this.cameraBobX, targetBobX, offsetAlpha);
        this.cameraBobY = MathUtils.lerp(this.cameraBobY, targetBobY, offsetAlpha);
        this.cameraBobZ = MathUtils.lerp(this.cameraBobZ, targetBobZ, offsetAlpha);
        this.cameraBobRoll = MathUtils.lerp(this.cameraBobRoll, targetRoll, offsetAlpha);
    }

    private handleCrouch(deltaTime: number) {
        const feetY = this.playerCollider.start.y - this.playerCollider.radius;
        const currentEndOffset = this.playerCollider.end.y - feetY;
        const tryingToStand =
            !this.wantsCrouch &&
            (currentEndOffset < config.standingEndOffset - config.crouchStandEpsilon || this.standBlocked);

        if (this.wantsCrouch) {
            this.standBlocked = false;
            this.standClearTimer = 0;
        } else if (tryingToStand) {
            const blockedNow = !this.canStand(feetY);
            if (blockedNow) {
                this.standBlocked = true;
                this.standClearTimer = 0;
            } else if (this.standBlocked) {
                this.standClearTimer += deltaTime;
                if (this.standClearTimer >= config.standReleaseDelay) {
                    this.standBlocked = false;
                    this.standClearTimer = 0;
                }
            }
        } else {
            this.standBlocked = false;
            this.standClearTimer = 0;
        }

        const shouldCrouch = this.wantsCrouch || this.standBlocked;
        const targetEndOffset = shouldCrouch ? config.crouchEndOffset : config.standingEndOffset;

        const blend = Math.min(1, config.crouchTransitionSpeed * deltaTime);
        const nextEndOffset = currentEndOffset + (targetEndOffset - currentEndOffset) * blend;

        this.playerCollider.start.y = feetY + this.playerCollider.radius;
        this.playerCollider.end.y = feetY + nextEndOffset;
        this.isCrouching = nextEndOffset <= (config.crouchEndOffset + config.standingEndOffset) * 0.5;
    }

    private canStand(feetY: number) {
        const testCapsule = new Capsule(
            this.playerCollider.start.clone(),
            this.playerCollider.end.clone(),
            this.playerCollider.radius,
        );
        testCapsule.start.y = feetY + testCapsule.radius + config.standCheckInset;
        testCapsule.end.y = feetY + config.standingEndOffset - config.standCheckInset;

        const result = this.playerOctree.capsuleIntersect(testCapsule);
        if (!result) return true;
        if (result.normal.y > 0.2 && result.depth <= config.standCheckInset * 2) return true;
        return false;
    }

    private resolveWeaponSpeedScale(rawSpeed: number, classification: WeaponClassificationEnum) {
        if (typeof rawSpeed === 'number' && rawSpeed > 0) {
            return Math.min(1.05, Math.max(0.55, rawSpeed / 250));
        }

        switch (classification) {
            case WeaponClassificationEnum.SniperRifle:
                return 0.8;
            case WeaponClassificationEnum.Rifle:
                return 0.86;
            case WeaponClassificationEnum.Shotgun:
                return 0.88;
            case WeaponClassificationEnum.Machinegun:
                return 0.8;
            case WeaponClassificationEnum.Pistol:
            case WeaponClassificationEnum.SMG:
                return 0.95;
            case WeaponClassificationEnum.Malee:
                return 1.0;
            default:
                return 1.0;
        }
    }

    teleportPlayerIfOob() {
        if (this.playerCamera.position.y <= PLAYER_OOB_Y) {
            this.playerCollider.start.set(0, PLAYER_COLLIDER_RADIUS, 0);
            this.playerCollider.end.set(0, PLAYER_STANDING_END_OFFSET, 0);
            this.playerCollider.radius = PLAYER_COLLIDER_RADIUS;
            this.playerCamera.position.copy(this.playerCollider.end);
            this.visualCameraY = this.playerCollider.end.y;
            this.cameraYInitialized = true;
            this.playerCamera.rotation.set(0, 0, 0);
            this.playerVelocity.set(0, 0, 0);
            this.playerOnFloor = true;
            this.landingImpact = 0;
            this.wantsCrouch = false;
            this.standBlocked = false;
            this.standClearTimer = 0;
            this.cameraBobClock = 0;
            this.cameraBobBlend = 0;
            this.cameraBobSpeed = 0;
            this.cameraBobGroundGate = 0;
            this.cameraBobX = 0;
            this.cameraBobY = 0;
            this.cameraBobZ = 0;
            this.cameraBobRoll = 0;
            this.resetDamageCameraShake();
            this.currentMaxGroundSpeed = config.maxGroundSpeed * this.equippedSpeedScale;
        }
    }

    getForwardVector() {
        this.playerCamera.getWorldDirection(vec3Util);
        vec3Util.y = 0;
        vec3Util.normalize();
        return vec3Util;
    }

    getSideVector() {
        this.playerCamera.getWorldDirection(vec3Util);
        vec3Util.y = 0;
        vec3Util.normalize();
        vec3Util.cross(this.playerCamera.up);
        return vec3Util;
    }

    jump() {
        const now = performance.now();
        if (now - this.lastJumpTimeMs < config.jumpMinIntervalMs) return;
        if (this.playerOnFloor) {
            const horizontal = Math.sqrt((this.playerVelocity.x * this.playerVelocity.x) + (this.playerVelocity.z * this.playerVelocity.z));
            const jumpCap = this.currentMaxGroundSpeed * config.bunnyHopSpeedCapMul;
            if (horizontal > jumpCap) {
                const ratio = Math.max(0.72, (jumpCap / horizontal) * config.bunnyHopCarryPenalty);
                this.playerVelocity.x *= ratio;
                this.playerVelocity.z *= ratio;
            }
            this.playerVelocity.y = config.jumpSpeed;
            this.playerOnFloor = false;
            this.landingImpact = Math.min(1, this.landingImpact + 0.32);
            this.lastJumpTimeMs = now;
            this.jumpQueuedUntilMs = -1;
        }
    }

    private queueJump() {
        this.jumpQueuedUntilMs = performance.now() + config.jumpBufferMs;
    }

    private consumeQueuedJump() {
        if (this.jumpQueuedUntilMs < 0) return;
        const now = performance.now();
        if (now > this.jumpQueuedUntilMs) {
            this.jumpQueuedUntilMs = -1;
            return;
        }
        if (!this.playerOnFloor) return;
        this.jump();
    }

    clearInputState() {
        this.keyStates.clear();
        this.wantsCrouch = false;
        this.isWalking = false;
        this.jumpQueuedUntilMs = -1;
        this.airborneTime = 0;
        this.standBlocked = false;
        this.standClearTimer = 0;
        this.horizontalSpeed = 0;
        this.cameraBobBlend = 0;
        this.cameraBobSpeed = 0;
        this.cameraBobGroundGate = 0;
        this.cameraBobX = 0;
        this.cameraBobY = 0;
        this.cameraBobZ = 0;
        this.cameraBobRoll = 0;
        this.resetDamageCameraShake();
    }

    private resetDamageCameraShake() {
        if (this.playerCamera) {
            this.playerCamera.rotation.x = MathUtils.clamp(
                this.playerCamera.rotation.x - this.appliedDamagePitchOffset,
                CAMERA_PITCH_MIN,
                CAMERA_PITCH_MAX,
            );
            this.playerCamera.rotation.y = this.playerCamera.rotation.y - this.appliedDamageYawOffset;
        }
        this.damageShakeTime = 0;
        this.damageShakeDuration = 0;
        this.damageShakeMagnitude = 0;
        this.damageOffsetX = 0;
        this.damageOffsetY = 0;
        this.damageOffsetZ = 0;
        this.damageRoll = 0;
        this.damagePitchOffset = 0;
        this.damageYawOffset = 0;
        this.appliedDamagePitchOffset = 0;
        this.appliedDamageYawOffset = 0;
    }
}
