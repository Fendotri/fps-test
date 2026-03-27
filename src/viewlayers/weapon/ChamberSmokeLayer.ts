

import { GameContext } from '@src/core/GameContext'

import chamberSmokeVert from '@assets/shaders/chamber/smoke.vert?raw'
import chamberSmokeFrag from '@assets/shaders/chamber/smoke.frag?raw'


import smokeTexture from '@assets/textures/smoke.png';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { WeaponComponentsPositionUtil } from '@src/core/lib/WeaponComponentsPositionUtil';
import { GameLogicEventPipe, WeaponEquipEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { LayerEventPipe, ShotOutWeaponFireEvent } from '@src/gameplay/pipes/LayerEventPipe';
import { scaleQualityCount, scaleQualityTime } from '@src/core/RuntimeQuality';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Camera, Points, Scene, ShaderMaterial, Texture } from 'three';

const image = new Image();
const texture = new Texture(image);
image.src = smokeTexture;
image.onload = () => { texture.needsUpdate = true; }

// å·¥å…·å˜é‡

const array3Util: Array<number> = new Array<number>(3);
const array1Util: Array<number> = new Array<number>(1);
/**
 * æ­¦å™¨å¼€ç«çƒŸé›¾æ•ˆæœ
 */
export class ChamberSmokeLayer implements CycleInterface, LoopInterface {

    ifRender: boolean = false;

    scene: Scene;
    camera: Camera;
    handModelCamera: Camera;

    maximun: number = scaleQualityCount(20 * 2, 12); // æœ€å¤§äº§ç”Ÿå¼¹å£³è´´å›¾çš„æ•°é‡

    weaponComponentsPositionUtil: WeaponComponentsPositionUtil;

    chamberSmokeOpacityFactor: number = .1; // é€æ˜åº¦
    chamberSmokeDisapperTime: number = scaleQualityTime(1., .45); // æ¶ˆæ•£æ—¶é—´
    chamberSmokeFadeTime: number = scaleQualityTime(1.5, .65); // æ¶ˆæ•£æ¸å˜æ—¶é—´
    chamberSmokeScale: number = 1.5; // å¼¹å­”å¤§å°
    chamberSmokeSpeed: number = .2; // çƒŸé›¾è¿åŠ¨é€Ÿåº¦
    chamberSmokeDisappearTime: number = scaleQualityTime(.4, .2); // å¼¹å­”å­˜åœ¨æ—¶é—´(å¤šå°‘ç§’åå¼€å§‹æ¸å˜æ¶ˆå¤±) Math.sqrt(1.8/9.8) çº¦ç­‰äº0.4 

    chamberSmokeGeometry: BufferGeometry = new BufferGeometry();
    chamberSmokeSM: ShaderMaterial = new ShaderMaterial({
        transparent: true,
        blending: AdditiveBlending,
        uniforms: {
            uTime: { value: 0. },
            uSmokeT: { value: texture },
            uOpacityFactor: { value: this.chamberSmokeOpacityFactor },
            uDisappearTime: { value: this.chamberSmokeDisapperTime },
            uSpeed: { value: this.chamberSmokeSpeed },
            uFadeTime: { value: this.chamberSmokeFadeTime },
            uScale: { value: this.chamberSmokeScale },
            uDisapperTime: { value: this.chamberSmokeDisappearTime },
        },
        // depthTest: NeverDepth,
        depthWrite: false, // ç›®çš„æ˜¯åœ¨è¿›è¡Œæ·±åº¦æ£€æµ‹æ—¶è‡ªå·±ä¸ä¼šå½±å“è‡ªå·±
        vertexShader: chamberSmokeVert,
        fragmentShader: chamberSmokeFrag,
    });

    positionFoat32Array: Float32Array; // å‡»ä¸­ä¸‰è§’é¢çš„ç‚¹ä½ç½®
    directionFloat32Array: Float32Array; // çƒŸé›¾è¿åŠ¨æ–¹å‘
    generTimeFLoat32Array: Float32Array; // ç”Ÿæˆè¯¥å¼¹å£³çš„æ—¶é—´
    randFoat32Array: Float32Array; // éšæœºç§å­

    positionBufferAttribute: BufferAttribute;
    directionBufferAttribute: BufferAttribute;
    generTimeBufferAttribute: BufferAttribute;
    randBufferAttribute: BufferAttribute;

    chamberSmokeIndex: number = 0;

