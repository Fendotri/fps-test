import { WeaponInterface } from '../weapon/abstract/WeaponInterface';
import { InventorySlotEnum, mapIventorySlotByWeaponClassficationEnum } from '../abstract/InventorySlotEnum';
import { CycleInterface } from '../../core/inferface/CycleInterface';
import { LoopInterface } from '../../core/inferface/LoopInterface';
import { UserInputEvent, UserInputEventPipe } from '../pipes/UserinputEventPipe';
import { UserInputEventEnum, WeaponAnimationEventEnum } from '../abstract/EventsEnum';
import { AnimationEventPipe, WeaponAnimationEvent } from '../pipes/AnimationEventPipe';
import { GameLogicEventPipe, WeaponEquipEvent } from '../pipes/GameLogicEventPipe';

/**
 * Player inventory system.
 */
export class InventorySystem implements CycleInterface, LoopInterface {

    weapons: Map<InventorySlotEnum, WeaponInterface> = new Map<InventorySlotEnum, WeaponInterface>();
    private weaponSpawnAmmo = new Map<string, { magazine: number; total?: number }>();
    nowEquipInventory: InventorySlotEnum = InventorySlotEnum.Hands;
    lastEquipInventory: InventorySlotEnum = InventorySlotEnum.Malee;

    get currentWeapon() {
        return this.weapons.get(this.nowEquipInventory) || null;
    }

    init(): void {
        this.weapons.set(InventorySlotEnum.Hands, null);
        this.switchEquipment(InventorySlotEnum.Hands);

        UserInputEventPipe.addEventListener(UserInputEvent.type, (e: CustomEvent) => {
            switch (e.detail.enum) {
                case UserInputEventEnum.BUTTON_SWITCH_PRIMARY_WEAPON:
                    this.switchEquipment(InventorySlotEnum.Primary);
                    break;
                case UserInputEventEnum.BUTTON_SWITCH_SECONDARY_WEAPON:
                    this.switchEquipment(InventorySlotEnum.Secondary);
                    break;
                case UserInputEventEnum.BUTTON_SWITCH_MALEE_WEAPON:
                    this.switchEquipment(InventorySlotEnum.Malee);
                    break;
                case UserInputEventEnum.BUTTON_SWITCH_LAST_WEAPON:
                    this.switchEquipment(this.lastEquipInventory);
                    break;
            }
        });
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        this.weapons.forEach(weapon => {
            if (weapon && weapon.recover) weapon.recover(deltaTime, elapsedTime);
        });

        const nowEquipWeapon = this.weapons.get(this.nowEquipInventory);
        if (!nowEquipWeapon) return;
        if (nowEquipWeapon.callEveryFrame) nowEquipWeapon.callEveryFrame(deltaTime, elapsedTime);
    }

    /**
     * Switch equipped inventory slot.
     */
    switchEquipment(targetInventory: InventorySlotEnum) {
        const nowEquipInventory = this.nowEquipInventory;
        if (nowEquipInventory === targetInventory) return;
        this.applyEquipTransition(nowEquipInventory, targetInventory, false);
    }

    /**
     * Pick weapon from world only when slot is empty.
     */
    pickUpWeapon(weaponInstance: WeaponInterface) {
        const belongInventory = mapIventorySlotByWeaponClassficationEnum(weaponInstance.weaponClassificationEnum);
        if (!this.weapons.get(belongInventory)) {
            this.weapons.set(belongInventory, weaponInstance);
            this.rememberWeaponSpawnAmmo(weaponInstance);
        }
    }

    /**
     * Replace slot weapon and force equip it (used by buy menu).
     */
    replaceWeapon(weaponInstance: WeaponInterface) {
        const belongInventory = mapIventorySlotByWeaponClassficationEnum(weaponInstance.weaponClassificationEnum);
        const replaced = this.weapons.get(belongInventory) || null;
        this.weapons.set(belongInventory, weaponInstance);
        this.rememberWeaponSpawnAmmo(weaponInstance);
        this.applyEquipTransition(this.nowEquipInventory, belongInventory, true);
        return { slot: belongInventory, replaced };
    }

