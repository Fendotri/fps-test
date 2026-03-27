import { Vector2, Vector3 } from 'three';
import { DomPipe } from '@src/core/DOMPipe';
import { GameObjectMaterialEnum } from '../abstract/GameObjectMaterialEnum';
import { WeaponInterface } from '../weapon/abstract/WeaponInterface';

export const GameLogicEventPipe = new DomPipe();

/**
 * Fired when weapon logic creates a shot.
 */
export const WeaponFireEvent = new CustomEvent<{
    bPointRecoiledScreenCoord: THREE.Vector2;
    weaponInstance: WeaponInterface;
}>('weapon fired', {
    detail: {
        bPointRecoiledScreenCoord: undefined,
        weaponInstance: undefined,
    }
});

/**
 * Fired when shot raycast resolves an impact point.
 */
export const BulletImpactEvent = new CustomEvent<{
    point: THREE.Vector3;
    normal: THREE.Vector3;
    recoiledScreenCoord: THREE.Vector2;
    weaponName: string;
    weaponId: string;
    distance: number;
    material: GameObjectMaterialEnum | null;
    objectUUID: string;
}>('bullet impact', {
    detail: {
        point: new Vector3(),
        normal: new Vector3(),
        recoiledScreenCoord: new Vector2(),
        weaponName: '',
        weaponId: '',
        distance: 0,
        material: null,
        objectUUID: '',
    }
});

/**
 * Fired when player equips a weapon slot.
 */
export const WeaponEquipEvent = new CustomEvent<{
    weaponInstance: WeaponInterface;
}>(
    'waepon equiped', {
    detail: { weaponInstance: undefined, }
});

/**
 * Fired when gameplay resolves a kill for kill-feed HUD.
 */
export const KillFeedEvent = new CustomEvent<{
    killerName: string;
    victimName: string;
    weaponName: string;
    headshot: boolean;
}>(
    'kill feed', {
    detail: {
        killerName: '',
        victimName: '',
        weaponName: '',
        headshot: false,
    }
});

/**
 * Fired when local player deals damage to a valid target.
 */
export const HitDamageEvent = new CustomEvent<{
    damage: number;
    victimName: string;
    weaponName: string;
    headshot: boolean;
    killed: boolean;
}>(
    'hit damage', {
    detail: {
        damage: 0,
        victimName: '',
        weaponName: '',
        headshot: false,
        killed: false,
    }
});

/**
 * Fired when local player takes damage from enemies.
 */
export const PlayerDamagedEvent = new CustomEvent<{
    damage: number;
    armorDamage: number;
    health: number;
    armor: number;
    headshot: boolean;
    attackerName?: string;
}>(
    'player damaged', {
    detail: {
        damage: 0,
        armorDamage: 0,
        health: 100,
        armor: 0,
        headshot: false,
        attackerName: '',
    }
});

/**
 * Fired when local player dies.
 */
export const PlayerDiedEvent = new CustomEvent<{
    killerName: string;
    weaponName: string;
    headshot: boolean;
    respawnAt: number;
    respawnSeconds: number;
}>(
    'player died', {
    detail: {
        killerName: '',
        weaponName: '',
        headshot: false,
        respawnAt: 0,
        respawnSeconds: 0,
    }
});

/**
 * Fired when local player respawns.
 */
export const PlayerRespawnedEvent = new CustomEvent<{
    at: number;
}>(
    'player respawned', {
    detail: {
        at: 0,
    }
});
