import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';

/** Shared weapon contract used across all weapon implementations. */
export type WeaponInterface = {

    active: boolean;
    lastFireTime: number;
    bulletLeftMagzine: number;
    bulletLeftTotal: number;

    weaponUUID: string;
    weaponId?: string;
    weaponClassificationEnum: WeaponClassificationEnum;
    weaponName: string;
    weaponNameSuffix: string;
    magazineSize: number;
    recoverTime: number;
    reloadTime: number;
    speed: number;
    killaward: number;
    damage: number;
    fireRate: number;
    rpm?: number;
    tracerSpeed?: number;
    spraySeedOverride?: number;
    recoilControl: number;
    accurateRange: number;
    armorPenetration: number;

    muzzlePosition?: THREE.Vector3;
    chamberPosition?: THREE.Vector3;

    init?: () => void;
    callEveryFrame?: (deltaTime?: number, elapsedTime?: number) => void;
    recover?: (deltaTime?: number, elapsedTime?: number) => void;
    fire?: () => void;

}