    applyLoadoutPack(weaponsBySlot: Map<InventorySlotEnum, WeaponInterface>, equipSlot: InventorySlotEnum = InventorySlotEnum.Primary) {
        this.applyEquipTransition(this.nowEquipInventory, InventorySlotEnum.Hands, true);
        this.weaponSpawnAmmo.clear();
        this.weapons.set(InventorySlotEnum.Hands, null);

        const primary = weaponsBySlot.get(InventorySlotEnum.Primary) || null;
        const secondary = weaponsBySlot.get(InventorySlotEnum.Secondary) || null;
        const malee = weaponsBySlot.get(InventorySlotEnum.Malee) || null;

        this.weapons.set(InventorySlotEnum.Primary, primary);
        this.weapons.set(InventorySlotEnum.Secondary, secondary);
        this.weapons.set(InventorySlotEnum.Malee, malee);

        if (primary) this.rememberWeaponSpawnAmmo(primary);
        if (secondary) this.rememberWeaponSpawnAmmo(secondary);
        if (malee) this.rememberWeaponSpawnAmmo(malee);

        this.nowEquipInventory = InventorySlotEnum.Hands;
        this.lastEquipInventory = InventorySlotEnum.Malee;

        const target = this.weapons.get(equipSlot) ? equipSlot : (primary ? InventorySlotEnum.Primary : (secondary ? InventorySlotEnum.Secondary : InventorySlotEnum.Malee));
        this.applyEquipTransition(InventorySlotEnum.Hands, target, true);
    }

    resetWeaponsToSpawnAmmo() {
        this.weapons.forEach(weapon => {
            if (!weapon) return;
            const cached = this.weaponSpawnAmmo.get(weapon.weaponUUID);
            if (cached) {
                weapon.bulletLeftMagzine = cached.magazine;
                if (typeof cached.total === 'number') weapon.bulletLeftTotal = cached.total;
            } else {
                weapon.bulletLeftMagzine = weapon.magazineSize;
            }
            weapon.lastFireTime = 0;
            weapon.active = false;
        });
    }

    rebuildSpawnAmmoCache() {
        this.weaponSpawnAmmo.clear();
        this.weapons.forEach((weapon) => {
            if (!weapon) return;
            this.rememberWeaponSpawnAmmo(weapon);
        });
    }

    refreshCurrentWeaponState() {
        this.applyEquipTransition(this.nowEquipInventory, this.nowEquipInventory, true);
    }

    private rememberWeaponSpawnAmmo(weapon: WeaponInterface) {
        this.weaponSpawnAmmo.set(weapon.weaponUUID, {
            magazine: Math.max(0, weapon.bulletLeftMagzine),
            total: typeof weapon.bulletLeftTotal === 'number' ? Math.max(0, weapon.bulletLeftTotal) : undefined,
        });
    }

    private applyEquipTransition(fromInventory: InventorySlotEnum, targetInventory: InventorySlotEnum, force: boolean) {
        const fromWeapon = this.weapons.get(fromInventory);
        const targetWeapon = this.weapons.get(targetInventory);

        if (!force && fromInventory === targetInventory) return;

        WeaponAnimationEvent.detail.enum = WeaponAnimationEventEnum.RELIEVE_EQUIP;
        WeaponAnimationEvent.detail.weaponInstance = fromWeapon || undefined;
        AnimationEventPipe.dispatchEvent(WeaponAnimationEvent);

        WeaponAnimationEvent.detail.enum = WeaponAnimationEventEnum.EQUIP;
        WeaponAnimationEvent.detail.weaponInstance = targetWeapon || undefined;
        AnimationEventPipe.dispatchEvent(WeaponAnimationEvent);

        WeaponEquipEvent.detail.weaponInstance = targetWeapon || undefined;
        GameLogicEventPipe.dispatchEvent(WeaponEquipEvent);

        const prevInventory = this.nowEquipInventory;
        this.nowEquipInventory = targetInventory;
        if (prevInventory !== targetInventory) this.lastEquipInventory = prevInventory;
    }

}
