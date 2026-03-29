import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { WeaponComponentsPositionUtil } from '@src/core/lib/WeaponComponentsPositionUtil';
import { BulletImpactEvent, GameLogicEventPipe } from '@src/gameplay/pipes/GameLogicEventPipe';
import { getRuntimeTuningSnapshot } from '@src/gameplay/tuning/RuntimeTuning';
import {
    BufferGeometry,
    Line,
    LineBasicMaterial,
    Scene,
    Vector3,
} from 'three';

type Tracer = {
    line: Line;
    material: LineBasicMaterial;
    createdAt: number;
    lifetime: number;
};

export class BulletTracerLayer implements CycleInterface, LoopInterface {
    private scene: Scene;
    private tracers: Tracer[] = [];
    private weaponComponentsPositionUtil: WeaponComponentsPositionUtil;

    init(): void {
        this.scene = GameContext.Scenes.Sprites;
        this.weaponComponentsPositionUtil = WeaponComponentsPositionUtil.getInstance();
        GameLogicEventPipe.addEventListener(BulletImpactEvent.type, (e: CustomEvent) => {
            this.spawnTracer(e.detail.point, `${e.detail.weaponId || ''}`);
        });
    }

    private spawnTracer(hitPoint: Vector3, weaponId: string) {
        const fx = getRuntimeTuningSnapshot().effects;
        const start = this.weaponComponentsPositionUtil.calculateMuzzlePosition().clone();
        const dir = new Vector3().copy(hitPoint).sub(start);
        const length = dir.length();
        if (length <= 0.1) return;
        dir.multiplyScalar(1 / length);
        start.addScaledVector(dir, 0.04);

        const key = weaponId.toLowerCase();
        const isAwp = key.includes('awp');
        const isSmg = key.includes('mp9') || key.includes('mac10') || key.includes('p90');
        const isSuppressed = key.includes('m4a1_s') || key.includes('usp_s');

        const geometry = new BufferGeometry().setFromPoints([start, hitPoint.clone()]);
        const material = new LineBasicMaterial({
            color: isSuppressed ? 0xd7dccf : (isAwp ? 0xfff6cc : 0xfff2b0),
            transparent: true,
            opacity: (isSuppressed ? 0.45 : (isAwp ? 1 : 0.88)) * fx.tracerOpacityMul,
            depthWrite: false,
            depthTest: false,
        });
        const line = new Line(geometry, material);
        line.renderOrder = 999;
        line.scale.setScalar(isSmg ? 0.92 : 1);
        this.scene.add(line);
        this.tracers.push({
            line,
            material,
            createdAt: GameContext.GameLoop.Clock.getElapsedTime(),
            lifetime: (isAwp ? 0.085 : (isSmg ? 0.045 : 0.06)) * fx.tracerLifetimeMul,
        });
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        if (!this.tracers.length) return;
        const elapsed = elapsedTime || 0;
        const next: Tracer[] = [];

        for (let i = 0; i < this.tracers.length; i++) {
            const tracer = this.tracers[i];
            const age = elapsed - tracer.createdAt;
            if (age >= tracer.lifetime) {
                this.scene.remove(tracer.line);
                tracer.line.geometry.dispose();
                tracer.material.dispose();
                continue;
            }

            tracer.material.opacity = Math.max(0, 1 - (age / tracer.lifetime));
            next.push(tracer);
        }

        this.tracers = next;
    }
}
