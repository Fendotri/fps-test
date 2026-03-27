import { Vector3 } from 'three';
import { GameContext } from '@src/core/GameContext';
import { GameLogicEventPipe, WeaponEquipEvent } from '@src/gameplay/pipes/GameLogicEventPipe';

const v3Util = new Vector3();

const cameraLookAt = new Vector3(0, 0, -1); // default camera lookAt
const cameraUp = new Vector3(0, 1, 0); // default camera up

const chamberPositionUtil = new Vector3();
const muzzlePositionUtil = new Vector3();

/**
 * ç›‘å¬æ­¦å™¨åˆ‡æ¢äº‹ä»¶å¹¶åŠ¨æ€è·å–å½“å‰åˆ‡æ¢æ­¦å™¨çš„å¼¹è†›/æªå£åœ¨blenderåæ ‡ä¸­çš„ä½ç½®;
 * æä¾›ä¸¤ä¸ªapiåˆ†åˆ«å¯ä»¥åŠ¨æ€è®¡ç®—å‡ºå½“å‰æ­¦å™¨çš„å¼¹è†›/æªå£ä½ç½® ç»è¿‡æ‰‹éƒ¨æ¨¡å‹æ¸²æŸ“å±‚ä½ç½®è½¬æ¢å åœ¨ å½“å‰é¡¹ç›®ä¸­çš„ä¸–ç•Œä½ç½®;  
 * 
 * åˆ†åˆ«ç”¨äº:
 * 1. å¼¹è†›ä½ç½®: æ¯æ¬¡å¼€æªæ—¶, åœ¨ä¸–ç•Œä½ç½®æ”¾å‡ºçƒŸé›¾ç‰¹æ•ˆ
 * 2. æªå£ä½ç½®: æ›³å…‰å¼¹çš„åˆå§‹ä½ç½®
 */
export class WeaponComponentsPositionUtil {

    static instance: WeaponComponentsPositionUtil;
    public static getInstance() {
        if (!WeaponComponentsPositionUtil.instance) WeaponComponentsPositionUtil.instance = new WeaponComponentsPositionUtil();
        return WeaponComponentsPositionUtil.instance;
    }
    handModelCamera: THREE.PerspectiveCamera = GameContext.Cameras.HandModelCamera; // è·å–å½“å‰æ‰‹æ¨¡ç›¸æœºçš„ä½ç½®
    playerCamera = GameContext.Cameras.PlayerCamera;

    chamberFrontDelta: number = 0;
    chamberRightDelta: number = 0;
    chamberDownDelta: number = 0;

    muzzleFrontDelta: number = 0;
    muzzleRightDelta: number = 0;
    muzzleDownDelta: number = 0;

    frontDirection = new Vector3();
    rightDirection = new Vector3();
    downDirection = new Vector3();

    private constructor() {

        // è®¡ç®—å‡ºæ‰‹éƒ¨æ¨¡å‹ä¸­æªè†›ä½ç½®è½¬æ¢åˆ°éœ€è¦æ¸²æŸ“åœºæ™¯çš„ä¸–ç•Œä½ç½®
        GameLogicEventPipe.addEventListener(WeaponEquipEvent.type, (e: CustomEvent) => { // ç›‘å¬å½“å‰æ­¦å™¨åˆ‡æ¢äº‹ä»¶
            const _weaponInstance = e.detail.weaponInstance;
            if (_weaponInstance && _weaponInstance.chamberPosition) { // å¦‚æœå­˜åœ¨æ›´æ¢çš„æ­¦å™¨å®ä¾‹,åˆ¤æ–­æ˜¯å¦æœ‰å¼¹è†›ä½ç½®
                v3Util.copy(_weaponInstance.chamberPosition); // å¦‚æœæœ‰å¼¹è†›ä½ç½®å°±è·å–ä¸€ä¸‹å¼¹è†›ä½ç½®
                // ç„¶åæ›´æ–°ä¸€ä¸‹å¼¹è†›å’Œæªå£ä½ç½®
                this.chamberFrontDelta = v3Util.x - this.handModelCamera.position.x;
                this.chamberRightDelta = v3Util.z - this.handModelCamera.position.z;
                this.chamberDownDelta = v3Util.y - this.handModelCamera.position.y;
            }

            // æªå£ä½ç½®
            if (_weaponInstance && _weaponInstance.muzzlePosition) {
                v3Util.copy(_weaponInstance.muzzlePosition);
                this.muzzleFrontDelta = v3Util.x - this.handModelCamera.position.x;
                this.muzzleRightDelta = v3Util.z - this.handModelCamera.position.z;
                this.muzzleDownDelta = v3Util.y - this.handModelCamera.position.y;
            }
        })
    }

