import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { GameObjectMaterialEnum } from '@src/gameplay/abstract/GameObjectMaterialEnum';
import { BulletImpactEvent, GameLogicEventPipe } from '@src/gameplay/pipes/GameLogicEventPipe';
import { getRuntimeTuningSnapshot } from '@src/gameplay/tuning/RuntimeTuning';
import {
    AdditiveBlending,
    CanvasTexture,
    Color,
    Scene,
    Sprite,
    SpriteMaterial,
    Vector3,
} from 'three';

type HitSprite = {
    sprite: Sprite;
    velocity: Vector3;
    createdAt: number;
    lifetime: number;
    gravity: number;
    baseScale: number;
};

const BODY_MATERIALS = new Set<GameObjectMaterialEnum>([
    GameObjectMaterialEnum.PlayerHead,
    GameObjectMaterialEnum.PlayerChest,
    GameObjectMaterialEnum.PlayerUpperLimb,
    GameObjectMaterialEnum.PlayerLowerLimb,
    GameObjectMaterialEnum.PlayerBelly,
]);

const makeDiscTexture = (inner: string, outer: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
        grad.addColorStop(0, inner);
        grad.addColorStop(0.5, outer);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fill();
    }
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
};

const FLASH_TEXTURE = makeDiscTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.42)');
const BLOOD_TEXTURE = makeDiscTexture('rgba(255,180,180,0.95)', 'rgba(200,40,40,0.55)');

export class BodyHitFXLayer implements CycleInterface, LoopInterface {
    private scene: Scene;
    private sprites: HitSprite[] = [];

    init(): void {
        this.scene = GameContext.Scenes.Sprites;
        GameLogicEventPipe.addEventListener(BulletImpactEvent.type, (e: CustomEvent) => {
            const material = e.detail.material as GameObjectMaterialEnum | null;
            if (material == null || !BODY_MATERIALS.has(material)) return;
            this.spawnHitFx(e.detail.point, e.detail.normal, material === GameObjectMaterialEnum.PlayerHead);
        });
    }

    private spawnHitFx(point: THREE.Vector3, normal: THREE.Vector3, headshot: boolean) {
        const fx = getRuntimeTuningSnapshot().effects;
        const flashScale = fx.bodyFlashScale;
        const particleCountMul = fx.bodyParticleCountMul;
        const particleLifetimeMul = fx.bodyParticleLifetimeMul;
        const particleSpeedMul = fx.bodyParticleSpeedMul;

        this.addSprite(
            point,
            new Vector3(),
            (headshot ? 0.16 : 0.08) * flashScale,
            (headshot ? 0.16 : 0.12) * particleLifetimeMul,
            0,
            FLASH_TEXTURE,
            0xffffff,
            1,
        );

        const particleCount = Math.max(1, Math.round((headshot ? 18 : 6) * particleCountMul));
        for (let i = 0; i < particleCount; i++) {
            const dir = normal.clone().multiplyScalar((0.08 + Math.random() * 0.16) * particleSpeedMul);
            dir.x += (Math.random() - 0.5) * 0.28;
            dir.y += Math.random() * (headshot ? 0.36 : 0.24) * particleSpeedMul;
            dir.z += (Math.random() - 0.5) * 0.28;
            this.addSprite(
                point,
                dir,
                ((headshot ? 0.08 : 0.06) + Math.random() * (headshot ? 0.06 : 0.04)) * flashScale,
                ((headshot ? 0.26 : 0.2) + Math.random() * (headshot ? 0.16 : 0.12)) * particleLifetimeMul,
                0.9,
                BLOOD_TEXTURE,
                headshot ? 0xff7a7a : 0xe86a6a,
                headshot ? 0.96 : 0.88,
            );
        }

        if (headshot) {
            const burstCount = Math.max(1, Math.round(4 * particleCountMul));
            for (let i = 0; i < burstCount; i++) {
                const burstDir = new Vector3(
                    (Math.random() - 0.5) * 0.52,
                    (0.18 + Math.random() * 0.36) * particleSpeedMul,
                    (Math.random() - 0.5) * 0.52,
                ).addScaledVector(normal, 0.12 * particleSpeedMul);
                this.addSprite(
                    point,
                    burstDir,
                    (0.12 + Math.random() * 0.05) * flashScale,
                    (0.16 + Math.random() * 0.08) * particleLifetimeMul,
                    0.55,
                    FLASH_TEXTURE,
                    0xffe6e6,
                    0.92,
                );
            }
        }
    }

    private addSprite(
        point: THREE.Vector3,
        velocity: Vector3,
        scale: number,
        lifetime: number,
        gravity: number,
        texture: CanvasTexture,
        colorHex: number,
        opacity: number,
    ) {
        const material = new SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: AdditiveBlending,
            color: new Color(colorHex),
            opacity,
        });
        const sprite = new Sprite(material);
        sprite.position.copy(point).addScaledVector(velocity, 0.2);
        sprite.scale.setScalar(scale);
        this.scene.add(sprite);
        this.sprites.push({
            sprite,
            velocity,
            createdAt: GameContext.GameLoop.Clock.getElapsedTime(),
            lifetime,
            gravity,
            baseScale: scale,
        });
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        if (!this.sprites.length) return;
        const dt = Math.min(0.05, Math.max(0.001, deltaTime || 0));
        const elapsed = elapsedTime || 0;
        const next: HitSprite[] = [];

        for (let i = 0; i < this.sprites.length; i++) {
            const item = this.sprites[i];
            const age = elapsed - item.createdAt;
            if (age >= item.lifetime) {
                this.scene.remove(item.sprite);
                (item.sprite.material as SpriteMaterial).dispose();
                continue;
            }

            item.velocity.y -= item.gravity * dt;
            item.sprite.position.addScaledVector(item.velocity, dt);
            const life01 = 1 - (age / item.lifetime);
            item.sprite.scale.setScalar(item.baseScale * (0.75 + life01 * 0.8));
            (item.sprite.material as SpriteMaterial).opacity = life01 * life01;
            next.push(item);
        }

        this.sprites = next;
    }
}
