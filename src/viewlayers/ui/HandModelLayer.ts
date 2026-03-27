import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { PointLockEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { DomEventPipe, PointLockEvent } from '@src/gameplay/pipes/DomEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { MovementController } from '@src/gameplay/input/controllers/MovementController';
import { MathUtils, Vector3 } from 'three';

let deltaZUtil = 0;
let deltaYUtil = 0;

const SWAY_LIMIT = 256;
const SWAY_FOLLOW_SPEED = 14;
const SWAY_RETURN_SPEED = 7;

let swayTargetX = 0;
let swayTargetY = 0;
let swayCurrentX = 0;
let swayCurrentY = 0;

const mouseFloatX = 0.06;
const mouseFloatY = 0.09;

const breathFloatScale = 0.01;
const cameraDefaultPosition = new Vector3();
const legacyCsBob = {
    cl_bobcycle: 0.8,
    cl_bob: 0.01,
    cl_bobup: 0.5,
};
const bobBlendSpeed = 7;
const bobSpeedSmooth = 11;
const bobOffsetSmooth = 16;
const bobGroundGateSmooth = 12;
const bobRollMul = 0.2;

let bobCycleClock = 0;
let bobBlend = 0;
let bobSpeed = 0;
let bobGroundGate = 0;
let bobXCurrent = 0;
let bobYCurrent = 0;
let bobZCurrent = 0;

/**
 * Hand model layer.
 * Uses smoothed mouse sway to avoid jitter while turning.
 */
export class HandModelLayer implements CycleInterface, LoopInterface {

    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    localPlayer: LocalPlayer = LocalPlayer.getInstance();
    animationMixer: THREE.AnimationMixer;

    init(): void {
        this.scene = GameContext.Scenes.Handmodel;

        DomEventPipe.addEventListener(PointLockEvent.type, (e: CustomEvent) => {
            if (this.localPlayer.health <= 0) return;
            if (e.detail.enum === PointLockEventEnum.MOUSEMOVE) {
                swayTargetX = MathUtils.clamp(swayTargetX + e.detail.movementX, -SWAY_LIMIT, SWAY_LIMIT);
                swayTargetY = MathUtils.clamp(swayTargetY + e.detail.movementY, -SWAY_LIMIT, SWAY_LIMIT);
            }
        });

        this.initCameraStatus();
        this.addHandMesh();
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        if (this.localPlayer.health <= 0) {
            this.scene.visible = false;
            return;
        }
        if (!this.scene.visible) this.scene.visible = true;

        if (this.animationMixer) this.animationMixer.update(deltaTime);

        const dt = Math.min(0.05, Math.max(0.001, deltaTime || 0.016));
        const returnLerp = 1 - Math.exp(-SWAY_RETURN_SPEED * dt);
        const followLerp = 1 - Math.exp(-SWAY_FOLLOW_SPEED * dt);

        // Smooth mouse input and decay toward center over time.
        swayTargetX = MathUtils.lerp(swayTargetX, 0, returnLerp);
        swayTargetY = MathUtils.lerp(swayTargetY, 0, returnLerp);
        swayCurrentX = MathUtils.lerp(swayCurrentX, swayTargetX, followLerp);
        swayCurrentY = MathUtils.lerp(swayCurrentY, swayTargetY, followLerp);

        deltaZUtil = MathUtils.mapLinear(swayCurrentX, -SWAY_LIMIT, SWAY_LIMIT, -mouseFloatX, mouseFloatX);
        deltaYUtil = MathUtils.mapLinear(swayCurrentY, -SWAY_LIMIT, SWAY_LIMIT, -mouseFloatY, mouseFloatY);

        const elapsed = elapsedTime || 0;
        const sinDeltaTime = (Math.sin(elapsed) + 1) / 2;
        const breathDelta = GameContext.PointLock.isLocked
            ? MathUtils.lerp(-breathFloatScale, breathFloatScale, sinDeltaTime)
            : 0;

        const movement = MovementController.getSnapshot();
        const speedNormRaw = MathUtils.clamp(movement.speed01, 0, 1.25);
        const speedAlpha = 1 - Math.exp(-bobSpeedSmooth * dt);
        bobSpeed = MathUtils.lerp(bobSpeed, speedNormRaw, speedAlpha);

        const groundGateTarget = (GameContext.PointLock.isLocked && movement.onFloor) ? 1 : 0;
        const groundAlpha = 1 - Math.exp(-bobGroundGateSmooth * dt);
        bobGroundGate = MathUtils.lerp(bobGroundGate, groundGateTarget, groundAlpha);

        const crouchMul = movement.crouching ? 0.58 : 1;
        const bobTarget = bobSpeed * bobGroundGate * crouchMul;
        bobBlend = MathUtils.lerp(bobBlend, bobTarget, 1 - Math.exp(-bobBlendSpeed * dt));
        bobCycleClock += dt;

        const clBobCycle = Math.max(0.1, legacyCsBob.cl_bobcycle);
        const clBobUp = MathUtils.clamp(legacyCsBob.cl_bobup, 0.05, 0.95);
        const cycle01 = (bobCycleClock % clBobCycle) / clBobCycle;
        const wave = cycle01 * Math.PI * 2;
        const upCycle = cycle01 < clBobUp
            ? (cycle01 / clBobUp)
            : (1 - ((cycle01 - clBobUp) / (1 - clBobUp)));
        const legacyBobUpWave = Math.sin(upCycle * Math.PI);

        const bobBase = legacyCsBob.cl_bob * bobBlend;
        const bobX = Math.sin(wave) * bobBase * 0.8;
        const bobY = -legacyBobUpWave * bobBase * 1.1;
        const bobZ = Math.cos(wave * 2) * bobBase * 0.5;
        const bobOffsetAlpha = 1 - Math.exp(-bobOffsetSmooth * dt);
        bobXCurrent = MathUtils.lerp(bobXCurrent, bobX, bobOffsetAlpha);
        bobYCurrent = MathUtils.lerp(bobYCurrent, bobY, bobOffsetAlpha);
        bobZCurrent = MathUtils.lerp(bobZCurrent, bobZ, bobOffsetAlpha);

        this.camera.position.z = cameraDefaultPosition.z + deltaZUtil + bobZCurrent;
        this.camera.position.y = cameraDefaultPosition.y - (deltaYUtil + breathDelta) + bobYCurrent;
        this.camera.position.x = cameraDefaultPosition.x + bobXCurrent;
        this.camera.rotation.z = bobXCurrent * bobRollMul;
    }

    initCameraStatus() {
        this.camera = GameContext.Cameras.HandModelCamera;
        this.camera.clearViewOffset();
        this.camera.near = 0.001;
        this.camera.far = 999;
        this.camera.fov = 70;
        this.camera.scale.z = 1.5;
        this.camera.position.set(-1.6, 1.4, 0);
        cameraDefaultPosition.copy(this.camera.position);
        this.camera.rotation.y = -Math.PI / 2;
    }

    addHandMesh() {
        const armature = GameContext.GameResources.resourceMap.get('Armature') as THREE.Object3D;
        const arms = GameContext.GameResources.resourceMap.get('Arms') as THREE.SkinnedMesh;
        arms.material = this.localPlayer.roleMaterial;
        arms.frustumCulled = false;
        this.animationMixer = GameContext.GameResources.resourceMap.get('AnimationMixer') as THREE.AnimationMixer;
        arms.visible = true;
        this.scene.add(armature);
        this.scene.add(arms);
    }

}
