import bulletShellVert from '@assets/shaders/bullet/shell/bulletshell.vert?raw';
import bulletShellFrag from '@assets/shaders/bullet/shell/bulletshell.frag?raw';

import bulletshellTexture from '@assets/textures/bullet.shell.png';
import { GameContext } from '@src/core/GameContext';
import { scaleQualityCount, scaleQualityTime } from '@src/core/RuntimeQuality';
import { CycleInterface } from '../../core/inferface/CycleInterface';
import { LoopInterface } from '../../core/inferface/LoopInterface';
import { GameLogicEventPipe, WeaponEquipEvent } from '../../gameplay/pipes/GameLogicEventPipe';
import { LayerEventPipe, ShotOutWeaponFireEvent } from '../../gameplay/pipes/LayerEventPipe';
import { BufferAttribute, BufferGeometry, CustomBlending, Points, ShaderMaterial, Texture, Vector3 } from 'three';

// æè´¨

const image = new Image();
const texture = new Texture(image);
image.src = bulletshellTexture;
image.onload = () => { texture.needsUpdate = true; }

// å·¥å…·å˜é‡

const array3Util: Array<number> = new Array<number>(3);
const array1Util: Array<number> = new Array<number>(1);
const chamberPositionUtil = new Vector3(); // å¼¹è†›ä½ç½®

/**
 * å¼€æªå­å¼¹å£³ä»å¼¹èˆ±ä¸­å¼¹å‡º,æ‰è½åˆ°åœ°é¢å¹¶ä¸”åå¼¹èµ·æ¥
 * éœ€è¦çš„å‚æ•°: ç©å®¶ä½ç½®, å½“å‰å¼¹èˆ±çš„ç›¸å¯¹ä½ç½®, 
 */
export class ChamberBulletShell implements CycleInterface, LoopInterface {

    scene: THREE.Scene;
    camera: THREE.Camera;

    ifRender: boolean = false; // æ˜¯å¦æ¸²æŸ“è¯¥å±‚

    maximun: number = scaleQualityCount(10, 4); // æœ€å¤§äº§ç”Ÿå¼¹å£³è´´å›¾çš„æ•°é‡

    bulletShellOpacity: number = 1.; // å¼¹å­”é€æ˜åº¦
    bulletShellScale: number = 1.2; // å¼¹å­”å¤§å°
    bulletShellDisappearTime: number = scaleQualityTime(.4, .2); // å¼¹å­”å­˜åœ¨æ—¶é—´(å¤šå°‘ç§’åå¼€å§‹æ¸å˜æ¶ˆå¤±) Math.sqrt(1.8/9.8) çº¦ç­‰äº0.4 

    bulletShellsGeometry = new BufferGeometry();
    bulletShellsMaterial = new ShaderMaterial({
        uniforms: {
            uTime: { value: -20 },
            uDisapperTime: { value: this.bulletShellDisappearTime },
            uScale: { value: this.bulletShellScale },
            uOpacity: { value: this.bulletShellOpacity },
            uBulletShellT: { value: texture },
        },
        blending: CustomBlending,
        vertexShader: bulletShellVert,
        fragmentShader: bulletShellFrag,
        // depthTest: THREE.NeverDepth, // åªä¼šæ¸²æŸ“åˆ°æœ¬åœ°ç”»é¢,ä¸å¯ç”¨æ·±åº¦æ£€æµ‹
    });

    positionFoat32Array: Float32Array; // å‡»ä¸­ä¸‰è§’é¢çš„ç‚¹ä½ç½®
    generTimeFLoat32Array: Float32Array; // ç”Ÿæˆè¯¥å¼¹å£³çš„æ—¶é—´
    randFoat32Array: Float32Array; // éšæœºç§å­

    positionBufferAttribute: THREE.BufferAttribute;
    generTimeBufferAttribute: THREE.BufferAttribute;
    randBufferAttribute: THREE.BufferAttribute;

    bulletShellIndex: number = 0;

