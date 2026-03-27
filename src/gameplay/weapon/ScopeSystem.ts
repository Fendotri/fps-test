import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { UserInputEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { UserInputEvent, UserInputEventPipe } from '@src/gameplay/pipes/UserinputEventPipe';
import { GameLogicEventPipe, PlayerDiedEvent, WeaponEquipEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { MathUtils } from 'three';

type ScopeOverlayType = 'none' | 'rifle' | 'sniper';

type ScopeConfig = {
    fovLevels: number[];
    sensitivityLevels: number[];
    inaccuracyMultipliers: number[];
    zoomInSpeed: number;
    zoomOutSpeed: number;
    overlay: ScopeOverlayType;
    hideHandModel: boolean;
};

type ScopeRuntimeState = {
    active: boolean;
    weaponKey: string;
    zoomIndex: number;
    overlay: ScopeOverlayType;
    sensitivityMul: number;
    inaccuracyMul: number;
};

const normalizeWeaponKey = (raw: string) => `${raw || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');

const DEFAULT_SCOPE_STATE: ScopeRuntimeState = {
    active: false,
    weaponKey: '',
    zoomIndex: -1,
    overlay: 'none',
    sensitivityMul: 1,
    inaccuracyMul: 1,
};

const SCOPE_BY_WEAPON: Record<string, ScopeConfig> = {
    awp: {
        // Tuned for stronger CS2-like zoom feel with base FOV 65.
        fovLevels: [30, 8],
        sensitivityLevels: [0.44, 0.22],
        inaccuracyMultipliers: [0.05, 0.026],
        zoomInSpeed: 42,
        zoomOutSpeed: 34,
        overlay: 'sniper',
        hideHandModel: true,
    },
    aug: {
        fovLevels: [40],
        sensitivityLevels: [0.65],
        inaccuracyMultipliers: [0.42],
        zoomInSpeed: 34,
        zoomOutSpeed: 28,
        overlay: 'rifle',
        hideHandModel: false,
    },
    sg553: {
        fovLevels: [40],
        sensitivityLevels: [0.65],
        inaccuracyMultipliers: [0.42],
        zoomInSpeed: 34,
        zoomOutSpeed: 28,
        overlay: 'rifle',
        hideHandModel: false,
    },
};

/**
 * CS-style scope controller:
 * - AWP: right click cycles zoom1 -> zoom2 -> off
 * - AUG / SG553: right click toggles scoped on/off
 */
export class ScopeSystem implements CycleInterface, LoopInterface {

    private static runtime: ScopeRuntimeState = { ...DEFAULT_SCOPE_STATE };

    private localPlayer = LocalPlayer.getInstance();
    private baseFov = 65;
    private targetFov = 65;
    private currentConfig: ScopeConfig | null = null;

    static isScopedForWeapon(weaponIdOrName: string): boolean {
        const state = ScopeSystem.runtime;
        if (!state.active) return false;
        return normalizeWeaponKey(weaponIdOrName) === state.weaponKey;
    }

    static getShotInaccuracyMultiplier(weaponIdOrName: string): number {
        const state = ScopeSystem.runtime;
        if (!ScopeSystem.isScopedForWeapon(weaponIdOrName)) return 1;
        return MathUtils.clamp(state.inaccuracyMul, 0.02, 1);
    }

    init(): void {
        this.baseFov = (GameContext.Cameras.PlayerCamera as THREE.PerspectiveCamera).fov || 65;
        this.targetFov = this.baseFov;

        UserInputEventPipe.addEventListener(UserInputEvent.type, (e: CustomEvent) => {
            if (e.detail.enum !== UserInputEventEnum.BUTTON_SCOPE_TOGGLE) return;
            this.onScopeToggleRequest();
        });

        GameLogicEventPipe.addEventListener(WeaponEquipEvent.type, () => {
            if (ScopeSystem.runtime.active) this.resetScope();
        });

        GameLogicEventPipe.addEventListener(PlayerDiedEvent.type, () => {
            if (ScopeSystem.runtime.active) this.resetScope();
        });

        window.addEventListener('game:return-main-menu', () => this.resetScope());
        window.addEventListener('game:play-now', () => this.resetScope());
        window.addEventListener('blur', () => this.resetScope());
    }

    callEveryFrame(deltaTime?: number): void {
        if (ScopeSystem.runtime.active && !GameContext.PointLock.isLocked) this.resetScope();

        const camera = GameContext.Cameras.PlayerCamera as THREE.PerspectiveCamera;
        const dt = Math.min(0.05, Math.max(0.001, deltaTime || 0.016));
        const isZoomingIn = this.targetFov < camera.fov;
        const lerpSpeed = this.currentConfig
            ? (isZoomingIn ? this.currentConfig.zoomInSpeed : this.currentConfig.zoomOutSpeed)
            : 24;
        const alpha = 1 - Math.exp(-Math.max(1, lerpSpeed) * dt);
        const nextFov = MathUtils.lerp(camera.fov, this.targetFov, alpha);
        camera.fov = Math.abs(nextFov - this.targetFov) <= 0.03 ? this.targetFov : nextFov;
        camera.updateProjectionMatrix();
    }

    private onScopeToggleRequest() {
        if (!GameContext.PointLock.isLocked) return;
        if (this.localPlayer.health <= 0) return;
        const currentWeapon = this.getEquippedWeaponName();
        if (!currentWeapon) return;

        const key = normalizeWeaponKey(currentWeapon);
        const cfg = SCOPE_BY_WEAPON[key];
        if (!cfg) {
            if (ScopeSystem.runtime.active) this.resetScope();
            return;
        }

        if (!ScopeSystem.runtime.active || ScopeSystem.runtime.weaponKey !== key) {
            this.applyScope(cfg, key, 0);
            return;
        }

        const nextIndex = ScopeSystem.runtime.zoomIndex + 1;
        if (nextIndex >= cfg.fovLevels.length) {
            this.resetScope();
            return;
        }

        this.applyScope(cfg, key, nextIndex);
    }

    private applyScope(cfg: ScopeConfig, weaponKey: string, zoomIndex: number) {
        const safeIndex = Math.max(0, Math.min(cfg.fovLevels.length - 1, zoomIndex));
        this.currentConfig = cfg;
        this.targetFov = cfg.fovLevels[safeIndex] || this.baseFov;

        ScopeSystem.runtime = {
            active: true,
            weaponKey,
            zoomIndex: safeIndex,
            overlay: cfg.overlay,
            sensitivityMul: cfg.sensitivityLevels[safeIndex] || 1,
            inaccuracyMul: cfg.inaccuracyMultipliers[safeIndex] || 1,
        };

        GameContext.Scenes.Handmodel.visible = !cfg.hideHandModel;
        this.emitScopeState();
    }

    private resetScope() {
        this.currentConfig = null;
        this.targetFov = this.baseFov;
        ScopeSystem.runtime = { ...DEFAULT_SCOPE_STATE };
        GameContext.Scenes.Handmodel.visible = true;
        this.emitScopeState();
    }

    private emitScopeState() {
        window.dispatchEvent(new CustomEvent('game:scope-state', {
            detail: {
                ...ScopeSystem.runtime,
            },
        }));
    }

    private getEquippedWeaponName() {
        const inv = this.localPlayer.inventorySystem;
        if (!inv) return '';
        const weapon = inv.weapons.get(inv.nowEquipInventory);
        if (!weapon) return '';
        return `${weapon.weaponId || weapon.weaponName || ''}`;
    }

}
