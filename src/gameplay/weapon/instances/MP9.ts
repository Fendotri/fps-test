import { AutomaticWeapon } from '../abstract/AutomaticWeapon';
import { AutomaticWeaponBPointsUtil } from '../utils/AutomaticWeaponBPointsUtil';
import { GameContext } from '@src/core/GameContext';
import { dealWithWeaponTexture } from '@src/core/lib/threejs_common';
import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';
import { DoubleSide, MeshBasicMaterial, Vector3 } from 'three';

const mp9BulletPositionArray = [
    220, 602, 224, 594, 228, 582, 230, 570, 232, 556,
    228, 544, 222, 530, 216, 516, 208, 504, 214, 492,
    226, 480, 238, 470, 246, 458, 240, 448, 232, 438,
    220, 430, 208, 422, 198, 414, 206, 406, 220, 398,
    236, 392, 248, 386, 256, 378, 246, 370, 232, 364,
    218, 358, 204, 352, 212, 346, 228, 340, 244, 334
];

const bulletPosition = AutomaticWeaponBPointsUtil.bulletPositionArray2ScreenCoordArray(
    mp9BulletPositionArray,
    30,
    0.16,
    0.12,
    1.15
);

const bulletPositionDelta = AutomaticWeaponBPointsUtil.bulletDeltaPositionArray2ScreenCoordArray(
    mp9BulletPositionArray,
    30,
    0.16,
    0.12,
    0.9
);

const requiredResources = ['MP9_1', 'MP9_equip', 'MP9_reload', 'MP9_fire', 'MP9_hold'];

export class MP9 extends AutomaticWeapon {

    muzzlePosition: THREE.Vector3 = new Vector3(0.91, 1.06, 0.49);
    chamberPosition: THREE.Vector3 = new Vector3(-0.22, 1.09, 0.56);

    constructor() {
        super(bulletPosition, bulletPositionDelta);

        const missing = requiredResources.filter(key => !GameContext.GameResources.resourceMap.has(key));
        if (missing.length) throw new Error(`[MP9] Missing resources: ${missing.join(', ')}`);

        const skinnedMesh = GameContext.GameResources.resourceMap.get('MP9_1') as THREE.SkinnedMesh;
        // Placeholder texture until dedicated MP9 texture is added.
        const texture = GameContext.GameResources.textureLoader.load('/weapons/weapon.AK47.jpg');
        dealWithWeaponTexture(texture);
        const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
        skinnedMesh.material = material;

        this.weaponClassificationEnum = WeaponClassificationEnum.SMG;
        this.weaponId = 'mp9';
        this.weaponName = 'MP9';
        this.magazineSize = 30;
        this.fireRate = 60 / 857.0;
        this.recoverTime = 0.28;
        this.reloadTime = 2.1;
        this.recoilControl = 5;
        this.accurateRange = 110;
        this.speed = 240;

        this.bulletLeftMagzine = this.magazineSize;
        this.bulletLeftTotal = 120;

        this.init();
        this.initAnimation();
    }

}

