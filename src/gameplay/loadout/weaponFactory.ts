import { InventorySlotEnum } from '@src/gameplay/abstract/InventorySlotEnum';
import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';
import { WeaponInterface } from '@src/gameplay/weapon/abstract/WeaponInterface';
import { AK47 } from '@src/gameplay/weapon/instances/AK47';
import { M9 } from '@src/gameplay/weapon/instances/M9';
import { USP } from '@src/gameplay/weapon/instances/USP';
import { DEFAULT_FFA_LOADOUT, getWeaponEntry, LoadoutProfile, normalizeLoadoutProfile, WeaponCatalogEntry } from './weaponCatalog';

const normalizeClass = (value: WeaponClassificationEnum | string, fallback: WeaponClassificationEnum) => {
    const key = `${value || ''}`.toLowerCase();
    if (key === 'rifle') return WeaponClassificationEnum.Rifle;
    if (key === 'sniperrifle' || key === 'sniper') return WeaponClassificationEnum.SniperRifle;
    if (key === 'pistol') return WeaponClassificationEnum.Pistol;
    if (key === 'malee' || key === 'knife') return WeaponClassificationEnum.Malee;
    if (key === 'smg') return WeaponClassificationEnum.SMG;
    if (key === 'shotgun') return WeaponClassificationEnum.Shotgun;
    if (key === 'machinegun' || key === 'mg') return WeaponClassificationEnum.Machinegun;
    return fallback;
};

const createPlaceholderWeapon = (entry: WeaponCatalogEntry): WeaponInterface => {
    const instance: WeaponInterface =
        entry.placeholderRig === 'usp'
            ? new USP()
            : entry.placeholderRig === 'm9'
                ? new M9()
                : new AK47();

    instance.weaponName = entry.displayName;
    instance.weaponId = entry.weaponId;
    instance.weaponClassificationEnum = normalizeClass(entry.stats.classification, instance.weaponClassificationEnum);
    instance.damage = entry.stats.damage;
    const rpm = Number(entry.stats.rpm);
    const secondsPerShotFromRpm = rpm > 0 ? (60 / rpm) : 0;
    instance.rpm = rpm > 0 ? rpm : undefined;
    instance.tracerSpeed = Number(entry.stats.tracerSpeed) > 0 ? Number(entry.stats.tracerSpeed) : undefined;
    instance.fireRate = Math.max(
        0.04,
        secondsPerShotFromRpm || Number(entry.stats.fireRate) || instance.fireRate || 0.12,
    );
    instance.magazineSize = Math.max(1, Math.floor(Number(entry.stats.magazine) || instance.magazineSize || 1));
    instance.bulletLeftMagzine = instance.magazineSize;
    instance.bulletLeftTotal = Math.max(0, Math.floor(Number(entry.stats.reserve) || 0));
    instance.speed = Math.max(
        120,
        Math.floor(
            Number(entry.stats.movementModel?.speed)
            || Number(entry.stats.speed)
            || instance.speed
            || 220,
        ),
    );
    instance.recoilControl = Math.max(1, Math.floor(Number(entry.stats.recoilControl) || instance.recoilControl || 4));
    instance.recoverTime = Math.max(0.08, Number(entry.stats.recoverTime) || instance.recoverTime || 0.28);
    instance.reloadTime = Math.max(0.1, Number(entry.stats.reloadTime) || instance.reloadTime || 2.0);
    instance.accurateRange = Math.max(2, Math.floor(Number(entry.stats.accurateRange) || instance.accurateRange || 110));
    instance.armorPenetration = Number(entry.stats.damageModel?.armorRatio) || instance.armorPenetration || 1.0;
    instance.lastFireTime = 0;
    instance.active = false;
    return instance;
};

const ensureEntry = (weaponId: string, fallbackId: string) => {
    const preferred = getWeaponEntry(`${weaponId || ''}`);
    if (preferred) return preferred;
    return getWeaponEntry(fallbackId) || getWeaponEntry(DEFAULT_FFA_LOADOUT.primary);
};

export const createWeaponsForLoadout = (rawLoadout: Partial<LoadoutProfile> | null | undefined) => {
    const normalized = normalizeLoadoutProfile(rawLoadout);
    const primary = createPlaceholderWeapon(ensureEntry(normalized.primary, DEFAULT_FFA_LOADOUT.primary));
    const secondary = createPlaceholderWeapon(ensureEntry(normalized.secondary, DEFAULT_FFA_LOADOUT.secondary));
    const knife = createPlaceholderWeapon(ensureEntry(normalized.knife, DEFAULT_FFA_LOADOUT.knife));
    return {
        normalized,
        bySlot: new Map<InventorySlotEnum, WeaponInterface>([
            [InventorySlotEnum.Primary, primary],
            [InventorySlotEnum.Secondary, secondary],
            [InventorySlotEnum.Malee, knife],
        ]),
    };
};