    init(): void {

        this.scene = GameContext.Scenes.Sprites;
        this.camera = GameContext.Cameras.PlayerCamera
        this.handModelCamera = GameContext.Cameras.HandModelCamera;

        // æ·»åŠ å¼¹ç‚¹ç²¾çµ

        const chamberSmokes = new Points(this.chamberSmokeGeometry, this.chamberSmokeSM);
        chamberSmokes.frustumCulled = false; // ä¸ç®¡å¦‚ä½•éƒ½ä¼šæ¸²æŸ“
        this.scene.add(chamberSmokes);

        // åˆå§‹åŒ–buffers

        this.initBuffers();

        // å½“å‰è£…å¤‡æ­¦å™¨çš„å¼¹èˆ±ä½ç½®

        this.listenChamberPosition();

        // ç›‘å¬å¼€ç«äº‹ä»¶
        LayerEventPipe.addEventListener(ShotOutWeaponFireEvent.type, (e: CustomEvent) => {
            if (this.ifRender) this.render();
        });

    }

    initBuffers() {

        this.positionFoat32Array = new Float32Array(new ArrayBuffer(4 * 3 * this.maximun));
        this.directionFloat32Array = new Float32Array(new ArrayBuffer(4 * 3 * this.maximun));
        this.generTimeFLoat32Array = new Float32Array(new ArrayBuffer(4 * this.maximun));
        this.randFoat32Array = new Float32Array(new ArrayBuffer(4 * this.maximun));

        for (let i = 0; i < this.maximun; i++) { // é»˜è®¤åˆå§‹åŒ–æ—¶æ‰€æœ‰å¼¹ç‚¹éƒ½ä¸æ˜¾ç¤º, ç»™ä»–ä»¬èµ‹äºˆç”Ÿæˆæ—¶é—´ä¸º-10s
            array1Util[0] = -10;
            this.generTimeFLoat32Array.set(array1Util, i);
        }

        // ç”Ÿæˆ BufferAttribute

        this.positionBufferAttribute = new BufferAttribute(this.positionFoat32Array, 3);
        this.directionBufferAttribute = new BufferAttribute(this.directionFloat32Array, 3);
        this.generTimeBufferAttribute = new BufferAttribute(this.generTimeFLoat32Array, 1);
        this.randBufferAttribute = new BufferAttribute(this.randFoat32Array, 1);

        // æŒ‡å®š BufferAttribute

        this.chamberSmokeGeometry.setAttribute('position', this.positionBufferAttribute);
        this.chamberSmokeGeometry.setAttribute('direction', this.directionBufferAttribute);
        this.chamberSmokeGeometry.setAttribute('generTime', this.generTimeBufferAttribute);
        this.chamberSmokeGeometry.setAttribute('rand', this.randBufferAttribute);

    }

    /**
   * æ›´æ–°å½“å‰è£…å¤‡æ­¦å™¨çš„å¼¹èˆ±ä½ç½®: åªæœ‰å®šä¹‰äº†å¼¹èˆ±ä½ç½®çš„æ­¦å™¨æ‰ä¼šæ¸²æŸ“è¯¥å±‚æ•ˆæœ
   */
    listenChamberPosition() {
        this.weaponComponentsPositionUtil = WeaponComponentsPositionUtil.getInstance();
        GameLogicEventPipe.addEventListener(WeaponEquipEvent.type, (e: CustomEvent) => {
            const _weaponInstance = e.detail.weaponInstance;
            if (_weaponInstance && _weaponInstance.chamberPosition) this.ifRender = true;
            else this.ifRender = false;
        });
    }

    render() {

        // positions

        this.positionFoat32Array.set(
            this.weaponComponentsPositionUtil.calculateChamberPosition().toArray(array3Util, 0),
            this.chamberSmokeIndex * 3
        );
        this.positionBufferAttribute.needsUpdate = true;

        // directions

        const rightDirection = this.weaponComponentsPositionUtil.rightDirection; // çƒŸé›¾å¤§è‡´å‘å³è¿åŠ¨
        this.directionFloat32Array.set(
            rightDirection.toArray(array3Util, 0),
            this.chamberSmokeIndex * 3
        );
        this.directionBufferAttribute.needsUpdate = true;

        // genderTimes

        array1Util[0] = GameContext.GameLoop.Clock.getElapsedTime();
        this.generTimeFLoat32Array.set(array1Util, this.chamberSmokeIndex * 1);
        this.generTimeBufferAttribute.needsUpdate = true;

        // rands

        array1Util[0] = Math.random();
        this.randFoat32Array.set(array1Util, this.chamberSmokeIndex * 1);
        this.randBufferAttribute.needsUpdate = true;

        if (this.chamberSmokeIndex + 1 >= this.maximun) this.chamberSmokeIndex = 0; // å¦‚æœindex+1è¶…è¿‡äº†è®¾ç½®æœ€å¤§æ˜¾ç¤ºå¼¹ç‚¹çš„ä¸Šé™,é‚£ä¹ˆå°±ä»0å¼€å§‹é‡æ–°å¾ªç¯
        else this.chamberSmokeIndex += 1;

    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {

        this.chamberSmokeSM.uniforms.uTime.value = elapsedTime;

    }

}
