import { GameContext } from '@src/core/GameContext';
import { dealWithWeaponTexture } from '@src/core/lib/threejs_common';
import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';
import { DoubleSide, MeshBasicMaterial, Vector3 } from 'three';
import { SemiAutomaticWeapon } from '../abstract/SemiAutomaticWeapon';

const requiredResources = ['Nova_1', 'Nova_equip', 'Nova_reload', 'Nova_fire', 'Nova_hold'];

export class Nova extends SemiAutomaticWeapon {

    muzzlePosition: THREE.Vector3 = new Vector3(0.96, 1.05, 0.5);
    chamberPosition: THREE.Vector3 = new Vector3(0.08, 1.1, 0.58);

    constructor() {
        super();

        const missing = requiredResources.filter(key => !GameContext.GameResources.resourceMap.has(key));
        if (missing.length) throw new Error(`[Nova] Missing resources: ${missing.join(', ')}`);

        const skinnedMesh = GameContext.GameResources.resourceMap.get('Nova_1');
        // Placeholder texture until dedicated Nova texture is added.
        const texture = GameContext.GameResources.textureLoader.load('/weapons/weapon.AK47.jpg');
        dealWithWeaponTexture(texture);
        const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
        (skinnedMesh as THREE.SkinnedMesh).material = material;

        this.weaponClassificationEnum = WeaponClassificationEnum.Shotgun;
        this.weaponId = 'nova';
        this.weaponName = 'Nova';
        this.magazineSize = 8;
        this.fireRate = 0.9;
        this.recoverTime = 0.7;
        this.reloadTime = 3.2;
        this.recoilControl = 2;
        this.accurateRange = 45;
        this.speed = 220;

        this.bulletLeftMagzine = this.magazineSize;
        this.bulletLeftTotal = 32;

        this.init();
        this.initAnimation();
    }

}

