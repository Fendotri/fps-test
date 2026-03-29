import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial, Vector3 } from 'three';
import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { WeaponComponentsPositionUtil } from '@src/core/lib/WeaponComponentsPositionUtil';
import { GameLogicEventPipe, WeaponEquipEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { LayerEventPipe, ShotOutWeaponFireEvent } from '@src/gameplay/pipes/LayerEventPipe';
import { scaleQualityCount, scaleQualityTime } from '@src/core/RuntimeQuality';

const muzzlePositionUtil = new Vector3();
const forwardUtil = new Vector3();
const rightUtil = new Vector3();
const downUtil = new Vector3();

export class MuzzleSparkLayer implements CycleInterface, LoopInterface {
    private ifRender = false;
    private maximum = scaleQualityCount(48, 28);
    private lifeTime = scaleQualityTime(0.07, 0.045);
    private spawnPerShot = 4;

    private geometry = new BufferGeometry();
    private material = new PointsMaterial({
        size: 0.11,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        vertexColors: true,
        sizeAttenuation: false,
    });

    private positions = new Float32Array();
    private colors = new Float32Array();
    private velocities = new Float32Array();
    private ages = new Float32Array();
    private active = new Float32Array();
    private weaponComponentsPositionUtil: WeaponComponentsPositionUtil;

    private positionAttr: BufferAttribute;
    private colorAttr: BufferAttribute;
    private cursor = 0;

    init(): void {
        this.positions = new Float32Array(this.maximum * 3);
        this.colors = new Float32Array(this.maximum * 3);
        this.velocities = new Float32Array(this.maximum * 3);
        this.ages = new Float32Array(this.maximum);
        this.active = new Float32Array(this.maximum);
        this.positionAttr = new BufferAttribute(this.positions, 3);
        this.colorAttr = new BufferAttribute(this.colors, 3);

        this.geometry.setAttribute('position', this.positionAttr);
        this.geometry.setAttribute('color', this.colorAttr);

        const points = new Points(this.geometry, this.material);
        points.frustumCulled = false;
        GameContext.Scenes.Sprites.add(points);
        this.weaponComponentsPositionUtil = WeaponComponentsPositionUtil.getInstance();

        GameLogicEventPipe.addEventListener(WeaponEquipEvent.type, (e: CustomEvent) => {
            const weapon = e.detail.weaponInstance;
            if (weapon && weapon.muzzlePosition) {
                muzzlePositionUtil.copy(weapon.muzzlePosition);
                this.ifRender = true;
            } else {
                this.ifRender = false;
            }
        });

        LayerEventPipe.addEventListener(ShotOutWeaponFireEvent.type, () => {
            if (!this.ifRender) return;
            this.spawn();
        });
    }

    private spawn() {
        const warm = new Color(1.0, 0.92, 0.62);
        const hot = new Color(1.0, 0.68, 0.18);
        muzzlePositionUtil.copy(this.weaponComponentsPositionUtil.calculateMuzzlePosition());
        GameContext.Cameras.PlayerCamera.getWorldDirection(forwardUtil).normalize();
        rightUtil.crossVectors(forwardUtil, GameContext.Cameras.PlayerCamera.up).normalize();
        downUtil.copy(GameContext.Cameras.PlayerCamera.up).multiplyScalar(-1).normalize();
        muzzlePositionUtil.addScaledVector(forwardUtil, -0.075);

        for (let i = 0; i < this.spawnPerShot; i++) {
            const id = this.cursor;
            const posIndex = id * 3;
            this.positions[posIndex + 0] = muzzlePositionUtil.x;
            this.positions[posIndex + 1] = muzzlePositionUtil.y;
            this.positions[posIndex + 2] = muzzlePositionUtil.z;

            const spreadR = (Math.random() - 0.5) * 0.16;
            const spreadD = Math.random() * 0.05;
            const speed = 0.55 + Math.random() * 0.45;
            const velocity = forwardUtil.clone().multiplyScalar(speed)
                .addScaledVector(rightUtil, spreadR)
                .addScaledVector(downUtil, spreadD);
            this.velocities[posIndex + 0] = velocity.x;
            this.velocities[posIndex + 1] = velocity.y;
            this.velocities[posIndex + 2] = velocity.z;

            const color = Math.random() > 0.45 ? warm : hot;
            this.colors[posIndex + 0] = color.r;
            this.colors[posIndex + 1] = color.g;
            this.colors[posIndex + 2] = color.b;

            this.ages[id] = 0;
            this.active[id] = 1;
            this.cursor = (this.cursor + 1) % this.maximum;
        }

        this.positionAttr.needsUpdate = true;
        this.colorAttr.needsUpdate = true;
    }

    callEveryFrame(deltaTime?: number): void {
        const dt = Math.min(0.05, Math.max(0.001, deltaTime || 0.016));
        let dirty = false;
        for (let i = 0; i < this.maximum; i++) {
            if (this.active[i] <= 0) continue;
            this.ages[i] += dt;
            const life01 = this.ages[i] / this.lifeTime;
            const posIndex = i * 3;
            if (life01 >= 1) {
                this.active[i] = 0;
                this.positions[posIndex + 0] = 0;
                this.positions[posIndex + 1] = -999;
                this.positions[posIndex + 2] = 0;
                dirty = true;
                continue;
            }

            this.positions[posIndex + 0] += this.velocities[posIndex + 0] * dt;
            this.positions[posIndex + 1] += this.velocities[posIndex + 1] * dt;
            this.positions[posIndex + 2] += this.velocities[posIndex + 2] * dt;
            this.velocities[posIndex + 0] *= 0.92;
            this.velocities[posIndex + 1] = (this.velocities[posIndex + 1] - 0.55 * dt) * 0.92;
            this.velocities[posIndex + 2] *= 0.92;

            const fade = Math.max(0, 1 - life01);
            this.colors[posIndex + 0] *= 0.986;
            this.colors[posIndex + 1] *= 0.965 * fade;
            this.colors[posIndex + 2] *= 0.88 * fade;
            dirty = true;
        }

        if (dirty) {
            this.positionAttr.needsUpdate = true;
            this.colorAttr.needsUpdate = true;
        }
    }
}
