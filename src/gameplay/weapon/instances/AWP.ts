import { GameContext } from '@src/core/GameContext';
import { dealWithWeaponTexture } from '@src/core/lib/threejs_common';
import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';
import { DoubleSide, MeshBasicMaterial, Vector3 } from 'three';
import { SemiAutomaticWeapon } from '../abstract/SemiAutomaticWeapon';

const requiredResources = ['AWP_1', 'AWP_equip', 'AWP_reload', 'AWP_fire', 'AWP_hold'];

export class AWP extends SemiAutomaticWeapon {

    muzzlePosition: THREE.Vector3 = new Vector3(0.95, 1.06, 0.5);
    chamberPosition: THREE.Vector3 = new Vector3(0.12, 1.1, 0.58);

    constructor() {
        super();

        const missing = requiredResources.filter(key => !GameContext.GameResources.resourceMap.has(key));
        if (missing.length) throw new Error(`[AWP] Missing resources: ${missing.join(', ')}`);

        const skinnedMesh = GameContext.GameResources.resourceMap.get('AWP_1');
        // Placeholder texture until dedicated AWP texture is added.
        const texture = GameContext.GameResources.textureLoader.load('/weapons/weapon.AK47.jpg');
        dealWithWeaponTexture(texture);
        const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
        (skinnedMesh as THREE.SkinnedMesh).material = material;

        this.weaponClassificationEnum = WeaponClassificationEnum.SniperRifle;
        this.weaponId = 'awp';
        this.weaponName = 'AWP';
        this.magazineSize = 10;
        this.fireRate = 1.2;
        this.recoverTime = 1.0;
        this.reloadTime = 3.6;
        this.recoilControl = 2;
        this.accurateRange = 520;
        this.speed = 200;

        this.bulletLeftMagzine = this.magazineSize;
        this.bulletLeftTotal = 30;

        this.init();
        this.initAnimation();
    }

}

