import { InventorySlotEnum } from '@src/gameplay/abstract/InventorySlotEnum';
import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';
import { WeaponInterface } from '@src/gameplay/weapon/abstract/WeaponInterface';
import { AK47 } from '@src/gameplay/weapon/instances/AK47';
import { AWP } from '@src/gameplay/weapon/instances/AWP';
import { M9 } from '@src/gameplay/weapon/instances/M9';
import { MP9 } from '@src/gameplay/weapon/instances/MP9';
import { Nova } from '@src/gameplay/weapon/instances/Nova';
import { USP } from '@src/gameplay/weapon/instances/USP';
import { GameContext } from '@src/core/GameContext';
import { getRuntimeWeaponTune } from '@src/gameplay/tuning/RuntimeTuning';
import { Color, MeshBasicMaterial, SkinnedMesh } from 'three';
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

const createMeshPresetWeapon = (meshPreset: 'ak' | 'usp' | 'm9'): WeaponInterface => {
    if (meshPreset === 'usp') return new USP();
    if (meshPreset === 'm9') return new M9();
    return new AK47();
};

const tryCreateRealWeapon = (entry: WeaponCatalogEntry): WeaponInterface | null => {
    const tune = getRuntimeWeaponTune(entry.weaponId);
    if (tune.meshPreset !== 'auto') return null;
    try {
        switch (entry.weaponId) {
            case 'ak47': return new AK47();
            case 'awp': return new AWP();
            case 'mp9': return new MP9();
            case 'usp_s': return new USP();
            case 'm9': return new M9();
            case 'nova':
            case 'xm1014': return new Nova();
            default: return null;
        }
    } catch {
        return null;
    }
};

const applyWeaponMaterialTuning = (entry: WeaponCatalogEntry, tintHex: string, brightness: number, meshPreset: 'auto' | 'ak' | 'usp' | 'm9') => {
    const resourceBase = meshPreset === 'auto'
        ? (entry.placeholderRig === 'usp' ? 'USP' : (entry.placeholderRig === 'm9' ? 'M9' : 'AK47'))
        : (meshPreset === 'usp' ? 'USP' : (meshPreset === 'm9' ? 'M9' : 'AK47'));
    const preferredBase = meshPreset === 'auto'
        ? (entry.weaponId === 'awp' ? 'AWP' : (entry.weaponId === 'mp9' ? 'MP9' : (entry.weaponId === 'm9' ? 'M9' : (entry.weaponId === 'usp_s' ? 'USP' : (entry.weaponId === 'nova' || entry.weaponId === 'xm1014' ? 'AK47' : 'AK47')))))
        : resourceBase;
    const resourceKey = `${preferredBase}_1`;
    const mesh = GameContext.GameResources.resourceMap.get(resourceKey) as SkinnedMesh | undefined;
    if (!mesh) return;
    const tint = new Color(tintHex);
    const luminance = Math.max(0.25, Math.min(3, brightness));
    const applyToMaterial = (material: MeshBasicMaterial) => {
        material.color.copy(tint).multiplyScalar(luminance);
        material.needsUpdate = true;
    };

    if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => {
            if (material instanceof MeshBasicMaterial) applyToMaterial(material);
        });
        return;
    }
    if (mesh.material instanceof MeshBasicMaterial) applyToMaterial(mesh.material);
};

export const applyRuntimeTuningToWeaponInstance = (weapon: WeaponInterface | null | undefined, explicitWeaponId?: string) => {
    if (!weapon) return null;
    const weaponId = `${explicitWeaponId || weapon.weaponId || ''}`.trim().toLowerCase();
    const entry = getWeaponEntry(weaponId) || getWeaponEntry(DEFAULT_FFA_LOADOUT.primary);
    if (!entry) return weapon;
    const tune = getRuntimeWeaponTune(entry.weaponId);

    weapon.weaponId = entry.weaponId;
    weapon.weaponName = entry.displayName;
    weapon.weaponClassificationEnum = normalizeClass(entry.stats.classification, weapon.weaponClassificationEnum);
    weapon.damage = tune.damage;
    weapon.rpm = tune.rpm;
    weapon.tracerSpeed = tune.tracerSpeed;
    weapon.fireRate = Math.max(0.04, 60 / Math.max(1, tune.rpm));
    weapon.magazineSize = tune.magazine;
    weapon.bulletLeftMagzine = Math.min(Math.max(0, Number(weapon.bulletLeftMagzine) || tune.magazine), tune.magazine);
    weapon.bulletLeftTotal = Math.min(Math.max(0, Number(weapon.bulletLeftTotal) || tune.reserve), tune.reserve);
    weapon.speed = tune.speed;
    weapon.recoilControl = tune.recoilControl;
    weapon.recoverTime = tune.recoverTime;
    weapon.reloadTime = tune.reloadTime;
    weapon.accurateRange = tune.accurateRange;
    weapon.armorPenetration = Number(entry.stats.damageModel?.armorRatio) || weapon.armorPenetration || 1.0;

    applyWeaponMaterialTuning(entry, tune.materialTint, tune.materialBrightness, tune.meshPreset);
    return weapon;
};

const createPlaceholderWeapon = (entry: WeaponCatalogEntry): WeaponInterface => {
    const tune = getRuntimeWeaponTune(entry.weaponId);
    const instance: WeaponInterface =
        tryCreateRealWeapon(entry)
        || createMeshPresetWeapon(tune.meshPreset === 'auto' ? entry.placeholderRig : tune.meshPreset);

    instance.lastFireTime = 0;
    instance.active = false;
    return applyRuntimeTuningToWeaponInstance(instance, entry.weaponId) || instance;
};

export const createWeaponById = (weaponId: string, fallbackId = DEFAULT_FFA_LOADOUT.primary) => {
    return createPlaceholderWeapon(ensureEntry(weaponId, fallbackId));
};

export const cloneWeaponInstanceWithAmmo = (weapon: WeaponInterface | null | undefined) => {
    if (!weapon) return null;
    const cloned = createWeaponById(`${weapon.weaponId || weapon.weaponName || ''}`);
    cloned.bulletLeftMagzine = Math.max(0, Number(weapon.bulletLeftMagzine) || 0);
    cloned.bulletLeftTotal = Math.max(0, Number(weapon.bulletLeftTotal) || 0);
    cloned.lastFireTime = 0;
    cloned.active = false;
    return cloned;
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
