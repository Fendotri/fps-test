import { GameContext } from '@src/core/GameContext';
import { GameObjectMaterialEnum } from '../abstract/GameObjectMaterialEnum';
import { WeaponClassificationEnum } from '../abstract/WeaponClassificationEnum';
import { BulletFallenPointEvent, LayerEventPipe, ShotOutWeaponFireEvent } from '../pipes/LayerEventPipe';
import { UserInputEvent, UserInputEventPipe } from '../pipes/UserinputEventPipe';
import { UserInputEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { BulletImpactEvent, GameLogicEventPipe, HitDamageEvent, KillFeedEvent, PlayerDiedEvent, WeaponFireEvent } from '../pipes/GameLogicEventPipe';
import { EnemyBotSystem } from '@src/gameplay/bot/EnemyBotSystem';
import { OnlineRoomSystem } from '@src/gameplay/online/OnlineRoomSystem';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { Raycaster, Vector3 } from 'three';

const playerBodyMaterialSet = new Set<GameObjectMaterialEnum>([
    GameObjectMaterialEnum.PlayerHead,
    GameObjectMaterialEnum.PlayerChest,
    GameObjectMaterialEnum.PlayerUpperLimb,
    GameObjectMaterialEnum.PlayerLowerLimb,
    GameObjectMaterialEnum.PlayerBelly,
]);
const fallbackNormal = new Vector3(0, 1, 0);

/** 
 * æ­¦å™¨ç³»ç»Ÿ, å¤„ç†æ­¦å™¨ç³»ç»Ÿå¯¹å¤–äº‹ä»¶:
 * 1. é€šè¿‡äº‹ä»¶è·å–å¼€æªè®¡ç®—è¿‡åååŠ›åçš„å­å¼¹å±å¹•åæ ‡ä½ç½®; è·å–ç›¸æœºä½ç½®, é€šè¿‡ç›¸æœºè®¾ç½®æ¿€å…‰; è®¡ç®—å¼¹ç‚¹æ¿€å…‰æœ€ç»ˆè½ç‚¹
 * 2. åˆ¤æ–­å‡»ä¸­ç‰©ä½“çš„æ¸¸æˆé€»è¾‘æè´¨, å¯¹ä¸åŒçš„ç‰©ä½“é‡‡ç”¨ä¸åŒçš„é€»è¾‘æè´¨ä½¿ç”¨ä¸åŒçš„é€»è¾‘äº‹ä»¶
 * 3. åˆ†å‘ç‰¹æ•ˆæ¸²æŸ“äº‹ä»¶
 * 4. è®°å½•é¼ æ ‡æŒ‰é”®çŠ¶æ€
 */
export class WeaponSystem {

    camera: THREE.Camera = GameContext.Cameras.PlayerCamera; // æ­¦å™¨ç³»ç»Ÿäº¤äº’ä½¿ç”¨çš„ç›¸æœº
    scene: THREE.Scene = GameContext.Scenes.Level; // æ­¦å™¨ç³»ç»Ÿäº¤äº’çš„åœºæ™¯
    triggleDown: boolean = false;  // å½“å‰æ‰³æœºçŠ¶æ€
    raycaster = new Raycaster(); // ç”¨äºæ¿€å…‰æ£€æµ‹
    _objectsIntersectedArray: THREE.Intersection<THREE.Object3D<THREE.Event>>[] = [];  // ç”¨äºå­˜å‚¨æ¿€å…‰æ£€æµ‹çš„ç»“æœ

    // å•ä¾‹æ¨¡å¼
    private static weaponSystemInstance: WeaponSystem;
    private constructor() {
        UserInputEventPipe.addEventListener(UserInputEvent.type, (e: CustomEvent) => { // ç©å®¶æŒ‰é”®äº‹ä»¶å½±å“
            switch (e.detail.enum) {
                case UserInputEventEnum.BUTTON_TRIGGLE_DOWN: // æ‰³æœºäº‹ä»¶
                    if (LocalPlayer.getInstance().health <= 0) {
                        this.triggleDown = false;
                        break;
                    }
                    this.triggleDown = true;
                    break;
                case UserInputEventEnum.BUTTON_TRIGGLE_UP:
                    this.triggleDown = false;
                    break;
            }
        })

        GameLogicEventPipe.addEventListener(PlayerDiedEvent.type, () => {
            this.triggleDown = false;
        });
        this.dealWithWeaponOpenFire();
    }
    public static getInstance() {
        if (!this.weaponSystemInstance) this.weaponSystemInstance = new WeaponSystem();
        return this.weaponSystemInstance;
    }

    /** 
     * å¤„ç†æ­¦å™¨å¼€ç«äº‹ä»¶
     */
    dealWithWeaponOpenFire() {
        GameLogicEventPipe.addEventListener(WeaponFireEvent.type, (e: CustomEvent) => {
            if (LocalPlayer.getInstance().health <= 0) return;
            const weaponInstance = e.detail.weaponInstance;
            const weaponName = weaponInstance ? weaponInstance.weaponName : 'RIFLE';
            const weaponId = weaponInstance ? `${weaponInstance.weaponId || weaponName}` : 'default';

            // 1. å‘æ¸²æŸ“å±‚å‘å‡ºå¼€ç«æ•ˆæœæ¸²æŸ“äº‹ä»¶
            if (weaponInstance &&
                weaponInstance.weaponClassificationEnum !== WeaponClassificationEnum.Malee)
                LayerEventPipe.dispatchEvent(ShotOutWeaponFireEvent); // ç»™æ¸²æŸ“å±‚ä¼ é€’æ¸²æŸ“äº‹ä»¶(å¼€ç«ç‰¹æ•ˆ)

            // 2. è¿›è¡Œæ¿€å…‰ç¢°æ’æ£€æµ‹
            this._objectsIntersectedArray.length = 0; // æ¸…ç©ºæ•°ç»„ç¼“å­˜
            let ifGenerated = false; // æ ‡è®°æ˜¯å¦å·²ç»ç”Ÿæˆè¿‡å¼¹ç‚¹
            const bpPointScreenCoord = e.detail.bPointRecoiledScreenCoord; // å­å¼¹æ”¶åˆ°åååŠ›å½±å“ååœ¨å±å¹•åæ ‡çš„è½ç‚¹
            this.raycaster.setFromCamera(bpPointScreenCoord, this.camera); // é€šè¿‡ç›¸æœºè®¾ç½®æ¿€å…‰
            this.raycaster.params.Mesh.threshold = 1; // thresholdæ˜¯ç›¸äº¤å¯¹è±¡æ—¶å…‰çº¿æŠ•å°„å™¨çš„ç²¾åº¦ï¼Œä»¥ä¸–ç•Œå•ä½è¡¨ç¤º
            this.raycaster.intersectObjects(this.scene.children, true, this._objectsIntersectedArray); // æ£€æµ‹

            // 3. æ¸²æŸ“å¼¹å­”
            if (this._objectsIntersectedArray.length > 0) { // å¦‚æœå‡»ä¸­äº†ä¸‰è§’é¢
                for (let i = 0; i < this._objectsIntersectedArray.length; i++) { // éå†æ‰€æœ‰çš„å‡»ä¸­ä¿¡æ¯
                    if (ifGenerated) return; // å¦‚æœå·²ç»äº§ç”Ÿå¼¹å­” å°±ç›´æ¥å¼¹å‡ºæ–¹æ³•ä¸å†äº§ç”Ÿå¼¹å­”
                    const point = this._objectsIntersectedArray[i].point; // å¼¹ç‚¹
                    const normal = this._objectsIntersectedArray[i].face ? this._objectsIntersectedArray[i].face.normal : fallbackNormal;
                    const gameObjectMaterial = this._objectsIntersectedArray[i].object.userData['GameObjectMaterialEnum'] // ç”¨äºåˆ¤æ–­ç¢°æ’é¢å±äºå“ªä¸ª(æ¸¸æˆé€»è¾‘)ç½‘æ ¼æè´¨
                    if (gameObjectMaterial === undefined) continue; // å¦‚æœä¸æ˜¯æ¸¸æˆé€»è¾‘å†…çš„æè´¨ä¸ä¼šç”Ÿæˆå¼¹ç‚¹

                    BulletImpactEvent.detail.point.copy(point);
                    BulletImpactEvent.detail.normal.copy(normal);
                    BulletImpactEvent.detail.recoiledScreenCoord.copy(bpPointScreenCoord);
                    BulletImpactEvent.detail.weaponName = weaponName;
                    BulletImpactEvent.detail.weaponId = weaponId;
                    BulletImpactEvent.detail.distance = point.distanceTo(this.camera.position);
                    BulletImpactEvent.detail.material = gameObjectMaterial;
                    BulletImpactEvent.detail.objectUUID = this._objectsIntersectedArray[i].object.uuid;
                    GameLogicEventPipe.dispatchEvent(BulletImpactEvent);

                    if (playerBodyMaterialSet.has(gameObjectMaterial)) {
                        const botResult = EnemyBotSystem.getInstance().applyDamageFromHitObject(
                            this._objectsIntersectedArray[i].object,
                            weaponId,
                            BulletImpactEvent.detail.distance,
                        );
                        let matchedTarget = botResult.matched;

                        if (botResult.matched && botResult.damage > 0) {
                            HitDamageEvent.detail.damage = botResult.damage;
                            HitDamageEvent.detail.victimName = botResult.victimName;
                            HitDamageEvent.detail.weaponName = weaponName;
                            HitDamageEvent.detail.headshot = gameObjectMaterial === GameObjectMaterialEnum.PlayerHead;
                            HitDamageEvent.detail.killed = botResult.killed;
                            GameLogicEventPipe.dispatchEvent(HitDamageEvent);
                        }

                        if (botResult.matched && botResult.killed) {
                            KillFeedEvent.detail.killerName = 'YOU';
                            KillFeedEvent.detail.victimName = botResult.victimName;
                            KillFeedEvent.detail.weaponName = weaponName;
                            KillFeedEvent.detail.headshot = gameObjectMaterial === GameObjectMaterialEnum.PlayerHead;
                            GameLogicEventPipe.dispatchEvent(KillFeedEvent);
                        }

                        if (!botResult.matched) {
                            const onlineResult = OnlineRoomSystem.getInstance()?.applyDamageFromHitObject(
                                this._objectsIntersectedArray[i].object,
                                weaponId,
                                BulletImpactEvent.detail.distance,
                            ) || { matched: false, killed: false, victimName: '', damage: 0 };
                            matchedTarget = onlineResult.matched;

                            if (onlineResult.matched && onlineResult.damage > 0) {
                                HitDamageEvent.detail.damage = onlineResult.damage;
                                HitDamageEvent.detail.victimName = onlineResult.victimName;
                                HitDamageEvent.detail.weaponName = weaponName;
                                HitDamageEvent.detail.headshot = gameObjectMaterial === GameObjectMaterialEnum.PlayerHead;
                                HitDamageEvent.detail.killed = onlineResult.killed;
                                GameLogicEventPipe.dispatchEvent(HitDamageEvent);
                            }

                            if (onlineResult.matched && onlineResult.killed) {
                                KillFeedEvent.detail.killerName = 'YOU';
                                KillFeedEvent.detail.victimName = onlineResult.victimName;
                                KillFeedEvent.detail.weaponName = weaponName;
                                KillFeedEvent.detail.headshot = gameObjectMaterial === GameObjectMaterialEnum.PlayerHead;
                                GameLogicEventPipe.dispatchEvent(KillFeedEvent);
                            }
                        }

                        if (!matchedTarget) continue;
                        ifGenerated = true; // ä¸ç”Ÿæˆå¼¹å­”,ä¸”åç»­ç©¿é€ä¹Ÿä¸ä¼šç”Ÿæˆå¼¹å­”
                        // ... è¿™é‡Œåº”å½“å‘å‡ºç©å®¶xxxè¢«å‡»ä¸­çš„äº‹ä»¶
                        continue;
                    }
                    switch (gameObjectMaterial) {
                        case GameObjectMaterialEnum.GrassGround: // å¦‚æœæ˜¯åœºæ™¯ç‰©ä½“çš„ä¸€éƒ¨åˆ†
                            if (weaponInstance &&
                                weaponInstance.weaponClassificationEnum === WeaponClassificationEnum.Malee) break; // å¦‚æœå½“å‰æŒæœ‰æ­¦å™¨ç±»å‹æ˜¯åŒ•é¦–é‚£ä¹ˆä¸äº§ç”Ÿå¼¹ç‚¹

                            // ä½¿ç”¨ addPoint é€šç”¨å‡½æ•°å‘åœºæ™¯ä¸­æ·»åŠ å¼¹ç‚¹
                            // æ¸²æŸ“çš„å­å¼¹å‡»ä¸­åœºæ™¯: å‡»ä¸­çƒŸå°˜, å‡»ä¸­ç«å…‰
                            BulletFallenPointEvent.detail.fallenPoint.copy(point);
                            BulletFallenPointEvent.detail.fallenNormal.copy(normal);
                            BulletFallenPointEvent.detail.cameraPosition.copy(this.camera.position);
                            BulletFallenPointEvent.detail.recoiledScreenCoord.copy(bpPointScreenCoord);
                            LayerEventPipe.dispatchEvent(BulletFallenPointEvent);

                            ifGenerated = true; // åç»­ç©¿é€ä¸å†ç”Ÿæˆå¼¹å­”
                            break;
                    }
                }
            }
        })

    }

}