    /**
     * åŠ¨æ€è®¡ç®—å¼¹è†›ä½ç½®
     * @returns å¼¹è†›ä½ç½®
     */
    public calculateChamberPosition(): THREE.Vector3 {

        // åœ¨åˆ‡æªäº‹ä»¶ä¸­å·²ç»ç¡®å®šäº†å¦‚ä¸‹å˜é‡: frontDelta, rightDelta, downDelta;

        // è®¡ç®—æ–¹å‘ frontDirection, rightDirection, downDirection

        v3Util.copy(cameraLookAt);
        v3Util.applyEuler(this.playerCamera.rotation);
        v3Util.normalize();
        this.frontDirection.copy(v3Util);

        v3Util.copy(cameraUp);
        v3Util.applyEuler(this.playerCamera.rotation);
        v3Util.normalize();
        this.downDirection.copy(v3Util);

        v3Util.copy(this.frontDirection);
        v3Util.cross(this.downDirection);
        v3Util.normalize();
        this.rightDirection.copy(v3Util);

        // æ¸²æŸ“ä½ç½®

        chamberPositionUtil.copy(this.playerCamera.position);
        chamberPositionUtil.addScaledVector(this.frontDirection, this.chamberFrontDelta); // å‘å‰
        chamberPositionUtil.addScaledVector(this.rightDirection, this.chamberRightDelta); // å³æ–¹
        chamberPositionUtil.addScaledVector(this.downDirection, this.chamberDownDelta); // ä¸‹æ–¹

        return chamberPositionUtil;

    }

    /**
     * åŠ¨æ€è®¡ç®—æªå£ä½ç½®
     * @returns æªå£ä½ç½®
     */
    public calculateMuzzlePosition(): THREE.Vector3 {

        // åœ¨åˆ‡æªäº‹ä»¶ä¸­å·²ç»ç¡®å®šäº†å¦‚ä¸‹å˜é‡: frontDelta, rightDelta, downDelta;

        // è®¡ç®—æ–¹å‘ frontDirection, rightDirection, downDirection

        v3Util.copy(cameraLookAt);
        v3Util.applyEuler(this.playerCamera.rotation);
        v3Util.normalize();
        this.frontDirection.copy(v3Util);

        v3Util.copy(cameraUp);
        v3Util.applyEuler(this.playerCamera.rotation);
        v3Util.normalize();
        this.downDirection.copy(v3Util);

        v3Util.copy(this.frontDirection);
        v3Util.cross(this.downDirection);
        v3Util.normalize();
        this.rightDirection.copy(v3Util);

        // æ¸²æŸ“ä½ç½®

        muzzlePositionUtil.copy(this.playerCamera.position);
        muzzlePositionUtil.addScaledVector(this.frontDirection, this.muzzleFrontDelta); // å‘å‰
        muzzlePositionUtil.addScaledVector(this.rightDirection, this.muzzleRightDelta); // å³æ–¹
        muzzlePositionUtil.addScaledVector(this.downDirection, this.muzzleDownDelta); // ä¸‹æ–¹

        return muzzlePositionUtil;

    }

}
