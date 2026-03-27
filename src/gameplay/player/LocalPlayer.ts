import { GameContext } from '../../core/GameContext';
import { CycleInterface } from '../../core/inferface/CycleInterface';
import { LoopInterface } from '../../core/inferface/LoopInterface';
import { dealWithRoleMaterial, dealWithRoleTexture } from '@src/core/lib/threejs_common';
import { InventorySlotEnum } from '../abstract/InventorySlotEnum';
import { InventorySystem } from '../Inventory/InventorySystem';
import { UserInputSystem } from '../input/UserInputSystem';
import { FPSCameraController } from '../input/controllers/FPSCameraController';
import { MovementController } from '../input/controllers/MovementController';
import { DEFAULT_FFA_LOADOUT, LoadoutProfile, normalizeLoadoutProfile } from '../loadout/weaponCatalog';
import { createWeaponsForLoadout } from '../loadout/weaponFactory';
import { WeaponSystem } from '../weapon/WeaponSystem';
import { MeshBasicMaterial } from 'three';

const roleTexture = GameContext.GameResources.textureLoader.load('/role/role.TF2.heavy.png');
dealWithRoleTexture(roleTexture);
const roleMaterial = new MeshBasicMaterial({ map: roleTexture });
dealWithRoleMaterial(roleMaterial);

type PlayNowDetail = {
    auth?: {
        loadout?: Partial<LoadoutProfile>;
    };
};

/**
 * Local player singleton.
 */
export class LocalPlayer implements CycleInterface, LoopInterface {
    private static localPlayerInstance: LocalPlayer;
    private constructor() { }

    public static getInstance(): LocalPlayer {
        if (!this.localPlayerInstance) this.localPlayerInstance = new LocalPlayer();
        return this.localPlayerInstance;
    }

    userInputSystem: UserInputSystem;
    inventorySystem: InventorySystem;
    weaponSystem: WeaponSystem;

    cameraController: FPSCameraController;
    movementController: MovementController;
    health = 100;
    armor = 100;
    hasHelmet = true;
    money = 800;
    kills = 0;
    deaths = 0;
    assists = 0;
    ping = 18;
    activeLoadout: LoadoutProfile = { ...DEFAULT_FFA_LOADOUT };

    roleMaterial: THREE.Material = roleMaterial;

    init() {
        this.userInputSystem = new UserInputSystem();
        this.weaponSystem = WeaponSystem.getInstance();

        this.cameraController = new FPSCameraController();
        this.cameraController.init();
        this.movementController = new MovementController();
        this.movementController.init();

        this.inventorySystem = new InventorySystem();
        this.inventorySystem.init();
        this.applyLoadout(DEFAULT_FFA_LOADOUT);

        window.addEventListener('game:play-now', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as PlayNowDetail;
            this.applyLoadout(detail?.auth?.loadout || this.activeLoadout);
        });
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        if (this.health <= 0) {
            this.movementController.clearInputState();
            return;
        }
        this.movementController.callEveryFrame(deltaTime);
        this.inventorySystem.callEveryFrame(deltaTime, elapsedTime);
    }

    private applyLoadout(rawLoadout: Partial<LoadoutProfile> | null | undefined) {
        const normalized = normalizeLoadoutProfile(rawLoadout);
        const unchanged =
            this.activeLoadout.primary === normalized.primary &&
            this.activeLoadout.secondary === normalized.secondary &&
            this.activeLoadout.knife === normalized.knife;

        const hasWeapons =
            !!this.inventorySystem.weapons.get(InventorySlotEnum.Primary) &&
            !!this.inventorySystem.weapons.get(InventorySlotEnum.Secondary) &&
            !!this.inventorySystem.weapons.get(InventorySlotEnum.Malee);

        if (unchanged && hasWeapons) {
            this.inventorySystem.resetWeaponsToSpawnAmmo();
            this.inventorySystem.switchEquipment(InventorySlotEnum.Primary);
            this.inventorySystem.refreshCurrentWeaponState();
            return;
        }

        this.activeLoadout = normalized;
        const pack = createWeaponsForLoadout(this.activeLoadout);
        this.inventorySystem.applyLoadoutPack(pack.bySlot, InventorySlotEnum.Primary);
    }
}