    init(): void {

        // ç»‘å®šæŒ‡é’ˆ
        this.scene = GameContext.Scenes.Handmodel;
        this.camera = GameContext.Cameras.HandModelCamera;

        // æ·»åŠ å¼¹ç‚¹ç²¾çµ
        const bulletShells = new Points(this.bulletShellsGeometry, this.bulletShellsMaterial);
        bulletShells.frustumCulled = false; // ä¸ç®¡å¦‚ä½•éƒ½ä¼šæ¸²æŸ“
        this.scene.add(bulletShells);

        // åˆå§‹åŒ–buffers
        this.initBuffers();

        // ç›‘å¬å½“å‰è£…å¤‡æ­¦å™¨çš„å¼¹èˆ±ä½ç½®
        GameLogicEventPipe.addEventListener(WeaponEquipEvent.type, (e: CustomEvent) => {
            const _weaponInstance = e.detail.weaponInstance;
            if (_weaponInstance && _weaponInstance.chamberPosition) {
                this.ifRender = true;
                chamberPositionUtil.copy(_weaponInstance.chamberPosition);
            } else this.ifRender = false;

        })

        // ç›‘å¬å¼€ç«äº‹ä»¶
        LayerEventPipe.addEventListener(ShotOutWeaponFireEvent.type, (e: CustomEvent) => {
            if (this.ifRender) this.render();
        });
    }

    /**
     * åˆå§‹åŒ–buffers
     */
    initBuffers() {

        // ç”Ÿæˆ array buffer

        this.positionFoat32Array = new Float32Array(new ArrayBuffer(4 * 3 * this.maximun));
        this.generTimeFLoat32Array = new Float32Array(new ArrayBuffer(4 * this.maximun));
        this.randFoat32Array = new Float32Array(new ArrayBuffer(4 * this.maximun));

        for (let i = 0; i < this.maximun; i++) { // é»˜è®¤åˆå§‹åŒ–æ—¶æ‰€æœ‰å¼¹ç‚¹éƒ½ä¸æ˜¾ç¤º, ç»™ä»–ä»¬èµ‹äºˆç”Ÿæˆæ—¶é—´ä¸º-10s
            array1Util[0] = -10;
            this.generTimeFLoat32Array.set(array1Util, i);
        }

        // ç”Ÿæˆ BufferAttribute

        this.positionBufferAttribute = new BufferAttribute(this.positionFoat32Array, 3);
        this.generTimeBufferAttribute = new BufferAttribute(this.generTimeFLoat32Array, 1);
        this.randBufferAttribute = new BufferAttribute(this.randFoat32Array, 1);

        // æŒ‡å®š BufferAttribute

        this.bulletShellsGeometry.setAttribute('position', this.positionBufferAttribute);
        this.bulletShellsGeometry.setAttribute('generTime', this.generTimeBufferAttribute);
        this.bulletShellsGeometry.setAttribute('rand', this.randBufferAttribute);

    }

    /** 
     * æ·»åŠ å¼¹å£³
     */
    render() {

        // å¼¹èˆ±ä½ç½®

        this.positionFoat32Array.set(chamberPositionUtil.toArray(array3Util, 0), this.bulletShellIndex * 3);
        this.positionBufferAttribute.needsUpdate = true;

        // å¼¹å£³ç”Ÿæˆæ—¶é—´

        array1Util[0] = GameContext.GameLoop.Clock.getElapsedTime();
        this.generTimeFLoat32Array.set(array1Util, this.bulletShellIndex);
        this.generTimeBufferAttribute.needsUpdate = true;

        // å¼¹å£³éšæœºç§å­

        const random = Math.random();
        array1Util[0] = random;
        this.randFoat32Array.set(array1Util, this.bulletShellIndex);
        this.randBufferAttribute.needsUpdate = true;

        // æ›´æ–°index

        if (this.bulletShellIndex + 1 >= this.maximun) this.bulletShellIndex = 0; // å¦‚æœindex+1è¶…è¿‡äº†è®¾ç½®æœ€å¤§æ˜¾ç¤ºå¼¹ç‚¹çš„ä¸Šé™,é‚£ä¹ˆå°±ä»0å¼€å§‹é‡æ–°å¾ªç¯
        else this.bulletShellIndex += 1;

    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {

        this.bulletShellsMaterial.uniforms.uTime.value = elapsedTime; // è·Ÿæ–°å½“å‰æ—¶é—´

    }

}
