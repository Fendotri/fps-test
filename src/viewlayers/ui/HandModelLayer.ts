import { GameContext } from '@src/core/GameContext';
import * as THREE from 'three';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { PointLockEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { DomEventPipe, PointLockEvent } from '@src/gameplay/pipes/DomEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { MovementController } from '@src/gameplay/input/controllers/MovementController';
import { getWeaponEntry } from '@src/gameplay/loadout/weaponCatalog';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { Box3, DoubleSide, Group, MathUtils, Vector3 } from 'three';

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
    private customWeaponAnchor: THREE.Group;
    private customWeaponModel: THREE.Object3D | null = null;
    private customWeaponPath = '';
    private customWeaponId = '';
    private customWeaponLoadId = 0;
    private hiddenResourceKey = '';

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
        this.customWeaponAnchor = new Group();
        this.scene.add(this.customWeaponAnchor);
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
        this.updateCustomWeaponOverride();
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

    private updateCustomWeaponOverride() {
        this.clearCustomWeaponOverride();
    }

    private getResourceKeyForWeapon(weaponId: string) {
        const key = `${weaponId || ''}`.trim().toLowerCase();
        if (key === 'awp') return 'AWP_1';
        if (key === 'mp9') return 'MP9_1';
        if (key === 'usp_s') return 'USP_1';
        if (key === 'm9') return 'M9_1';
        if (key === 'nova' || key === 'xm1014') return 'Nova_1';
        return 'AK47_1';
    }

    private applyBuiltInVisibility(weaponId: string, hidden: boolean) {
        const nextKey = this.getResourceKeyForWeapon(weaponId);
        if (this.hiddenResourceKey && this.hiddenResourceKey !== nextKey) {
            const previous = GameContext.GameResources.resourceMap.get(this.hiddenResourceKey) as THREE.Object3D | undefined;
            if (previous) previous.visible = true;
        }
        const mesh = GameContext.GameResources.resourceMap.get(nextKey) as THREE.Object3D | undefined;
        if (mesh) mesh.visible = !hidden;
        this.hiddenResourceKey = hidden ? nextKey : '';
    }

    private syncCustomWeaponAnchor(weaponId: string) {
        const reference = GameContext.GameResources.resourceMap.get(this.getResourceKeyForWeapon(weaponId)) as THREE.Object3D | undefined;
        if (!reference || !this.customWeaponAnchor) return;
        this.customWeaponAnchor.position.copy(reference.position);
        this.customWeaponAnchor.quaternion.copy(reference.quaternion);
        this.customWeaponAnchor.scale.copy(reference.scale);
    }

    private clearCustomWeaponOverride() {
        if (this.hiddenResourceKey) {
            const prev = GameContext.GameResources.resourceMap.get(this.hiddenResourceKey) as THREE.Object3D | undefined;
            if (prev) prev.visible = true;
        }
        this.hiddenResourceKey = '';
        this.customWeaponId = '';
        this.customWeaponPath = '';
        if (this.customWeaponModel) this.customWeaponAnchor.remove(this.customWeaponModel);
        this.customWeaponModel = null;
        this.customWeaponAnchor.position.set(0, 0, 0);
        this.customWeaponAnchor.rotation.set(0, 0, 0);
        this.customWeaponAnchor.scale.set(1, 1, 1);
    }

    private normalizeCustomWeaponObject(object: THREE.Object3D, weaponId: string) {
        const entry = getWeaponEntry(weaponId);
        object.traverse((child: any) => {
            if (!child?.isMesh) return;
            child.visible = true;
            child.frustumCulled = false;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.filter(Boolean).forEach((material: any) => {
                if ('side' in material) material.side = DoubleSide;
                if ('transparent' in material && material.transparent && material.opacity === 0) material.opacity = 1;
                if ('needsUpdate' in material) material.needsUpdate = true;
            });
        });

        const builtIn = GameContext.GameResources.resourceMap.get(this.getResourceKeyForWeapon(weaponId)) as THREE.Object3D | undefined;
        const builtInBox = builtIn ? new Box3().setFromObject(builtIn) : null;
        const incomingBox = new Box3().setFromObject(object);
        if (incomingBox.isEmpty()) return;
        const incomingCenter = incomingBox.getCenter(new Vector3());
        const incomingSize = incomingBox.getSize(new Vector3());
        object.position.sub(incomingCenter);
        const incomingMax = Math.max(incomingSize.x, incomingSize.y, incomingSize.z, 0.001);

        if (builtInBox && !builtInBox.isEmpty()) {
            const builtInSize = builtInBox.getSize(new Vector3());
            const builtInMax = Math.max(builtInSize.x, builtInSize.y, builtInSize.z, 0.001);
            object.scale.multiplyScalar(builtInMax / incomingMax);
        } else {
            object.scale.multiplyScalar(0.22 / incomingMax);
        }

        const modelScale = Array.isArray(entry?.modelScale) ? entry.modelScale : [1, 1, 1];
        const modelRotation = Array.isArray(entry?.modelRotation) ? entry.modelRotation : [0, 180, 0];
        const modelPosition = Array.isArray(entry?.modelPosition) ? entry.modelPosition : [0.02, 0.98, 0.44];
        object.scale.multiply(new Vector3(modelScale[0] || 1, modelScale[1] || 1, modelScale[2] || 1));
        object.rotation.set(
            MathUtils.degToRad(modelRotation[0] || 0),
            MathUtils.degToRad(modelRotation[1] || 0),
            MathUtils.degToRad(modelRotation[2] || 0),
        );
        object.position.set(modelPosition[0] || 0, modelPosition[1] || 0, modelPosition[2] || 0);
    }

    private async loadCustomWeaponOverride(weaponId: string, modelPath: string) {
        const requestId = ++this.customWeaponLoadId;
        this.clearCustomWeaponOverride();
        const ext = modelPath.split('.').pop()?.toLowerCase() || '';
        const onLoad = (object: THREE.Object3D) => {
            if (requestId !== this.customWeaponLoadId) return;
            this.customWeaponId = weaponId;
            this.customWeaponPath = modelPath;
            this.syncCustomWeaponAnchor(weaponId);
            this.normalizeCustomWeaponObject(object, weaponId);
            this.customWeaponModel = object;
            this.customWeaponAnchor.add(object);
            this.applyBuiltInVisibility(weaponId, true);
        };
        const onError = () => {
            if (requestId !== this.customWeaponLoadId) return;
            this.clearCustomWeaponOverride();
        };

        try {
            if (ext === 'glb' || ext === 'gltf') {
                new GLTFLoader().load(modelPath, (gltf) => onLoad(gltf.scene || gltf.scenes?.[0] || new Group()), undefined, onError);
                return;
            }
            if (ext === 'fbx') {
                new FBXLoader().load(modelPath, (object) => onLoad(object), undefined, onError);
                return;
            }
            if (ext === 'obj') {
                new OBJLoader().load(modelPath, (object) => onLoad(object), undefined, onError);
                return;
            }
            onError();
        } catch {
            onError();
        }
    }

}
