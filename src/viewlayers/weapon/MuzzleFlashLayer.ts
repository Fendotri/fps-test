import { AdditiveBlending, BufferAttribute, BufferGeometry, Camera, Points, Scene, ShaderMaterial, Texture, Vector3 } from 'three';
import muzzlesflashVert from '@assets/shaders/muzzle/flash.vert?raw'
import muzzlesflashFrag from '@assets/shaders/muzzle/flash.frag?raw'

import { GameContext } from '@src/core/GameContext'

import flashTexture from '@assets/textures/muzzle.flash.png';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { GameLogicEventPipe, WeaponEquipEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { LayerEventPipe, ShotOutWeaponFireEvent } from '../../gameplay/pipes/LayerEventPipe';
import { getRuntimeQualityProfile, scaleQualityTime } from '@src/core/RuntimeQuality';

const image = new Image();
const texture = new Texture(image);
image.src = flashTexture;
image.onload = () => { texture.needsUpdate = true; }

const muzzlePositionUtil = new Vector3(); // æªå£ä½ç½®
const array3Util: Array<number> = new Array<number>(3);
const array1Util: Array<number> = new Array<number>(1);
const QUALITY = getRuntimeQualityProfile();

/**
 * æªå£ç«å…‰
 */
export class MuzzleFlashLayer implements CycleInterface, LoopInterface {

    ifRender: boolean = false;

    scene: Scene;
    camera: Camera;

    muzzleFlashSize: number = QUALITY.tier === 'low' ? 1.2 : 1.5;
    muzzleFlashTime: number = scaleQualityTime(.01, .006);

    muzzleFlashGeometry: BufferGeometry = new BufferGeometry();
    muzzleFlashSM: ShaderMaterial = new ShaderMaterial({
        uniforms: {
            uScale: { value: this.muzzleFlashSize },
            uTime: { value: -1. },
            uFireTime: { value: -1. },
            uOpenFireT: { value: texture },
            uFlashTime: { value: this.muzzleFlashTime },
        },
        vertexShader: muzzlesflashVert,
        fragmentShader: muzzlesflashFrag,
        blending: AdditiveBlending,
    });

    positionFoat32Array: Float32Array;
    positionBufferAttribute: BufferAttribute;
    randFloat32Array: Float32Array;
    randBufferAttribute: BufferAttribute;

    init(): void {

        // ç±»æŒ‡é’ˆ
        this.scene = GameContext.Scenes.Handmodel;
        this.camera = GameContext.Cameras.PlayerCamera;

        // æ·»åŠ ç‰©ä½“è‡³åœºæ™¯
        const muzzleFlash = new Points(this.muzzleFlashGeometry, this.muzzleFlashSM);
        muzzleFlash.frustumCulled = false;
        this.scene.add(muzzleFlash);

        // åˆå§‹åŒ–buffers
        this.initBuffers();

        // ç›‘å¬å½“å‰æ­¦å™¨çš„æªå£ä½ç½®
        GameLogicEventPipe.addEventListener(WeaponEquipEvent.type, (e: CustomEvent) => {
            const _weaponInstance = e.detail.weaponInstance;
            if (_weaponInstance && _weaponInstance.muzzlePosition) {
                muzzlePositionUtil.copy(_weaponInstance.muzzlePosition); // åˆ¤æ–­æ˜¯å¦æœ‰æªå£ä½ç½®, æœ‰æªå£ä½ç½®å°±æ¸²æŸ“ç«å…‰
                this.ifRender = true;
            }
            else this.ifRender = false;
        })

        // ç›‘å¬æ¸²æŸ“äº‹ä»¶
        LayerEventPipe.addEventListener(ShotOutWeaponFireEvent.type, (e: CustomEvent) => {
            if (this.ifRender) this.render();
        });
    }

    initBuffers(): void {

        this.positionFoat32Array = new Float32Array(new ArrayBuffer(4 * 3));
        this.randFloat32Array = new Float32Array(new ArrayBuffer(4 * 1));
        this.positionBufferAttribute = new BufferAttribute(this.positionFoat32Array, 3);
        this.randBufferAttribute = new BufferAttribute(this.randFloat32Array, 1);

        // åˆ›å»ºå‡ ä½•

        this.muzzleFlashGeometry.setAttribute('position', this.positionBufferAttribute);
        this.muzzleFlashGeometry.setAttribute('rand', this.randBufferAttribute);
    }
    render() {
        // æªå£ä½ç½®
        this.positionFoat32Array.set(muzzlePositionUtil.toArray(array3Util, 0), 0);
        this.positionBufferAttribute.needsUpdate = true;

        // å¼€ç«æ—¶é—´
        this.muzzleFlashSM.uniforms.uFireTime.value = GameContext.GameLoop.Clock.getElapsedTime();

        // é—ªå…‰éšæœºç§å­
        const rand = Math.random();
        array1Util[0] = rand;
        this.randFloat32Array.set(array1Util, 0);
        this.randBufferAttribute.needsUpdate = true;
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        this.muzzleFlashSM.uniforms.uTime.value = elapsedTime; // æ¯å¸§å‘æ˜¾å¡ä¼ å…¥å½“å‰æ¸²æŸ“æ—¶é—´
    }

}
