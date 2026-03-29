import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { GameContext } from '@src/core/GameContext';
import {
    getContentStudioAdminKey,
    getContentStudioDefaults,
    getContentStudioSaved,
    loadContentStudioFromBackend,
    resetContentStudioDraft,
    revertContentStudioDraft,
    saveContentStudio,
    saveContentStudioToBackend,
    setContentStudioAdminKey,
    subscribeContentStudio,
    updateContentStudio,
    uploadContentStudioAsset,
} from '@src/content/ContentStudio';
import { WEAPON_CATALOG } from '@src/gameplay/loadout/weaponCatalog';
import {
    getRuntimeBotIds,
    getRuntimeTuningDefaults,
    getRuntimeTuningSaved,
    resetRuntimeTuningDraft,
    revertRuntimeTuningDraft,
    saveRuntimeTuning,
    subscribeRuntimeTuning,
    updateRuntimeTuning,
} from '@src/gameplay/tuning/RuntimeTuning';
import { backendApi } from '@src/services/BackendApi';
import { EnemyBotSystem } from '@src/gameplay/bot/EnemyBotSystem';
import { setDebugFreeCameraActive, isDebugFreeCameraActive } from '@src/debug/DebugFreeCamera';
import { DomEventPipe, PointLockEvent } from '@src/gameplay/pipes/DomEventPipe';
import { PointLockEventEnum } from '@src/gameplay/abstract/EventsEnum';

const BOT_META = { ct_1: ['BOT_ALEX', 'Bot Alex'], ct_2: ['BOT_MIRA', 'Bot Mira'], t_1: ['BOT_IVAN', 'Bot Ivan'], t_2: ['BOT_NOVA', 'Bot Nova'], t_3: ['BOT_SHADE', 'Bot Shade'] };
const CATS = [['movement', 'Movement', 'Hareket'], ['effects', 'Effects', 'Efektler'], ['weapons', 'Weapon Tuning', 'Silah Ayari'], ['bots', 'Bots', 'Botlar'], ['bot-profiles', 'Bot Profiles', 'Bot Profilleri'], ['content', 'Content Studio', 'Icerik Studyo'], ['debug', 'Debug', 'Debug']];
const TYPES = [['weapons', 'Weapons', 'Silahlar'], ['cases', 'Cases', 'Kasalar'], ['packs', 'Packs', 'Paketler'], ['players', 'Players', 'Oyuncular'], ['maps', 'Maps', 'Haritalar']];
const MOV = [['groundAccel', 'Ground Accel', 'Yerde Hizlanma', 1, 140, 0.1], ['airAccel', 'Air Accel', 'Havada Hizlanma', 0.1, 60, 0.1], ['friction', 'Friction', 'Surtunme', 0.1, 40, 0.1], ['maxGroundSpeed', 'Ground Speed', 'Yerde Hiz', 1, 20, 0.01], ['maxAirSpeed', 'Air Speed', 'Hava Hizi', 1, 20, 0.01], ['walkSpeedMul', 'Walk Multiplier', 'Yurume Carpani', 0.1, 1.4, 0.01], ['crouchSpeedMul', 'Crouch Multiplier', 'Comelme Carpani', 0.1, 1.2, 0.01], ['jumpSpeed', 'Jump Speed', 'Ziplama Hizi', 1, 20, 0.01]];
const FX = [['tracerLifetimeMul', 'Tracer Lifetime', 'Iz Suresi', 0.1, 4, 0.01], ['tracerOpacityMul', 'Tracer Opacity', 'Iz Opakligi', 0.05, 3, 0.01], ['bodyFlashScale', 'Hit Flash Scale', 'Vurus Parlamasi', 0.1, 4, 0.01], ['bodyParticleCountMul', 'Hit Particle Count', 'Partikul Sayisi', 0.1, 4, 0.01], ['bodyParticleLifetimeMul', 'Hit Particle Life', 'Partikul Omru', 0.1, 4, 0.01], ['bodyParticleSpeedMul', 'Hit Particle Speed', 'Partikul Hizi', 0.1, 4, 0.01], ['corpseLifetimeSeconds', 'Corpse Lifetime', 'Ceset Kalma', 0.5, 30, 0.1], ['corpseFadeSeconds', 'Corpse Fade', 'Ceset Solma', 0.1, 10, 0.05], ['botGlowDuration', 'Bot Glow Duration', 'Bot Parlama', 0.02, 2, 0.01], ['botGlowIntensity', 'Bot Glow Intensity', 'Bot Isik Siddeti', 0.1, 4, 0.01], ['botGlowDecay', 'Bot Glow Decay', 'Bot Solma', 0.1, 20, 0.1]];
const BOTS = [['activeCount', 'Bot Count', 'Bot Sayisi', 0, getRuntimeBotIds().length, 1], ['turnSpeedMul', 'Turn Speed', 'Donus Hizi', 0.15, 3, 0.01], ['reactionMul', 'Reaction Time', 'Tepki Suresi', 0.15, 3, 0.01], ['burstMul', 'Burst Size', 'Seri Boyutu', 0.2, 3, 0.01], ['cooldownMul', 'Burst Cooldown', 'Seri Bekleme', 0.2, 3, 0.01], ['spreadMul', 'Bot Spread', 'Bot Sacilma', 0.2, 3, 0.01], ['aimLockMul', 'Aim Lock Speed', 'Nisan Kilit', 0.2, 2, 0.01], ['hitChanceMul', 'Hit Chance', 'Vurus Sansi', 0.2, 2, 0.01]];
const P_BOTS = [['reactionMul', 'Reaction Time', 'Tepki Suresi', 0.15, 3, 0.01], ['trackingMul', 'Tracking', 'Takip', 0.2, 2.5, 0.01], ['aggression', 'Aggression', 'Saldirganlik', 0.2, 2.5, 0.01], ['defense', 'Defense', 'Savunma', 0.2, 2.5, 0.01], ['tactical', 'Tactical', 'Taktiksellik', 0.2, 2.5, 0.01], ['turnSpeedMul', 'Turn Speed', 'Donus Hizi', 0.15, 3, 0.01], ['hitChanceMul', 'Hit Chance', 'Vurus Sansi', 0.2, 2, 0.01]];
const WPN = [['damage', 'Damage', 'Hasar', 1, 300, 1], ['damageMultiplier', 'Damage Multiplier', 'Hasar Carpani', 0.1, 4, 0.01], ['rpm', 'RPM', 'Atis Devri', 10, 1500, 1], ['tracerSpeed', 'Tracer Speed', 'Iz Hizi', 0, 10000, 10], ['magazine', 'Magazine', 'Sarjor', 1, 200, 1], ['reserve', 'Reserve Ammo', 'Yedek Mermi', 0, 400, 1], ['speed', 'Move Speed', 'Hareket Hizi', 120, 320, 1], ['recoilControl', 'Recoil Control', 'Geri Tepme', 1, 10, 0.1], ['accurateRange', 'Accurate Range', 'Dogru Menzil', 2, 1200, 1], ['recoverTime', 'Deploy Time', 'Cekme Suresi', 0.05, 6, 0.01], ['reloadTime', 'Reload Time', 'Doldurma', 0.05, 10, 0.01], ['spreadMultiplier', 'Spread Multiplier', 'Sacilma Carpani', 0.1, 4, 0.01], ['recoilMultiplier', 'Recoil Multiplier', 'Tepme Carpani', 0.1, 4, 0.01], ['materialBrightness', 'Material Brightness', 'Parlaklik', 0.25, 3, 0.01]];
const MESH_PRESETS = [['auto', 'Auto', 'Otomatik'], ['ak', 'AK', 'AK'], ['usp', 'USP', 'USP'], ['m9', 'M9', 'M9']];
const SLOT_OPTIONS = [['primary', 'Primary', 'Birincil'], ['secondary', 'Secondary', 'Ikincil'], ['knife', 'Knife', 'Bicak']];
const PLACEHOLDER_RIGS = [['ak', 'AK Rig', 'AK Rig'], ['usp', 'USP Rig', 'USP Rig'], ['m9', 'M9 Rig', 'M9 Rig']];
const RARITIES = [['consumer', 'Consumer', 'Tuketici'], ['industrial', 'Industrial', 'Endustriyel'], ['milspec', 'Mil-Spec', 'Standart'], ['restricted', 'Restricted', 'Sinirli'], ['classified', 'Classified', 'Gizli'], ['covert', 'Covert', 'Nadir'], ['contraband', 'Contraband', 'Yasakli']];
const PLAYER_ASSET_TARGETS = ['player-icon', 'player-model', 'player-animation'];

const fmt = (v) => typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v - Math.round(v)) < 0.0001 ? `${Math.round(v)}` : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')) : `${v || ''}`;
const tr = (en, local) => `${en} (${local})`;
const withDef = (v, d) => `${fmt(v)} (default ${fmt(d)})`;
const clone = (v) => JSON.parse(JSON.stringify(v));
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 7)}`;
const safeText = (v) => `${v || ''}`;
const toKey = (v) => `${v || ''}`.trim().toLowerCase();
const compare = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const getByPath = (obj, path) => `${path || ''}`.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
const setByPath = (obj, path, value) => { const parts = `${path || ''}`.split('.'); let ref = obj; for (let i = 0; i < parts.length - 1; i++) { const key = parts[i]; if (!ref[key] || typeof ref[key] !== 'object') ref[key] = {}; ref = ref[key]; } ref[parts[parts.length - 1]] = value; };
const parseNumber = (value, fallback = 0) => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; };

export class DeveloperPanelLayer {
    constructor() {
        this.visible = false;
        this.activeCategory = 'movement';
        this.activeWeaponId = WEAPON_CATALOG[0]?.weaponId || 'ak47';
        this.activeBotId = getRuntimeBotIds()[0] || 'ct_1';
        this.activeContentType = 'weapons';
        this.activeContentId = '';
        this.currentState = null;
        this.currentContentState = null;
        this.wasLockedBeforeOpen = false;
        this.defaults = getRuntimeTuningDefaults();
        this.contentDefaults = getContentStudioDefaults();
        this.controlMap = new Map();
        this.sectionMap = new Map();
        this.adminKey = getContentStudioAdminKey();
        this.backendBusy = false;
        this.previewRequestId = 0;
        this.previewSize = { w: 0, h: 0 };
        this.previewSpin = 0;
        this.currentPreviewPath = '';
        this.previewRenderer = null;
        this.previewScene = null;
        this.previewCamera = null;
        this.previewPivot = null;
        this.previewModel = null;
        this.previewMixer = null;
        this.previewAnimations = [];
        this.previewAnimationClipIndex = 0;
        this.previewMeshMap = new Map();
        this.assetOptions = { 'weapon-icon': [], 'weapon-model': [], 'player-icon': [], 'player-model': [], 'player-animation': [] };
        this.assetListEntityId = '';
        this.assetListRequestId = 0;
        this.meshTreeHostEl = null;
        this.playerVariantSelectEl = null;
        this.previewAnimSelectEl = null;
        this.showColliderDebug = false;
        this.showCollisionMeshDebug = false;
        this.freeCameraActive = false;
        this.freeCameraSpeed = 12;
        this.freeCameraBoost = 2.2;
        this.freeCameraKeys = new Set();
        this.freeCameraPitch = 0;
        this.freeCameraYaw = 0;
        this.freeCameraSavedPose = null;
        this.colliderDebugRoot = null;
        this.colliderDebugEntries = [];
        this.runtimeUnsub = null;
        this.contentUnsub = null;
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onDocKeyDown = this.onDocKeyDown.bind(this);
        this.onDocKeyUp = this.onDocKeyUp.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
    }

    init() {
        this.buildUI();
        this.runtimeUnsub = subscribeRuntimeTuning((state) => {
            this.currentState = state;
            this.defaults = getRuntimeTuningDefaults();
            this.ensureActiveWeapon();
            this.ensureActiveBot();
            this.syncFromState();
            this.refreshWeaponSelect();
            this.refreshStatus();
        });
        this.contentUnsub = subscribeContentStudio((state) => {
            this.currentContentState = state;
            this.contentDefaults = getContentStudioDefaults();
            this.adminKey = getContentStudioAdminKey();
            this.ensureActiveContentItem();
            this.ensureActiveWeapon();
            this.syncFromState();
            this.refreshWeaponSelect();
            this.refreshContentSelect();
            this.refreshContentPreview(this.getActiveContentItem());
            this.refreshStatus();
        });
        DomEventPipe.addEventListener(PointLockEvent.type, (event) => {
            if (!this.freeCameraActive) return;
            if (event.detail.enum !== PointLockEventEnum.MOUSEMOVE) return;
            const sensitivity = 0.0022;
            this.freeCameraYaw -= event.detail.movementX * sensitivity;
            this.freeCameraPitch = THREE.MathUtils.clamp(this.freeCameraPitch - event.detail.movementY * sensitivity, -Math.PI * 0.49, Math.PI * 0.49);
            GameContext.Cameras.PlayerCamera.rotation.order = 'YXZ';
            GameContext.Cameras.PlayerCamera.rotation.set(this.freeCameraPitch, this.freeCameraYaw, 0);
        });
        window.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keydown', this.onDocKeyDown);
        document.addEventListener('keyup', this.onDocKeyUp);
        window.addEventListener('resize', this.onWindowResize);
    }

    callEveryFrame(deltaTime = 0) {
        if (this.freeCameraActive) this.updateFreeCamera(deltaTime || 0.016);
        if (this.showColliderDebug || this.showCollisionMeshDebug) this.updateColliderDebug();
        if (!this.visible || !this.previewRenderer || !this.previewViewportEl || !this.previewScene || !this.previewCamera || !this.previewPivot) return;
        this.updatePreviewSize();
        this.previewSpin += deltaTime || 0.016;
        if (this.previewMixer) this.previewMixer.update(deltaTime || 0.016);
        if (this.previewModel) this.previewPivot.rotation.y = this.previewSpin * 0.65;
        this.previewRenderer.render(this.previewScene, this.previewCamera);
    }

    buildUI() {
        this.root = document.createElement('div');
        this.root.className = 'dev-panel hidden';
        this.shell = document.createElement('div');
        this.shell.className = 'dev-panel-shell';
        this.root.appendChild(this.shell);

        const head = document.createElement('div');
        head.className = 'dev-panel-head';
        head.innerHTML = `<div><div class="dev-panel-kicker">FORBOX TOOLING</div><div class="dev-panel-title">Developer Control Panel</div><div class="dev-panel-sub">F10 toggles live tuning, content editing and backend sync.</div></div>`;
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'dev-panel-status';
        head.appendChild(this.statusEl);
        this.shell.appendChild(head);

        const toolbar = document.createElement('div');
        toolbar.className = 'dev-panel-toolbar';
        toolbar.innerHTML = `<div class="dev-panel-actions"></div><div class="dev-panel-actions"></div>`;
        const [leftActions, rightActions] = Array.from(toolbar.querySelectorAll('.dev-panel-actions'));
        leftActions.append(
            this.makeActionButton('Save Tuning', () => { saveRuntimeTuning(); this.refreshStatus('Runtime tuning saved.'); }),
            this.makeActionButton('Revert Tuning', () => { revertRuntimeTuningDraft(); this.refreshStatus('Runtime tuning reverted.'); }),
            this.makeActionButton('Reset Tuning', () => { resetRuntimeTuningDraft(); this.refreshStatus('Runtime tuning reset.'); }),
        );
        rightActions.append(
            this.makeActionButton('Save Content', () => { saveContentStudio(); this.refreshStatus('Content draft saved locally.'); }),
            this.makeActionButton('Revert Content', () => { revertContentStudioDraft(); this.refreshStatus('Content reverted.'); }),
            this.makeActionButton('Reset Content', () => { resetContentStudioDraft(); this.refreshStatus('Content reset to defaults.'); }),
        );
        this.shell.appendChild(toolbar);

        this.bodyEl = document.createElement('div');
        this.bodyEl.className = 'dev-panel-body';

        this.tabsEl = document.createElement('div');
        this.tabsEl.className = 'dev-panel-tabs';
        CATS.forEach(([key, en, local]) => {
            const button = document.createElement('button');
            button.className = `dev-panel-tab${this.activeCategory === key ? ' is-active' : ''}`;
            button.textContent = tr(en, local);
            button.addEventListener('click', () => this.setActiveCategory(key));
            this.tabsEl.appendChild(button);
        });

        this.pagesEl = document.createElement('div');
        this.pagesEl.className = 'dev-panel-pages';
        this.gridEl = document.createElement('div');
        this.gridEl.className = 'dev-panel-grid';
        this.pagesEl.appendChild(this.gridEl);
        this.bodyEl.append(this.tabsEl, this.pagesEl);
        this.shell.appendChild(this.bodyEl);

        this.buildMovementControls();
        this.buildEffectControls();
        this.buildWeaponControls();
        this.buildBotControls();
        this.buildPerBotControls();
        this.buildContentControls();
        this.buildDebugControls();

        GameContext.GameView.Container.appendChild(this.root);
        this.refreshSectionVisibility();
        this.refreshStatus();
    }

    setActiveCategory(category) {
        this.activeCategory = category;
        Array.from(this.tabsEl.children).forEach((child, index) => {
            const key = CATS[index]?.[0];
            child.classList.toggle('is-active', key === category);
        });
        this.refreshSectionVisibility();
        this.updatePreviewSize();
    }

    buildMovementControls() {
        const section = this.createSection('movement', tr('Movement Runtime', 'Hareket Calisma Ayarlari'));
        const fields = this.createFieldsHost(section);
        MOV.forEach(([key, en, local, min, max, step]) => {
            this.createNumberControl({
                host: fields, key: `movement.${key}`, label: tr(en, local), min, max, step,
                getValue: () => getByPath(this.currentState, `movement.${key}`),
                getDefault: () => getByPath(this.defaults, `movement.${key}`),
                onInput: (value) => updateRuntimeTuning((draft) => { draft.movement[key] = value; }),
            });
        });
    }

    buildEffectControls() {
        const section = this.createSection('effects', tr('Effects Runtime', 'Efekt Calisma Ayarlari'));
        const fields = this.createFieldsHost(section);
        FX.forEach(([key, en, local, min, max, step]) => {
            this.createNumberControl({
                host: fields, key: `effects.${key}`, label: tr(en, local), min, max, step,
                getValue: () => getByPath(this.currentState, `effects.${key}`),
                getDefault: () => getByPath(this.defaults, `effects.${key}`),
                onInput: (value) => updateRuntimeTuning((draft) => { draft.effects[key] = value; }),
            });
        });
    }

    buildBotControls() {
        const section = this.createSection('bots', tr('Bot Runtime', 'Bot Calisma Ayarlari'));
        const fields = this.createFieldsHost(section);
        BOTS.forEach(([key, en, local, min, max, step]) => {
            this.createNumberControl({
                host: fields, key: `bots.${key}`, label: tr(en, local), min, max, step,
                getValue: () => getByPath(this.currentState, `bots.${key}`),
                getDefault: () => getByPath(this.defaults, `bots.${key}`),
                onInput: (value) => updateRuntimeTuning((draft) => { draft.bots[key] = value; }),
            });
        });
        const actions = document.createElement('div');
        actions.className = 'dev-panel-content-toolbar';
        actions.append(this.makeActionButton('Spawn Test Dummy', () => {
            const spawned = EnemyBotSystem.getInstance().spawnTestDummyAhead();
            this.refreshStatus(spawned ? 'Test dummy spawned 5m ahead.' : 'Test dummy spawn failed.');
        }));
        section.appendChild(actions);
    }

    buildPerBotControls() {
        const section = this.createSection('bot-profiles', tr('Per Bot Profiles', 'Bot Bazli Profiller'), true);
        const head = document.createElement('div');
        head.className = 'dev-panel-weapon-head';
        this.botSelectEl = document.createElement('select');
        this.botSelectEl.className = 'dev-panel-select';
        this.botSelectEl.addEventListener('change', () => { this.activeBotId = this.botSelectEl.value; this.syncFromState(); });
        head.appendChild(this.botSelectEl);
        section.appendChild(head);

        const fields = this.createFieldsHost(section);
        this.createToggleControl({
            host: fields, key: 'bots.perBot.enabled', label: tr('Enabled', 'Etkin'),
            getValue: () => !!getByPath(this.currentState, `bots.perBot.${this.activeBotId}.enabled`),
            getDefault: () => !!getByPath(this.defaults, `bots.perBot.${this.activeBotId}.enabled`),
            onInput: (value) => updateRuntimeTuning((draft) => { draft.bots.perBot[this.activeBotId].enabled = value; }),
        });
        P_BOTS.forEach(([key, en, local, min, max, step]) => {
            this.createNumberControl({
                host: fields, key: `bots.perBot.${key}`, label: tr(en, local), min, max, step,
                getValue: () => getByPath(this.currentState, `bots.perBot.${this.activeBotId}.${key}`),
                getDefault: () => getByPath(this.defaults, `bots.perBot.${this.activeBotId}.${key}`),
                onInput: (value) => updateRuntimeTuning((draft) => { draft.bots.perBot[this.activeBotId][key] = value; }),
            });
        });
        this.refreshBotSelect();
    }

    buildWeaponControls() {
        const section = this.createSection('weapons', tr('Per Weapon Tuning', 'Silah Bazli Ayar'), true);
        const head = document.createElement('div');
        head.className = 'dev-panel-weapon-head';
        this.weaponSelectEl = document.createElement('select');
        this.weaponSelectEl.className = 'dev-panel-select';
        this.weaponSelectEl.addEventListener('change', () => { this.activeWeaponId = this.weaponSelectEl.value; this.syncFromState(); });
        head.appendChild(this.weaponSelectEl);
        section.appendChild(head);

        const fields = this.createFieldsHost(section);
        this.createSelectControl({
            host: fields, key: 'weapons.meshPreset', label: tr('Mesh Preset', 'Mesh Hazir Ayari'), options: MESH_PRESETS,
            getValue: () => getByPath(this.currentState, `weapons.${this.activeWeaponId}.meshPreset`),
            getDefault: () => getByPath(this.defaults, `weapons.${this.activeWeaponId}.meshPreset`),
            onInput: (value) => updateRuntimeTuning((draft) => { draft.weapons[this.activeWeaponId].meshPreset = value; }),
        });
        this.createTextControl({
            host: fields, key: 'weapons.materialTint', label: tr('Material Tint', 'Materyal Rengi'),
            getValue: () => getByPath(this.currentState, `weapons.${this.activeWeaponId}.materialTint`),
            getDefault: () => getByPath(this.defaults, `weapons.${this.activeWeaponId}.materialTint`),
            onInput: (value) => updateRuntimeTuning((draft) => { draft.weapons[this.activeWeaponId].materialTint = safeText(value).trim() || '#FFFFFF'; }),
        });
        WPN.forEach(([key, en, local, min, max, step]) => {
            this.createNumberControl({
                host: fields, key: `weapons.${key}`, label: tr(en, local), min, max, step,
                getValue: () => getByPath(this.currentState, `weapons.${this.activeWeaponId}.${key}`),
                getDefault: () => getByPath(this.defaults, `weapons.${this.activeWeaponId}.${key}`),
                onInput: (value) => updateRuntimeTuning((draft) => { draft.weapons[this.activeWeaponId][key] = value; }),
            });
        });
        this.refreshWeaponSelect();
    }

    buildContentControls() {
        const section = this.createSection('content', tr('Content Studio', 'Icerik Studyo'), true);
        const head = document.createElement('div');
        head.className = 'dev-panel-content-head';
        const adminFields = document.createElement('div');
        adminFields.className = 'dev-panel-fields';
        this.createTextControl({
            host: adminFields, key: 'content.adminKey', label: tr('Admin Key', 'Yonetici Anahtari'),
            getValue: () => this.adminKey, getDefault: () => '',
            onInput: (value) => { this.adminKey = safeText(value).trim(); setContentStudioAdminKey(this.adminKey); this.refreshStatus(); },
        });
        head.appendChild(adminFields);
        const toolbar = document.createElement('div');
        toolbar.className = 'dev-panel-content-toolbar';
        toolbar.append(this.makeActionButton('Load Backend', () => this.loadBackendContent()), this.makeActionButton('Save Backend', () => this.saveBackendContent()));
        head.appendChild(toolbar);
        section.appendChild(head);

        const typeToolbar = document.createElement('div');
        typeToolbar.className = 'dev-panel-content-toolbar';
        this.contentTypeSelectEl = document.createElement('select');
        this.contentTypeSelectEl.className = 'dev-panel-select';
        TYPES.forEach(([key, en, local]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = tr(en, local);
            this.contentTypeSelectEl.appendChild(option);
        });
        this.contentTypeSelectEl.value = this.activeContentType;
        this.contentTypeSelectEl.addEventListener('change', () => {
            this.activeContentType = this.contentTypeSelectEl.value;
            this.ensureActiveContentItem(true);
            this.refreshContentSelect();
            this.syncFromState();
            this.refreshContentEditor();
            this.loadAssetOptionsForActiveEntity(true);
        });
        this.contentSelectEl = document.createElement('select');
        this.contentSelectEl.className = 'dev-panel-select';
        this.contentSelectEl.addEventListener('change', () => {
            this.activeContentId = this.contentSelectEl.value;
            this.syncFromState();
            this.refreshContentPreview(this.getActiveContentItem());
            this.refreshContentEditor();
            this.loadAssetOptionsForActiveEntity(true);
        });
        typeToolbar.append(this.contentTypeSelectEl, this.contentSelectEl, this.makeActionButton('Add', () => this.addContentEntity()), this.makeActionButton('Duplicate', () => this.duplicateContentEntity()), this.makeActionButton('Delete', () => this.deleteContentEntity()));
        section.appendChild(typeToolbar);

        this.previewWrapEl = document.createElement('div');
        this.previewWrapEl.className = 'dev-panel-preview';
        const previewInfoCol = document.createElement('div');
        previewInfoCol.className = 'dev-panel-preview-info';
        this.previewArtEl = document.createElement('div');
        this.previewArtEl.className = 'dev-panel-preview-art';
        this.previewIconImgEl = document.createElement('img');
        this.previewIconImgEl.className = 'dev-panel-preview-image hidden';
        this.previewIconImgEl.alt = 'weapon preview icon';
        this.previewArtEl.appendChild(this.previewIconImgEl);
        this.previewMetaEl = document.createElement('div');
        this.previewMetaEl.className = 'dev-panel-preview-meta';
        previewInfoCol.append(this.previewArtEl, this.previewMetaEl);
        this.previewViewportShellEl = document.createElement('div');
        this.previewViewportShellEl.className = 'dev-panel-preview-viewport-shell hidden';
        this.previewViewportEl = document.createElement('div');
        this.previewViewportEl.className = 'dev-panel-preview-viewport';
        this.previewCaptionEl = document.createElement('div');
        this.previewCaptionEl.className = 'dev-panel-preview-caption';
        this.previewCaptionEl.textContent = '3D preview ready for .glb .gltf .fbx .obj';
        this.previewAnimSelectEl = document.createElement('select');
        this.previewAnimSelectEl.className = 'dev-panel-select hidden';
        this.previewAnimSelectEl.addEventListener('change', () => {
            this.previewAnimationClipIndex = Math.max(0, Number(this.previewAnimSelectEl.value) || 0);
            this.playPreviewAnimation(this.previewAnimations, this.previewAnimationClipIndex);
        });
        this.previewViewportShellEl.append(this.previewViewportEl, this.previewCaptionEl, this.previewAnimSelectEl);
        this.previewWrapEl.append(previewInfoCol, this.previewViewportShellEl);
        section.appendChild(this.previewWrapEl);

        this.contentEditorHostEl = document.createElement('div');
        this.contentEditorHostEl.className = 'dev-panel-grid';
        section.appendChild(this.contentEditorHostEl);
        this.refreshContentSelect();
        this.refreshContentEditor();
        this.refreshContentPreview(this.getActiveContentItem());
        this.loadAssetOptionsForActiveEntity(true);
    }

    refreshContentEditor() {
        if (!this.contentEditorHostEl) return;
        this.contentEditorHostEl.innerHTML = '';
        if (this.previewWrapEl) this.previewWrapEl.classList.remove('dev-panel-preview--sticky');
        const item = this.getActiveContentItem();
        if (!item) {
            const empty = document.createElement('div');
            empty.className = 'dev-panel-empty';
            empty.textContent = 'No content item selected.';
            this.contentEditorHostEl.appendChild(empty);
            this.refreshContentPreview(null);
            return;
        }
        if (this.activeContentType === 'weapons') this.buildWeaponContentEditor();
        else if (this.activeContentType === 'cases') this.buildCaseContentEditor();
        else if (this.activeContentType === 'packs') this.buildPackContentEditor();
        else if (this.activeContentType === 'players') this.buildPlayerContentEditor();
        else this.buildPlaceholderContentEditor();
        this.refreshContentPreview(item);
        this.syncFromState();
    }

    buildWeaponContentEditor() {
        const main = this.createContentSection(tr('Weapon Data', 'Silah Verisi'));
        const fields = this.createFieldsHost(main);
        this.createTextControl({ host: fields, key: 'content.weapons.weaponId', label: tr('Weapon Id', 'Silah Kimligi'), getValue: () => this.getActiveContentItem()?.weaponId || '', getDefault: () => this.getDefaultContentValue('weaponId'), onInput: (value) => this.updateActiveContentField('weaponId', toKey(value) || rid('weapon')) });
        this.createTextControl({ host: fields, key: 'content.weapons.displayName', label: tr('Display Name', 'Gorunen Isim'), getValue: () => this.getActiveContentItem()?.displayName || '', getDefault: () => this.getDefaultContentValue('displayName'), onInput: (value) => this.updateActiveContentField('displayName', safeText(value)) });
        this.createTextAreaControl({ host: fields, key: 'content.weapons.description', label: tr('Description', 'Aciklama'), getValue: () => this.getActiveContentItem()?.description || '', getDefault: () => this.getDefaultContentValue('description'), onInput: (value) => this.updateActiveContentField('description', safeText(value)) });
        this.createTextControl({ host: fields, key: 'content.weapons.category', label: tr('Category', 'Kategori'), getValue: () => this.getActiveContentItem()?.category || '', getDefault: () => this.getDefaultContentValue('category'), onInput: (value) => this.updateActiveContentField('category', safeText(value)) });
        this.createNumberInputControl({ host: fields, key: 'content.weapons.priceCoin', label: tr('Price Coin', 'Fiyat'), step: 1, getValue: () => this.getActiveContentItem()?.priceCoin ?? 0, getDefault: () => this.getDefaultContentValue('priceCoin'), onInput: (value) => this.updateActiveContentField('priceCoin', Math.max(0, Math.round(parseNumber(value, 0)))) });
        this.createSelectControl({ host: fields, key: 'content.weapons.rarity', label: tr('Rarity', 'Nadirlik'), options: RARITIES, getValue: () => this.getActiveContentItem()?.rarity || 'milspec', getDefault: () => this.getDefaultContentValue('rarity'), onInput: (value) => this.updateActiveContentField('rarity', value) });
        this.createNumberInputControl({ host: fields, key: 'content.weapons.dropWeight', label: tr('Drop Weight', 'Dusme Agirligi'), step: 0.1, getValue: () => this.getActiveContentItem()?.dropWeight ?? 0, getDefault: () => this.getDefaultContentValue('dropWeight'), onInput: (value) => this.updateActiveContentField('dropWeight', Math.max(0, parseNumber(value, 0))) });
        this.createSelectControl({ host: fields, key: 'content.weapons.slot', label: tr('Slot', 'Yuva'), options: SLOT_OPTIONS, getValue: () => this.getActiveContentItem()?.slot || 'primary', getDefault: () => this.getDefaultContentValue('slot'), onInput: (value) => this.updateActiveContentField('slot', value) });
        this.createSelectControl({ host: fields, key: 'content.weapons.placeholderRig', label: tr('Placeholder Rig', 'Yer Tutucu Rig'), options: PLACEHOLDER_RIGS, getValue: () => this.getActiveContentItem()?.placeholderRig || 'ak', getDefault: () => this.getDefaultContentValue('placeholderRig'), onInput: (value) => this.updateActiveContentField('placeholderRig', value) });
        this.createToggleControl({ host: fields, key: 'content.weapons.enabled', label: tr('Enabled', 'Etkin'), getValue: () => this.getActiveContentItem()?.enabled !== false, getDefault: () => this.getDefaultContentValue('enabled'), onInput: (value) => this.updateActiveContentField('enabled', value) });

        const assets = this.createContentSection(tr('Asset Paths', 'Dosya Yollari'));
        const assetFields = this.createFieldsHost(assets);
        this.createTextControl({ host: assetFields, key: 'content.weapons.iconPath', label: tr('Icon Path', 'Ikon Yolu'), getValue: () => this.getActiveContentItem()?.iconPath || '', getDefault: () => this.getDefaultContentValue('iconPath'), onInput: (value) => this.updateActiveContentField('iconPath', safeText(value).trim()) });
        this.createWeaponAssetSelect(assetFields, { key: 'content.weapons.iconLibrary', label: tr('Icon Library', 'Ikon Kutuphanesi'), target: 'weapon-icon', pathField: 'iconPath' });
        this.createFileControl({ host: assetFields, key: 'content.weapons.iconFile', label: tr('Icon File (.png .jpg .jpeg .webp)', 'Ikon Dosyasi'), accept: '.png,.jpg,.jpeg,.webp', onInput: (file) => this.uploadWeaponAsset('weapon-icon', file) });
        this.createTextControl({ host: assetFields, key: 'content.weapons.modelPath', label: tr('Model Path', 'Model Yolu'), getValue: () => this.getActiveContentItem()?.modelPath || '', getDefault: () => this.getDefaultContentValue('modelPath'), onInput: (value) => this.updateActiveContentField('modelPath', safeText(value).trim()) });
        this.createWeaponAssetSelect(assetFields, { key: 'content.weapons.modelLibrary', label: tr('Model Library', 'Model Kutuphanesi'), target: 'weapon-model', pathField: 'modelPath' });
        this.createFileControl({ host: assetFields, key: 'content.weapons.modelFile', label: tr('Model File (.glb .gltf .fbx .obj)', 'Model Dosyasi'), accept: '.glb,.gltf,.fbx,.obj', onInput: (file) => this.uploadWeaponAsset('weapon-model', file) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelPositionX', label: tr('Model Position X', 'Model Pozisyon X'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelPosition?.[0] ?? 0, getDefault: () => this.getDefaultContentValue('modelPosition.0'), onInput: (value) => this.updateVec3Field('modelPosition', 0, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelPositionY', label: tr('Model Position Y', 'Model Pozisyon Y'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelPosition?.[1] ?? 0, getDefault: () => this.getDefaultContentValue('modelPosition.1'), onInput: (value) => this.updateVec3Field('modelPosition', 1, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelPositionZ', label: tr('Model Position Z', 'Model Pozisyon Z'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelPosition?.[2] ?? 0, getDefault: () => this.getDefaultContentValue('modelPosition.2'), onInput: (value) => this.updateVec3Field('modelPosition', 2, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelRotationX', label: tr('Model Rotation X', 'Model Rotasyon X'), step: 1, getValue: () => this.getActiveContentItem()?.modelRotation?.[0] ?? 0, getDefault: () => this.getDefaultContentValue('modelRotation.0'), onInput: (value) => this.updateVec3Field('modelRotation', 0, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelRotationY', label: tr('Model Rotation Y', 'Model Rotasyon Y'), step: 1, getValue: () => this.getActiveContentItem()?.modelRotation?.[1] ?? 180, getDefault: () => this.getDefaultContentValue('modelRotation.1'), onInput: (value) => this.updateVec3Field('modelRotation', 1, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelRotationZ', label: tr('Model Rotation Z', 'Model Rotasyon Z'), step: 1, getValue: () => this.getActiveContentItem()?.modelRotation?.[2] ?? 0, getDefault: () => this.getDefaultContentValue('modelRotation.2'), onInput: (value) => this.updateVec3Field('modelRotation', 2, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelScaleX', label: tr('Model Scale X', 'Model Olcek X'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelScale?.[0] ?? 1, getDefault: () => this.getDefaultContentValue('modelScale.0'), onInput: (value) => this.updateVec3Field('modelScale', 0, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelScaleY', label: tr('Model Scale Y', 'Model Olcek Y'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelScale?.[1] ?? 1, getDefault: () => this.getDefaultContentValue('modelScale.1'), onInput: (value) => this.updateVec3Field('modelScale', 1, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.weapons.modelScaleZ', label: tr('Model Scale Z', 'Model Olcek Z'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelScale?.[2] ?? 1, getDefault: () => this.getDefaultContentValue('modelScale.2'), onInput: (value) => this.updateVec3Field('modelScale', 2, value) });
        const spawnActions = document.createElement('div');
        spawnActions.className = 'dev-panel-content-toolbar';
        spawnActions.append(this.makeActionButton('Spawn 1m Ahead', () => this.spawnSelectedWeapon()));
        assets.appendChild(spawnActions);
        const note = document.createElement('div');
        note.className = 'dev-panel-hint';
        note.textContent = 'Uploaded assets are stored per weapon id. Select AWP to see only AWP icon/model files, upload a new file, then pick it from the library dropdown or let the panel auto-assign it.';
        assets.appendChild(note);
    }

    buildCaseContentEditor() {
        const main = this.createContentSection(tr('Case Data', 'Kasa Verisi'));
        const fields = this.createFieldsHost(main);
        this.createTextControl({ host: fields, key: 'content.cases.id', label: tr('Case Id', 'Kasa Kimligi'), getValue: () => this.getActiveContentItem()?.id || '', getDefault: () => this.getDefaultContentValue('id'), onInput: (value) => this.updateActiveContentField('id', toKey(value) || rid('case')) });
        this.createTextControl({ host: fields, key: 'content.cases.title', label: tr('Title', 'Baslik'), getValue: () => this.getActiveContentItem()?.title || '', getDefault: () => this.getDefaultContentValue('title'), onInput: (value) => this.updateActiveContentField('title', safeText(value)) });
        this.createTextAreaControl({ host: fields, key: 'content.cases.description', label: tr('Description', 'Aciklama'), getValue: () => this.getActiveContentItem()?.description || '', getDefault: () => this.getDefaultContentValue('description'), onInput: (value) => this.updateActiveContentField('description', safeText(value)) });
        this.createTextControl({ host: fields, key: 'content.cases.offerId', label: tr('Offer Id', 'Teklif Kimligi'), getValue: () => this.getActiveContentItem()?.offerId || '', getDefault: () => this.getDefaultContentValue('offerId'), onInput: (value) => this.updateActiveContentField('offerId', toKey(value) || rid('offer')) });
        this.createNumberInputControl({ host: fields, key: 'content.cases.openPriceCoin', label: tr('Open Price', 'Acma Fiyati'), step: 1, getValue: () => this.getActiveContentItem()?.openPriceCoin ?? 0, getDefault: () => this.getDefaultContentValue('openPriceCoin'), onInput: (value) => this.updateActiveContentField('openPriceCoin', Math.max(0, Math.round(parseNumber(value, 0)))) });
        this.createNumberInputControl({ host: fields, key: 'content.cases.priceCoin', label: tr('Store Price', 'Magaza Fiyati'), step: 1, getValue: () => this.getActiveContentItem()?.priceCoin ?? 0, getDefault: () => this.getDefaultContentValue('priceCoin'), onInput: (value) => this.updateActiveContentField('priceCoin', Math.max(0, Math.round(parseNumber(value, 0)))) });
        this.createToggleControl({ host: fields, key: 'content.cases.enabled', label: tr('Enabled', 'Etkin'), getValue: () => this.getActiveContentItem()?.enabled !== false, getDefault: () => this.getDefaultContentValue('enabled'), onInput: (value) => this.updateActiveContentField('enabled', value) });
        this.createTextAreaControl({ host: fields, key: 'content.cases.drops', label: tr('Drops (skin|rarity|weaponId|weight)', 'Dusmeler'), getValue: () => (this.getActiveContentItem()?.drops || []).map((drop) => [drop.skin || '', drop.rarity || '', drop.weaponId || '', fmt(drop.weight ?? 0)].join('|')).join('\n'), getDefault: () => '', onInput: (value) => { const drops = safeText(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [skin = '', rarity = 'milspec', weaponId = '', weight = '10'] = line.split('|'); return { skin: skin.trim(), rarity: rarity.trim(), weaponId: toKey(weaponId), weight: parseNumber(weight, 10) }; }); this.updateActiveContentField('drops', drops); } });
    }

    buildPackContentEditor() {
        const main = this.createContentSection(tr('Pack Data', 'Paket Verisi'));
        const fields = this.createFieldsHost(main);
        this.createTextControl({ host: fields, key: 'content.packs.id', label: tr('Pack Id', 'Paket Kimligi'), getValue: () => this.getActiveContentItem()?.id || '', getDefault: () => this.getDefaultContentValue('id'), onInput: (value) => this.updateActiveContentField('id', toKey(value) || rid('pack')) });
        this.createTextControl({ host: fields, key: 'content.packs.title', label: tr('Title', 'Baslik'), getValue: () => this.getActiveContentItem()?.title || '', getDefault: () => this.getDefaultContentValue('title'), onInput: (value) => this.updateActiveContentField('title', safeText(value)) });
        this.createTextAreaControl({ host: fields, key: 'content.packs.description', label: tr('Description', 'Aciklama'), getValue: () => this.getActiveContentItem()?.description || '', getDefault: () => this.getDefaultContentValue('description'), onInput: (value) => this.updateActiveContentField('description', safeText(value)) });
        this.createNumberInputControl({ host: fields, key: 'content.packs.priceCoin', label: tr('Price Coin', 'Fiyat'), step: 1, getValue: () => this.getActiveContentItem()?.priceCoin ?? 0, getDefault: () => this.getDefaultContentValue('priceCoin'), onInput: (value) => this.updateActiveContentField('priceCoin', Math.max(0, Math.round(parseNumber(value, 0)))) });
        this.createToggleControl({ host: fields, key: 'content.packs.enabled', label: tr('Enabled', 'Etkin'), getValue: () => this.getActiveContentItem()?.enabled !== false, getDefault: () => this.getDefaultContentValue('enabled'), onInput: (value) => this.updateActiveContentField('enabled', value) });
        this.createTextAreaControl({ host: fields, key: 'content.packs.weaponIds', label: tr('Weapon Ids (comma or line)', 'Silah Kimlikleri'), getValue: () => (this.getActiveContentItem()?.weaponIds || []).join(', '), getDefault: () => '', onInput: (value) => this.updateActiveContentField('weaponIds', safeText(value).split(/[\n,]+/).map((item) => toKey(item)).filter(Boolean)) });
    }

    buildPlayerContentEditor() {
        this.previewWrapEl?.classList.add('dev-panel-preview--sticky');

        const main = this.createContentSection(tr('Player Data', 'Oyuncu Verisi'), { collapsible: true, open: true });
        const fields = this.createFieldsHost(main);
        this.createTextControl({ host: fields, key: 'content.players.id', label: tr('Player Id', 'Oyuncu Kimligi'), getValue: () => this.getActiveContentItem()?.id || '', getDefault: () => this.getDefaultContentValue('id'), onInput: (value) => this.updateActiveContentField('id', toKey(value) || rid('player')) });
        this.createTextControl({ host: fields, key: 'content.players.title', label: tr('Title', 'Baslik'), getValue: () => this.getActiveContentItem()?.title || '', getDefault: () => this.getDefaultContentValue('title'), onInput: (value) => this.updateActiveContentField('title', safeText(value)) });
        this.createTextAreaControl({ host: fields, key: 'content.players.description', label: tr('Description', 'Aciklama'), getValue: () => this.getActiveContentItem()?.description || '', getDefault: () => this.getDefaultContentValue('description'), onInput: (value) => this.updateActiveContentField('description', safeText(value)) });
        this.createToggleControl({ host: fields, key: 'content.players.enabled', label: tr('Enabled', 'Etkin'), getValue: () => this.getActiveContentItem()?.enabled !== false, getDefault: () => this.getDefaultContentValue('enabled'), onInput: (value) => this.updateActiveContentField('enabled', value) });

        const assets = this.createContentSection(tr('Player Assets', 'Oyuncu Dosyalari'), { collapsible: true, open: false });
        const assetFields = this.createFieldsHost(assets);
        this.createTextControl({ host: assetFields, key: 'content.players.iconPath', label: tr('Icon Path', 'Ikon Yolu'), getValue: () => this.getActiveContentItem()?.iconPath || '', getDefault: () => this.getDefaultContentValue('iconPath'), onInput: (value) => this.updateActiveContentField('iconPath', safeText(value).trim()) });
        this.createAssetSelect(assetFields, { key: 'content.players.iconLibrary', label: tr('Icon Library', 'Ikon Kutuphanesi'), target: 'player-icon', pathField: 'iconPath', emptyLabel: 'No icon selected' });
        this.createFileControl({ host: assetFields, key: 'content.players.iconFile', label: tr('Icon File (.png .jpg .jpeg .webp)', 'Ikon Dosyasi'), accept: '.png,.jpg,.jpeg,.webp', onInput: (file) => this.uploadActiveContentAsset('player-icon', file, 'iconPath') });
        this.createTextControl({ host: assetFields, key: 'content.players.modelPath', label: tr('Model Path', 'Model Yolu'), getValue: () => this.getActiveContentItem()?.modelPath || '', getDefault: () => this.getDefaultContentValue('modelPath'), onInput: (value) => this.updateActiveContentField('modelPath', safeText(value).trim()) });
        this.createAssetSelect(assetFields, { key: 'content.players.modelLibrary', label: tr('Model Library', 'Model Kutuphanesi'), target: 'player-model', pathField: 'modelPath', emptyLabel: 'No model selected' });
        this.createFileControl({ host: assetFields, key: 'content.players.modelFile', label: tr('Model File (.glb .gltf .fbx .obj)', 'Model Dosyasi'), accept: '.glb,.gltf,.fbx,.obj', onInput: (file) => this.uploadActiveContentAsset('player-model', file, 'modelPath') });
        this.createTextControl({ host: assetFields, key: 'content.players.animationPath', label: tr('Animation Path', 'Animasyon Yolu'), getValue: () => this.getActiveContentItem()?.animationPath || '', getDefault: () => this.getDefaultContentValue('animationPath'), onInput: (value) => this.updateActiveContentField('animationPath', safeText(value).trim()) });
        this.createAssetSelect(assetFields, { key: 'content.players.animationLibrary', label: tr('Animation Library', 'Animasyon Kutuphanesi'), target: 'player-animation', pathField: 'animationPath', emptyLabel: 'No animation selected' });
        this.createFileControl({ host: assetFields, key: 'content.players.animationFile', label: tr('Animation File (.glb .gltf .fbx)', 'Animasyon Dosyasi'), accept: '.glb,.gltf,.fbx', onInput: (file) => this.uploadActiveContentAsset('player-animation', file, 'animationPath') });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelPositionX', label: tr('Model Position X', 'Model Pozisyon X'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelPosition?.[0] ?? 0, getDefault: () => this.getDefaultContentValue('modelPosition.0'), onInput: (value) => this.updateVec3Field('modelPosition', 0, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelPositionY', label: tr('Model Position Y', 'Model Pozisyon Y'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelPosition?.[1] ?? 0, getDefault: () => this.getDefaultContentValue('modelPosition.1'), onInput: (value) => this.updateVec3Field('modelPosition', 1, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelPositionZ', label: tr('Model Position Z', 'Model Pozisyon Z'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelPosition?.[2] ?? 0, getDefault: () => this.getDefaultContentValue('modelPosition.2'), onInput: (value) => this.updateVec3Field('modelPosition', 2, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelRotationX', label: tr('Model Rotation X', 'Model Rotasyon X'), step: 1, getValue: () => this.getActiveContentItem()?.modelRotation?.[0] ?? 0, getDefault: () => this.getDefaultContentValue('modelRotation.0'), onInput: (value) => this.updateVec3Field('modelRotation', 0, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelRotationY', label: tr('Model Rotation Y', 'Model Rotasyon Y'), step: 1, getValue: () => this.getActiveContentItem()?.modelRotation?.[1] ?? 180, getDefault: () => this.getDefaultContentValue('modelRotation.1'), onInput: (value) => this.updateVec3Field('modelRotation', 1, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelRotationZ', label: tr('Model Rotation Z', 'Model Rotasyon Z'), step: 1, getValue: () => this.getActiveContentItem()?.modelRotation?.[2] ?? 0, getDefault: () => this.getDefaultContentValue('modelRotation.2'), onInput: (value) => this.updateVec3Field('modelRotation', 2, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelScaleX', label: tr('Model Scale X', 'Model Olcek X'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelScale?.[0] ?? 1, getDefault: () => this.getDefaultContentValue('modelScale.0'), onInput: (value) => this.updateVec3Field('modelScale', 0, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelScaleY', label: tr('Model Scale Y', 'Model Olcek Y'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelScale?.[1] ?? 1, getDefault: () => this.getDefaultContentValue('modelScale.1'), onInput: (value) => this.updateVec3Field('modelScale', 1, value) });
        this.createNumberInputControl({ host: assetFields, key: 'content.players.modelScaleZ', label: tr('Model Scale Z', 'Model Olcek Z'), step: 0.01, getValue: () => this.getActiveContentItem()?.modelScale?.[2] ?? 1, getDefault: () => this.getDefaultContentValue('modelScale.2'), onInput: (value) => this.updateVec3Field('modelScale', 2, value) });

        const variants = this.createContentSection(tr('Variants And Hierarchy', 'Varyantlar Ve Hiyerarsi'), { collapsible: true, open: false });
        const variantToolbar = document.createElement('div');
        variantToolbar.className = 'dev-panel-content-toolbar';
        this.playerVariantSelectEl = document.createElement('select');
        this.playerVariantSelectEl.className = 'dev-panel-select';
        this.refreshPlayerVariantSelect();
        variantToolbar.append(
            this.playerVariantSelectEl,
            this.makeActionButton('Apply Variant', () => this.applySelectedPlayerVariant()),
            this.makeActionButton('Save Current As Variant', () => this.saveCurrentPlayerVariant()),
            this.makeActionButton('Delete Variant', () => this.deleteSelectedPlayerVariant()),
        );
        variants.appendChild(variantToolbar);
        this.meshTreeHostEl = document.createElement('div');
        this.meshTreeHostEl.className = 'dev-panel-mesh-tree';
        variants.appendChild(this.meshTreeHostEl);
        this.renderPlayerMeshTree();
    }

    buildPlaceholderContentEditor() {
        const main = this.createContentSection(tr('Entity Data', 'Varlik Verisi'));
        const fields = this.createFieldsHost(main);
        this.createTextControl({ host: fields, key: `content.${this.activeContentType}.id`, label: tr('Entity Id', 'Varlik Kimligi'), getValue: () => this.getActiveContentItem()?.id || '', getDefault: () => this.getDefaultContentValue('id'), onInput: (value) => this.updateActiveContentField('id', toKey(value) || rid('entity')) });
        this.createTextControl({ host: fields, key: `content.${this.activeContentType}.title`, label: tr('Title', 'Baslik'), getValue: () => this.getActiveContentItem()?.title || '', getDefault: () => this.getDefaultContentValue('title'), onInput: (value) => this.updateActiveContentField('title', safeText(value)) });
        this.createTextAreaControl({ host: fields, key: `content.${this.activeContentType}.description`, label: tr('Description', 'Aciklama'), getValue: () => this.getActiveContentItem()?.description || '', getDefault: () => this.getDefaultContentValue('description'), onInput: (value) => this.updateActiveContentField('description', safeText(value)) });
        this.createToggleControl({ host: fields, key: `content.${this.activeContentType}.enabled`, label: tr('Enabled', 'Etkin'), getValue: () => this.getActiveContentItem()?.enabled !== false, getDefault: () => this.getDefaultContentValue('enabled'), onInput: (value) => this.updateActiveContentField('enabled', value) });
    }

    buildDebugControls() {
        const section = this.createSection('debug', tr('Debug Tools', 'Debug Araclari'), true);
        const fields = this.createFieldsHost(section);
        this.createToggleControl({
            host: fields,
            key: 'debug.freeCamera',
            label: tr('Free Camera', 'Serbest Kamera'),
            getValue: () => this.freeCameraActive,
            getDefault: () => false,
            onInput: (value) => this.setFreeCameraEnabled(value),
        });
        this.createToggleControl({
            host: fields,
            key: 'debug.showColliders',
            label: tr('Show Colliders', 'Colliderlari Goster'),
            getValue: () => this.showColliderDebug,
            getDefault: () => false,
            onInput: (value) => this.setColliderDebugVisible(value),
        });
        this.createToggleControl({
            host: fields,
            key: 'debug.showCollisionMeshes',
            label: tr('Show Collision Meshes', 'Carpisma Meshlerini Goster'),
            getValue: () => this.showCollisionMeshDebug,
            getDefault: () => false,
            onInput: (value) => this.setCollisionMeshDebugVisible(value),
        });
        const hint = document.createElement('div');
        hint.className = 'dev-panel-hint';
        hint.textContent = 'Free Camera uses mouse look with WASD flight and Q E vertical movement. Collision toggles help inspect snagging spots.';
        section.appendChild(hint);
    }

    createSection(category, title, wide = false) {
        const section = document.createElement('section');
        section.className = `dev-panel-section${wide ? ' dev-panel-section--wide' : ''}`;
        section.dataset.category = category;
        const heading = document.createElement('h3');
        heading.textContent = title;
        section.appendChild(heading);
        if (!this.sectionMap.has(category)) this.sectionMap.set(category, []);
        this.sectionMap.get(category).push(section);
        this.gridEl.appendChild(section);
        return section;
    }

    createContentSection(title, options = {}) {
        const section = document.createElement('section');
        const isCollapsible = options.collapsible === true;
        section.className = `dev-panel-section dev-panel-section--wide${isCollapsible ? ' dev-panel-accordion' : ''}`;
        if (isCollapsible) {
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = `dev-panel-accordion-trigger${options.open !== false ? ' is-open' : ''}`;
            trigger.textContent = title;
            const body = document.createElement('div');
            body.className = `dev-panel-accordion-body${options.open !== false ? ' is-open' : ''}`;
            trigger.addEventListener('click', () => {
                const nextOpen = !body.classList.contains('is-open');
                body.classList.toggle('is-open', nextOpen);
                trigger.classList.toggle('is-open', nextOpen);
            });
            section.append(trigger, body);
            this.contentEditorHostEl.appendChild(section);
            return body;
        }
        const heading = document.createElement('h3');
        heading.textContent = title;
        section.appendChild(heading);
        this.contentEditorHostEl.appendChild(section);
        return section;
    }

    createFieldsHost(section) {
        const fields = document.createElement('div');
        fields.className = 'dev-panel-fields';
        section.appendChild(fields);
        return fields;
    }

    createFieldRow(host, labelText, defaultGetter = null) {
        const field = document.createElement('div');
        field.className = 'dev-panel-field';
        const label = document.createElement('div');
        label.className = 'dev-panel-field-label';
        label.textContent = labelText;
        field.appendChild(label);
        const inputRow = document.createElement('div');
        inputRow.className = 'dev-panel-field-input';
        field.appendChild(inputRow);
        let defaultEl = null;
        if (defaultGetter) {
            defaultEl = document.createElement('div');
            defaultEl.className = 'dev-panel-field-default';
            field.appendChild(defaultEl);
        }
        host.appendChild(field);
        return { field, inputRow, defaultEl };
    }

    createBinding(key, spec) {
        this.controlMap.set(key, spec);
    }

    createNumberControl({ host, key, label, min, max, step, getValue, getDefault, onInput }) {
        const { inputRow, defaultEl } = this.createFieldRow(host, label, getDefault);
        const input = document.createElement('input');
        input.type = 'range';
        input.min = `${min}`;
        input.max = `${max}`;
        input.step = `${step}`;
        input.addEventListener('input', () => onInput(parseNumber(input.value, getValue() ?? 0)));
        const valueEl = document.createElement('div');
        valueEl.className = 'dev-panel-field-value';
        inputRow.append(input, valueEl);
        this.createBinding(key, { input, valueEl, defaultEl, getValue, getDefault, kind: 'number' });
    }

    createNumberInputControl({ host, key, label, step = 1, getValue, getDefault, onInput }) {
        const { inputRow, defaultEl } = this.createFieldRow(host, label, getDefault);
        const input = document.createElement('input');
        input.type = 'number';
        input.step = `${step}`;
        input.className = 'dev-panel-text-input';
        input.addEventListener('input', () => onInput(input.value));
        inputRow.appendChild(input);
        this.createBinding(key, { input, defaultEl, getValue, getDefault, kind: 'textish' });
    }

    createTextControl({ host, key, label, getValue, getDefault, onInput }) {
        const { inputRow, defaultEl } = this.createFieldRow(host, label, getDefault);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'dev-panel-text-input';
        input.addEventListener('input', () => onInput(input.value));
        inputRow.appendChild(input);
        this.createBinding(key, { input, defaultEl, getValue, getDefault, kind: 'textish' });
    }

    createTextAreaControl({ host, key, label, getValue, getDefault, onInput }) {
        const { field, defaultEl } = this.createFieldRow(host, label, getDefault);
        const input = document.createElement('textarea');
        input.className = 'dev-panel-textarea';
        input.addEventListener('input', () => onInput(input.value));
        field.appendChild(input);
        this.createBinding(key, { input, defaultEl, getValue, getDefault, kind: 'textarea' });
    }

    createSelectControl({ host, key, label, options, getValue, getDefault, onInput }) {
        const { inputRow, defaultEl } = this.createFieldRow(host, label, getDefault);
        const input = document.createElement('select');
        input.className = 'dev-panel-select';
        options.forEach(([value, en, local]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = tr(en, local);
            input.appendChild(option);
        });
        input.addEventListener('change', () => onInput(input.value));
        inputRow.appendChild(input);
        this.createBinding(key, { input, defaultEl, getValue, getDefault, kind: 'textish' });
    }

    createToggleControl({ host, key, label, getValue, getDefault, onInput }) {
        const { inputRow, defaultEl } = this.createFieldRow(host, label, getDefault);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'dev-panel-checkbox';
        input.addEventListener('change', () => onInput(!!input.checked));
        inputRow.appendChild(input);
        this.createBinding(key, { input, defaultEl, getValue, getDefault, kind: 'checkbox' });
    }

    createFileControl({ host, key, label, accept, onInput }) {
        const { inputRow } = this.createFieldRow(host, label, () => '');
        const wrap = document.createElement('div');
        wrap.className = 'dev-panel-file-wrap';
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.className = 'dev-panel-file-input';
        const nameEl = document.createElement('div');
        nameEl.className = 'dev-panel-file-name';
        nameEl.textContent = 'No file selected.';
        input.addEventListener('click', () => { input.value = ''; nameEl.textContent = 'No file selected.'; });
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) { nameEl.textContent = 'No file selected.'; return; }
            nameEl.textContent = file.name;
            onInput(file);
        });
        wrap.append(input, nameEl);
        inputRow.appendChild(wrap);
        this.createBinding(key, { input, nameEl, kind: 'file' });
    }

    createAssetSelect(host, { key, label, target, pathField, emptyLabel = 'No asset selected' }) {
        const { inputRow, defaultEl } = this.createFieldRow(host, label, () => '');
        const input = document.createElement('select');
        input.className = 'dev-panel-select';
        const currentPath = safeText(this.getActiveContentItem()?.[pathField] || '');
        const assets = this.assetOptions[target] || [];
        const placeholders = [{ value: '', label: emptyLabel }];
        const options = [...placeholders];
        assets.forEach((asset) => {
            options.push({ value: asset.publicPath, label: `${asset.fileName} -> ${asset.publicPath}` });
        });
        if (currentPath && !options.find((entry) => entry.value === currentPath)) options.push({ value: currentPath, label: `Current -> ${currentPath}` });
        options.forEach((entry) => {
            const option = document.createElement('option');
            option.value = entry.value;
            option.textContent = entry.label;
            input.appendChild(option);
        });
        input.value = currentPath;
        input.addEventListener('change', () => this.updateActiveContentField(pathField, input.value));
        inputRow.appendChild(input);
        this.createBinding(key, { input, defaultEl, getValue: () => this.getActiveContentItem()?.[pathField] || '', getDefault: () => '', kind: 'textish' });
    }

    createWeaponAssetSelect(host, options) {
        this.createAssetSelect(host, {
            ...options,
            emptyLabel: options.target === 'weapon-icon' ? 'No icon selected' : 'No model selected',
        });
    }

    makeActionButton(label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', onClick);
        return button;
    }

    syncFromState() {
        this.controlMap.forEach((binding, key) => {
            if (binding.kind === 'file') return;
            const value = binding.getValue ? binding.getValue() : '';
            const def = binding.getDefault ? binding.getDefault() : '';
            if (binding.kind === 'checkbox') binding.input.checked = !!value;
            else binding.input.value = safeText(value);
            if (binding.valueEl) binding.valueEl.textContent = withDef(value, def);
            if (binding.defaultEl) binding.defaultEl.textContent = `Default: ${fmt(def)}`;
        });
        if (this.adminKey && this.controlMap.get('content.adminKey')) this.controlMap.get('content.adminKey').input.value = this.adminKey;
        this.refreshBotSelect();
        this.refreshWeaponSelect();
        this.refreshContentSelect();
        this.refreshContentPreview(this.getActiveContentItem());
    }

    refreshWeaponSelect() {
        if (!this.weaponSelectEl) return;
        const prev = this.activeWeaponId;
        this.weaponSelectEl.innerHTML = '';
        WEAPON_CATALOG.forEach((entry) => {
            const option = document.createElement('option');
            option.value = entry.weaponId;
            option.textContent = `${entry.displayName} [${entry.weaponId}]`;
            this.weaponSelectEl.appendChild(option);
        });
        this.ensureActiveWeapon();
        this.weaponSelectEl.value = this.activeWeaponId || prev;
    }

    refreshBotSelect() {
        if (!this.botSelectEl) return;
        const prev = this.activeBotId;
        this.botSelectEl.innerHTML = '';
        getRuntimeBotIds().forEach((botId) => {
            const option = document.createElement('option');
            const meta = BOT_META[botId] || [botId.toUpperCase(), botId];
            option.value = botId;
            option.textContent = `${meta[0]} [${meta[1]}]`;
            this.botSelectEl.appendChild(option);
        });
        this.ensureActiveBot();
        this.botSelectEl.value = this.activeBotId || prev;
    }

    refreshContentSelect() {
        if (!this.contentTypeSelectEl || !this.contentSelectEl) return;
        this.contentTypeSelectEl.value = this.activeContentType;
        const collection = this.getContentCollection();
        this.contentSelectEl.innerHTML = '';
        collection.forEach((item) => {
            const option = document.createElement('option');
            option.value = this.getContentId(item);
            option.textContent = this.getContentLabel(item);
            this.contentSelectEl.appendChild(option);
        });
        this.ensureActiveContentItem();
        this.contentSelectEl.value = this.activeContentId || '';
    }

    refreshSectionVisibility() {
        this.sectionMap.forEach((nodes, category) => {
            nodes.forEach((node) => { node.style.display = category === this.activeCategory ? '' : 'none'; });
        });
    }

    refreshStatus(message = '') {
        if (!this.statusEl) return;
        const runtimeDirty = !compare(this.currentState || getRuntimeTuningSaved(), getRuntimeTuningSaved());
        const contentDirty = !compare(this.currentContentState || getContentStudioSaved(), getContentStudioSaved());
        const busy = this.backendBusy ? ' | backend busy' : '';
        const text = message || (runtimeDirty || contentDirty ? `Unsaved changes${busy}` : `Saved${busy}`);
        this.statusEl.textContent = text;
        this.statusEl.classList.toggle('is-saved', !runtimeDirty && !contentDirty && !this.backendBusy);
    }

    setFreeCameraEnabled(visible) {
        const nextActive = !!visible;
        if (this.freeCameraActive === nextActive) return;
        const camera = GameContext.Cameras.PlayerCamera;
        if (nextActive) {
            this.freeCameraSavedPose = {
                position: camera.position.clone(),
                rotation: camera.rotation.clone(),
            };
            camera.rotation.order = 'YXZ';
            this.freeCameraPitch = camera.rotation.x;
            this.freeCameraYaw = camera.rotation.y;
            this.freeCameraKeys.clear();
            this.freeCameraActive = setDebugFreeCameraActive(true);
            if (this.visible) this.setVisible(false);
            setTimeout(() => GameContext.PointLock.lock(), 0);
        } else {
            this.freeCameraActive = setDebugFreeCameraActive(false);
            this.freeCameraKeys.clear();
            if (this.freeCameraSavedPose) {
                camera.position.copy(this.freeCameraSavedPose.position);
                camera.rotation.order = 'YXZ';
                camera.rotation.copy(this.freeCameraSavedPose.rotation);
            }
            this.freeCameraSavedPose = null;
        }
        this.syncFromState();
    }

    setColliderDebugVisible(visible) {
        this.showColliderDebug = !!visible;
        this.refreshDebugVisuals();
        this.syncFromState();
    }

    setCollisionMeshDebugVisible(visible) {
        this.showCollisionMeshDebug = !!visible;
        this.refreshDebugVisuals();
        this.syncFromState();
    }

    refreshDebugVisuals() {
        if (this.showColliderDebug || this.showCollisionMeshDebug) this.buildColliderDebug();
        else this.clearColliderDebug();
    }

    buildColliderDebug() {
        this.clearColliderDebug();
        this.colliderDebugRoot = new THREE.Group();
        this.colliderDebugRoot.name = 'DevColliderDebugRoot';
        GameContext.Scenes.Level.add(this.colliderDebugRoot);

        if (this.showCollisionMeshDebug) {
            const levelMeshes = [];
            const seen = new Set();
            [GameContext.Scenes.Collision, GameContext.Scenes.Level].forEach((scene) => {
                scene.traverse((child) => {
                    if (!child?.isMesh) return;
                    if (child.parent === this.colliderDebugRoot) return;
                    if (child.name === 'DevColliderDebugRoot') return;
                    if (seen.has(child.uuid)) return;
                    if (scene === GameContext.Scenes.Level && child.userData?.MapSafetyFloor) return;
                    seen.add(child.uuid);
                    levelMeshes.push(child);
                });
            });

            levelMeshes.forEach((mesh) => {
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(mesh.geometry, 20),
                    new THREE.LineBasicMaterial({
                        color: 0x7dd3fc,
                        transparent: true,
                        opacity: 0.72,
                        depthTest: false,
                    }),
                );
                edges.matrixAutoUpdate = false;
                edges.renderOrder = 998;
                this.colliderDebugRoot.add(edges);
                this.colliderDebugEntries.push({ kind: 'collision', target: mesh, helper: edges });
            });
        }

        if (this.showColliderDebug) {
            const snapshot = EnemyBotSystem.getInstance().getDebugColliderSnapshot();
            if (snapshot.player) this.colliderDebugEntries.push(this.createCapsuleDebugEntry('player', 0x4ade80));
            snapshot.bots.forEach((bot) => {
                this.colliderDebugEntries.push(this.createCapsuleDebugEntry(bot.isTestDummy ? `dummy:${bot.id}` : `bot:${bot.id}`, bot.isTestDummy ? 0xfbbf24 : 0xfb7185));
            });
        }
        this.updateColliderDebug();
    }

    createCapsuleDebugEntry(id, color) {
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), material);
        line.renderOrder = 1000;
        const start = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9, depthTest: false }));
        const end = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9, depthTest: false }));
        start.renderOrder = 1000;
        end.renderOrder = 1000;
        this.colliderDebugRoot.add(line, start, end);
        return { kind: 'capsule', id, helper: { line, start, end } };
    }

    updateColliderDebug() {
        if ((!this.showColliderDebug && !this.showCollisionMeshDebug) || !this.colliderDebugRoot) return;
        const snapshot = EnemyBotSystem.getInstance().getDebugColliderSnapshot();
        const capsuleMap = new Map();
        if (snapshot.player) capsuleMap.set('player', snapshot.player);
        snapshot.bots.forEach((bot) => {
            capsuleMap.set(bot.isTestDummy ? `dummy:${bot.id}` : `bot:${bot.id}`, bot);
        });

        this.colliderDebugEntries.forEach((entry) => {
            if (entry.kind === 'collision') {
                if (!entry.target?.parent) entry.helper.visible = false;
                else {
                    entry.helper.visible = this.showCollisionMeshDebug;
                    entry.helper.matrix.copy(entry.target.matrixWorld);
                    entry.helper.matrixWorld.copy(entry.target.matrixWorld);
                }
                return;
            }
            const data = capsuleMap.get(entry.id);
            if (!data) {
                entry.helper.line.visible = false;
                entry.helper.start.visible = false;
                entry.helper.end.visible = false;
                return;
            }
            entry.helper.line.visible = true;
            entry.helper.start.visible = true;
            entry.helper.end.visible = true;
            entry.helper.line.geometry.setFromPoints([data.start, data.end]);
            entry.helper.start.position.copy(data.start);
            entry.helper.end.position.copy(data.end);
            entry.helper.start.scale.setScalar(Math.max(0.05, data.radius));
            entry.helper.end.scale.setScalar(Math.max(0.05, data.radius));
        });
    }

    clearColliderDebug() {
        if (this.colliderDebugRoot?.parent) this.colliderDebugRoot.parent.remove(this.colliderDebugRoot);
        this.colliderDebugEntries.forEach((entry) => {
            if (entry.kind === 'collision') {
                entry.helper.geometry?.dispose?.();
                entry.helper.material?.dispose?.();
            }
            if (entry.kind === 'capsule') {
                entry.helper.line.geometry?.dispose?.();
                entry.helper.line.material?.dispose?.();
                entry.helper.start.geometry?.dispose?.();
                entry.helper.start.material?.dispose?.();
                entry.helper.end.geometry?.dispose?.();
                entry.helper.end.material?.dispose?.();
            }
        });
        this.colliderDebugEntries = [];
        this.colliderDebugRoot = null;
    }

    setVisible(nextVisible) {
        if (this.visible === nextVisible) return;
        this.visible = nextVisible;
        this.root.classList.toggle('hidden', !nextVisible);
        if (nextVisible) {
            this.wasLockedBeforeOpen = !!GameContext.PointLock.isLocked;
            if (this.wasLockedBeforeOpen) GameContext.PointLock.unlock();
            this.updatePreviewSize();
        } else if (this.wasLockedBeforeOpen) {
            GameContext.PointLock.lock();
            this.wasLockedBeforeOpen = false;
        }
        window.dispatchEvent(new CustomEvent('game:dev-panel-visibility', { detail: { open: nextVisible } }));
    }

    onKeyDown(event) {
        if (event.code !== 'F10') return;
        event.preventDefault();
        event.stopPropagation();
        this.setVisible(!this.visible);
    }

    onDocKeyDown(event) {
        if (!this.freeCameraActive || event.repeat) return;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
            this.freeCameraKeys.add(event.code);
        }
    }

    onDocKeyUp(event) {
        if (!this.freeCameraActive) return;
        this.freeCameraKeys.delete(event.code);
    }

    updateFreeCamera(deltaTime) {
        const camera = GameContext.Cameras.PlayerCamera;
        camera.rotation.order = 'YXZ';
        camera.rotation.set(this.freeCameraPitch, this.freeCameraYaw, 0);

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        forward.normalize();
        const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
        const move = new THREE.Vector3();
        if (this.freeCameraKeys.has('KeyW')) move.add(forward);
        if (this.freeCameraKeys.has('KeyS')) move.addScaledVector(forward, -1);
        if (this.freeCameraKeys.has('KeyD')) move.add(right);
        if (this.freeCameraKeys.has('KeyA')) move.addScaledVector(right, -1);
        if (this.freeCameraKeys.has('KeyE')) move.y += 1;
        if (this.freeCameraKeys.has('KeyQ')) move.y -= 1;
        if (move.lengthSq() <= 0.0001) return;
        move.normalize();
        const speed = this.freeCameraSpeed * (this.freeCameraKeys.has('ShiftLeft') || this.freeCameraKeys.has('ShiftRight') ? this.freeCameraBoost : 1);
        camera.position.addScaledVector(move, speed * Math.max(0.001, deltaTime));
    }

    onWindowResize() {
        this.updatePreviewSize();
    }

    ensureActiveWeapon() {
        const ids = WEAPON_CATALOG.map((entry) => entry.weaponId);
        if (!ids.includes(this.activeWeaponId)) this.activeWeaponId = ids[0] || 'ak47';
    }

    ensureActiveBot() {
        const ids = getRuntimeBotIds();
        if (!ids.includes(this.activeBotId)) this.activeBotId = ids[0] || 'ct_1';
    }

    ensureActiveContentItem(forceReset = false) {
        const collection = this.getContentCollection();
        if (!collection.length) { this.activeContentId = ''; return; }
        const ids = collection.map((item) => this.getContentId(item));
        if (forceReset || !ids.includes(this.activeContentId)) this.activeContentId = ids[0];
    }

    getContentCollection() {
        if (!this.currentContentState) return [];
        return Array.isArray(this.currentContentState[this.activeContentType]) ? this.currentContentState[this.activeContentType] : [];
    }

    getContentId(item) {
        if (!item) return '';
        return safeText(item.weaponId || item.id);
    }

    getContentLabel(item) {
        const id = this.getContentId(item);
        const title = safeText(item.displayName || item.title || id);
        return `${title} [${id}]`;
    }

    getActiveContentItem() {
        return this.getContentCollection().find((item) => this.getContentId(item) === this.activeContentId) || null;
    }

    getDefaultContentItem() {
        const collection = Array.isArray(this.contentDefaults?.[this.activeContentType]) ? this.contentDefaults[this.activeContentType] : [];
        return collection.find((item) => this.getContentId(item) === this.activeContentId) || collection[0] || null;
    }

    getDefaultContentValue(path) {
        const item = this.getDefaultContentItem();
        return getByPath(item, path);
    }

    updateActiveContentField(path, value) {
        const targetId = this.activeContentId;
        updateContentStudio((draft) => {
            const collection = Array.isArray(draft[this.activeContentType]) ? draft[this.activeContentType] : [];
            const index = collection.findIndex((entry) => this.getContentId(entry) === targetId);
            if (index < 0) return;
            setByPath(collection[index], path, value);
            if (path === 'weaponId' || path === 'id') this.activeContentId = this.getContentId(collection[index]);
        });
        const refreshSelect = path === 'weaponId' || path === 'id' || path === 'displayName' || path === 'title';
        const rebuildEditor = path === 'weaponId' || path === 'id' || path === 'variantPresets';
        const refreshPreview = rebuildEditor || path === 'iconPath' || path === 'modelPath' || path === 'animationPath' || path === 'modelPosition' || path === 'modelRotation' || path === 'modelScale' || path === 'meshVisibility' || path === 'activeVariantId' || path === 'displayName' || path === 'title' || path === 'description' || path === 'priceCoin' || path === 'slot' || path === 'rarity' || path === 'enabled';
        if (this.activeContentType === 'weapons') {
            if (path === 'weaponId') {
                this.assetListEntityId = '';
                this.assetOptions = { ...this.assetOptions, 'weapon-icon': [], 'weapon-model': [] };
                this.loadAssetOptionsForActiveEntity(true);
            }
            this.refreshWeaponSelect();
        }
        if (this.activeContentType === 'players' && path === 'id') {
            this.assetListEntityId = '';
            this.assetOptions = { ...this.assetOptions, 'player-icon': [], 'player-model': [], 'player-animation': [] };
            this.loadAssetOptionsForActiveEntity(true);
        }
        if (refreshSelect) this.refreshContentSelect();
        if (rebuildEditor) this.refreshContentEditor();
        else if (refreshPreview) this.refreshContentPreview(this.getActiveContentItem());
    }

    updateVec3Field(path, index, value) {
        const current = Array.isArray(this.getActiveContentItem()?.[path]) ? [...this.getActiveContentItem()[path]] : [0, 0, 0];
        current[index] = parseNumber(value, index === 1 && path === 'modelRotation' ? 180 : (path === 'modelScale' ? 1 : 0));
        this.updateActiveContentField(path, current);
    }

    createContentTemplate() {
        const defaults = this.contentDefaults?.[this.activeContentType];
        const seed = Array.isArray(defaults) && defaults[0] ? clone(defaults[0]) : {};
        if (this.activeContentType === 'weapons') {
            seed.weaponId = rid('weapon');
            seed.displayName = 'New Weapon';
            seed.description = 'Custom weapon profile.';
            seed.iconPath = '';
            seed.modelPath = '';
            seed.enabled = true;
        } else if (this.activeContentType === 'players') {
            seed.id = rid('player');
            seed.title = 'New Operator';
            seed.description = '';
            seed.iconPath = '';
            seed.modelPath = '';
            seed.animationPath = '';
            seed.modelPosition = [0, 0, 0];
            seed.modelRotation = [0, 180, 0];
            seed.modelScale = [1, 1, 1];
            seed.meshVisibility = {};
            seed.variantPresets = [];
            seed.activeVariantId = '';
            seed.enabled = true;
        } else {
            seed.id = rid(this.activeContentType.slice(0, -1) || 'item');
            seed.title = 'New Content';
            seed.description = '';
            seed.enabled = true;
        }
        return seed;
    }

    getActiveContentEntityId() {
        const item = this.getActiveContentItem();
        return toKey(item?.weaponId || item?.id);
    }

    getAssetTargetsForActiveType() {
        if (this.activeContentType === 'weapons') return ['weapon-icon', 'weapon-model'];
        if (this.activeContentType === 'players') return PLAYER_ASSET_TARGETS;
        return [];
    }

    async loadAssetOptionsForActiveEntity(force = false) {
        const entityId = this.getActiveContentEntityId();
        const targets = this.getAssetTargetsForActiveType();
        if (!entityId || !targets.length || !this.adminKey) return;
        const hasCache = targets.some((target) => (this.assetOptions[target] || []).length);
        if (!force && this.assetListEntityId === `${this.activeContentType}:${entityId}` && hasCache) return;
        const requestId = ++this.assetListRequestId;
        try {
            const responses = await Promise.all(targets.map((target) => backendApi.listLiveopsAssets(this.adminKey, { target, entityId })));
            if (requestId !== this.assetListRequestId) return;
            this.assetListEntityId = `${this.activeContentType}:${entityId}`;
            const next = { ...this.assetOptions };
            targets.forEach((target, index) => {
                next[target] = responses[index]?.assets || [];
            });
            this.assetOptions = next;
            if (this.getActiveContentEntityId() === entityId) this.refreshContentEditor();
        } catch {
            if (requestId !== this.assetListRequestId) return;
            const next = { ...this.assetOptions };
            targets.forEach((target) => { next[target] = []; });
            this.assetOptions = next;
        }
    }

    async loadWeaponAssetOptions(force = false) {
        await this.loadAssetOptionsForActiveEntity(force);
    }

    addContentEntity() {
        const item = this.createContentTemplate();
        updateContentStudio((draft) => { draft[this.activeContentType].push(item); });
        this.activeContentId = this.getContentId(item);
        this.refreshContentEditor();
        this.loadAssetOptionsForActiveEntity(true);
        this.refreshStatus('Content entity added.');
    }

    duplicateContentEntity() {
        const current = this.getActiveContentItem();
        if (!current) return;
        const next = clone(current);
        if (this.activeContentType === 'weapons') {
            next.weaponId = rid(next.weaponId || 'weapon');
            next.displayName = `${next.displayName || 'Weapon'} Copy`;
        } else {
            next.id = rid(next.id || 'item');
            next.title = `${next.title || 'Content'} Copy`;
        }
        updateContentStudio((draft) => { draft[this.activeContentType].push(next); });
        this.activeContentId = this.getContentId(next);
        this.refreshContentEditor();
        this.loadAssetOptionsForActiveEntity(true);
        this.refreshStatus('Content entity duplicated.');
    }

    deleteContentEntity() {
        const currentId = this.activeContentId;
        if (!currentId) return;
        updateContentStudio((draft) => {
            draft[this.activeContentType] = draft[this.activeContentType].filter((item) => this.getContentId(item) !== currentId);
        });
        this.ensureActiveContentItem(true);
        this.refreshContentEditor();
        this.refreshStatus('Content entity deleted.');
    }

    async loadBackendContent() {
        if (!this.adminKey) { this.refreshStatus('Admin key required before backend load.'); return; }
        this.backendBusy = true;
        this.refreshStatus('Loading backend content...');
        try {
            await loadContentStudioFromBackend(this.adminKey);
            await this.loadAssetOptionsForActiveEntity(true);
            this.refreshStatus('Backend content loaded.');
        } catch (error) {
            this.refreshStatus(`Backend Load Failed (${error?.message || 'Unknown error'})`);
        } finally {
            this.backendBusy = false;
        }
    }

    async saveBackendContent() {
        if (!this.adminKey) { this.refreshStatus('Admin key required before backend save.'); return; }
        this.backendBusy = true;
        this.refreshStatus('Saving backend content...');
        try {
            await saveContentStudioToBackend(this.adminKey);
            this.refreshStatus('Backend Saved (Backend Kaydedildi)');
        } catch (error) {
            this.refreshStatus(`Backend Save Failed (${error?.message || 'Unknown error'})`);
        } finally {
            this.backendBusy = false;
        }
    }

    async uploadWeaponAsset(target, file) {
        await this.uploadActiveContentAsset(target, file, target === 'weapon-icon' ? 'iconPath' : 'modelPath');
    }

    async uploadActiveContentAsset(target, file, pathField) {
        const item = this.getActiveContentItem();
        if (!item) return;
        if (!this.adminKey) { this.refreshStatus('Admin key required before upload.'); return; }
        this.backendBusy = true;
        this.refreshStatus(`Uploading ${file?.name || 'asset'}...`);
        try {
            const publicPath = await uploadContentStudioAsset(this.adminKey, { target, entityId: this.getActiveContentEntityId(), file });
            this.updateActiveContentField(pathField, publicPath);
            await this.loadAssetOptionsForActiveEntity(true);
            this.refreshStatus(`Upload complete: ${publicPath}`);
        } catch (error) {
            this.refreshStatus(`Upload Failed (${error?.message || 'Unknown error'})`);
        } finally {
            this.backendBusy = false;
        }
    }

    spawnSelectedWeapon() {
        const item = this.getActiveContentItem();
        const weaponId = toKey(item?.weaponId);
        if (!weaponId || this.activeContentType !== 'weapons') {
            this.refreshStatus('Select a weapon before spawn.');
            return;
        }
        const spawned = EnemyBotSystem.getInstance().spawnDebugDroppedWeapon(weaponId);
        this.refreshStatus(spawned ? `${weaponId.toUpperCase()} spawned 1m ahead.` : 'Weapon spawn failed.');
    }

    refreshContentPreview(item) {
        if (!this.previewMetaEl || !this.previewArtEl || !this.previewIconImgEl || !this.previewViewportShellEl || !this.previewCaptionEl) return;
        if (!item) {
            this.previewMetaEl.innerHTML = '<strong>No selection</strong><span>Select an entity to preview.</span>';
            this.previewIconImgEl.classList.add('hidden');
            this.previewViewportShellEl.classList.add('hidden');
            this.previewCaptionEl.textContent = '3D preview ready for .glb .gltf .fbx .obj';
            if (this.previewAnimSelectEl) this.previewAnimSelectEl.classList.add('hidden');
            this.loadPreviewModel('');
            this.renderPlayerMeshTree();
            return;
        }
        const title = safeText(item.displayName || item.title || this.getContentId(item));
        const id = this.getContentId(item);
        const description = safeText(item.description || 'No description.');
        const meta = this.activeContentType === 'weapons'
            ? [`ID: ${id}`, `Slot: ${safeText(item.slot)}`, `Rarity: ${safeText(item.rarity || 'milspec')}`, `Price: ${fmt(item.priceCoin ?? 0)}`, `Icon: ${safeText(item.iconPath || 'none')}`, `Model: ${safeText(item.modelPath || 'none')}`]
            : this.activeContentType === 'players'
                ? [`ID: ${id}`, `Icon: ${safeText(item.iconPath || 'none')}`, `Model: ${safeText(item.modelPath || 'none')}`, `Animation: ${safeText(item.animationPath || 'none')}`, `Variants: ${Array.isArray(item.variantPresets) ? item.variantPresets.length : 0}`]
            : [`ID: ${id}`, `Enabled: ${item.enabled !== false ? 'true' : 'false'}`];
        this.previewMetaEl.innerHTML = `<strong>${title}</strong><span>${description}</span>${meta.map((line) => `<span>${line}</span>`).join('')}`;
        const iconPath = safeText(item.iconPath);
        if (iconPath) { this.previewIconImgEl.src = iconPath; this.previewIconImgEl.classList.remove('hidden'); } else { this.previewIconImgEl.removeAttribute('src'); this.previewIconImgEl.classList.add('hidden'); }
        const modelPath = (this.activeContentType === 'weapons' || this.activeContentType === 'players') ? safeText(item.modelPath) : '';
        if (modelPath) { this.previewViewportShellEl.classList.remove('hidden'); this.previewCaptionEl.textContent = `3D Preview: ${modelPath}`; } else { this.previewViewportShellEl.classList.add('hidden'); this.previewCaptionEl.textContent = '3D preview ready for .glb .gltf .fbx .obj'; }
        this.loadPreviewModel(modelPath, this.activeContentType === 'players' ? safeText(item.animationPath) : '');
        this.refreshPlayerVariantSelect();
    }

    ensurePreviewRenderer() {
        if (this.previewRenderer || !this.previewViewportEl) return;
        this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.previewRenderer.setClearColor(0x0d1014, 0);
        this.previewViewportEl.appendChild(this.previewRenderer.domElement);
        this.previewScene = new THREE.Scene();
        this.previewCamera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
        this.previewCamera.position.set(0, 0.8, 3.2);
        this.previewPivot = new THREE.Group();
        this.previewScene.add(this.previewPivot);
        this.previewScene.add(new THREE.AmbientLight(0xffffff, 1.2));
        this.previewScene.add(new THREE.HemisphereLight(0xcfe5ff, 0x2b1f14, 1.4));
        const dir = new THREE.DirectionalLight(0xffffff, 1.8);
        dir.position.set(2.6, 4.2, 3.4);
        this.previewScene.add(dir);
        const rim = new THREE.DirectionalLight(0x7cbcff, 0.8);
        rim.position.set(-3, 1.8, -2);
        this.previewScene.add(rim);
        this.updatePreviewSize();
    }

    updatePreviewSize() {
        if (!this.previewRenderer || !this.previewViewportEl || !this.previewCamera) return;
        const width = Math.max(1, Math.floor(this.previewViewportEl.clientWidth || 320));
        const height = Math.max(1, Math.floor(this.previewViewportEl.clientHeight || 220));
        if (width === this.previewSize.w && height === this.previewSize.h) return;
        this.previewSize = { w: width, h: height };
        this.previewRenderer.setSize(width, height, false);
        this.previewCamera.aspect = width / height;
        this.previewCamera.updateProjectionMatrix();
    }

    clearPreviewModel() {
        if (!this.previewPivot) return;
        if (this.previewModel) this.previewPivot.remove(this.previewModel);
        this.previewModel = null;
        this.previewMixer = null;
        this.previewAnimations = [];
        this.previewAnimationClipIndex = 0;
        this.previewMeshMap = new Map();
        this.currentPreviewPath = '';
        this.previewPivot.rotation.set(0, 0, 0);
        this.refreshPreviewAnimationControls();
    }

    normalizePreviewObject(object) {
        const item = this.getActiveContentItem();
        this.previewMeshMap = new Map();
        object.traverse((child) => {
            if (!child?.isMesh) return;
            child.visible = true;
            child.frustumCulled = false;
             const meshKey = this.getPreviewNodeKey(child);
            this.previewMeshMap.set(meshKey, child);
            if (this.activeContentType === 'players') {
                const meshVisibility = item?.meshVisibility || {};
                if (Object.prototype.hasOwnProperty.call(meshVisibility, meshKey)) child.visible = meshVisibility[meshKey] !== false;
            }
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.filter(Boolean).forEach((material) => {
                if ('transparent' in material && material.transparent && material.opacity === 0) material.opacity = 1;
                if ('side' in material) material.side = THREE.DoubleSide;
                if ('needsUpdate' in material) material.needsUpdate = true;
            });
        });
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z, 0.001);
        object.position.sub(center);
        object.scale.multiplyScalar(1.75 / maxSize);
        let fittedBox = new THREE.Box3().setFromObject(object);
        let fittedCenter = fittedBox.getCenter(new THREE.Vector3());
        object.position.sub(fittedCenter);
        object.position.y -= fittedBox.min.y;
        const modelScale = Array.isArray(item?.modelScale) ? item.modelScale : [1, 1, 1];
        const modelRotation = Array.isArray(item?.modelRotation) ? item.modelRotation : [0, 180, 0];
        const modelPosition = Array.isArray(item?.modelPosition) ? item.modelPosition : [0, 0, 0];
        object.scale.multiply(new THREE.Vector3(modelScale[0] || 1, modelScale[1] || 1, modelScale[2] || 1));
        object.rotation.set(
            THREE.MathUtils.degToRad(modelRotation[0] || 0),
            THREE.MathUtils.degToRad(modelRotation[1] || 0),
            THREE.MathUtils.degToRad(modelRotation[2] || 0),
        );
        object.position.add(new THREE.Vector3(modelPosition[0] || 0, modelPosition[1] || 0, modelPosition[2] || 0));
        fittedBox = new THREE.Box3().setFromObject(object);
        const fittedSize = fittedBox.getSize(new THREE.Vector3());
        fittedCenter = fittedBox.getCenter(new THREE.Vector3());
        const radius = Math.max(fittedSize.x, fittedSize.y, fittedSize.z, 0.6);
        this.previewCamera.position.set(
            fittedCenter.x + radius * 0.95,
            fittedCenter.y + radius * 0.7,
            fittedCenter.z + radius * 2.15,
        );
        this.previewCamera.lookAt(fittedCenter);
        this.renderPlayerMeshTree();
    }

    getPreviewNodeKey(node) {
        const parts = [];
        let current = node;
        while (current && current !== this.previewModel && current !== this.previewPivot) {
            parts.push(`${current.name || current.type || 'node'}`);
            current = current.parent;
        }
        return parts.reverse().join('/');
    }

    playPreviewAnimation(animations, clipIndex = 0) {
        this.previewMixer = null;
        this.previewAnimations = Array.isArray(animations) ? animations.filter(Boolean) : [];
        this.previewAnimationClipIndex = Math.max(0, Math.min(clipIndex, Math.max(0, this.previewAnimations.length - 1)));
        this.refreshPreviewAnimationControls();
        if (!this.previewModel || !this.previewAnimations.length) return;
        this.previewMixer = new THREE.AnimationMixer(this.previewModel);
        const clip = this.previewAnimations[this.previewAnimationClipIndex];
        try {
            const action = this.previewMixer.clipAction(clip);
            action.reset();
            action.play();
        } catch {
            this.previewMixer = null;
        }
    }

    refreshPreviewAnimationControls() {
        if (!this.previewAnimSelectEl) return;
        this.previewAnimSelectEl.innerHTML = '';
        if (!this.previewAnimations.length) {
            this.previewAnimSelectEl.classList.add('hidden');
            return;
        }
        this.previewAnimations.forEach((clip, index) => {
            const option = document.createElement('option');
            option.value = `${index}`;
            option.textContent = `${clip.name || `Clip ${index + 1}`}`;
            this.previewAnimSelectEl.appendChild(option);
        });
        this.previewAnimSelectEl.value = `${this.previewAnimationClipIndex}`;
        this.previewAnimSelectEl.classList.remove('hidden');
    }

    loadPreviewAnimation(animationPath) {
        const safePath = safeText(animationPath).trim();
        if (!safePath || !this.previewModel) {
            this.playPreviewAnimation([]);
            return;
        }
        const ext = safePath.split('.').pop()?.toLowerCase() || '';
        const onLoadedAnimations = (animations) => {
            if (!this.previewModel) return;
            this.playPreviewAnimation(animations);
            this.previewCaptionEl.textContent = `3D Preview: ${this.currentPreviewPath}${animations?.length ? ` | Anim: ${safePath}` : ''}`;
        };
        const onError = () => {
            if (this.currentPreviewPath) this.previewCaptionEl.textContent = `3D Preview: ${this.currentPreviewPath} | Anim load failed`;
            this.playPreviewAnimation([]);
        };
        if (ext === 'glb' || ext === 'gltf') {
            new GLTFLoader().load(safePath, (gltf) => onLoadedAnimations(gltf.animations || []), undefined, onError);
            return;
        }
        if (ext === 'fbx') {
            new FBXLoader().load(safePath, (object) => onLoadedAnimations(object.animations || []), undefined, onError);
            return;
        }
        onError();
    }

    loadPreviewModel(modelPath, animationPath = '') {
        const safePath = safeText(modelPath).trim();
        const requestId = ++this.previewRequestId;
        if (!safePath) { this.clearPreviewModel(); return; }
        if (safePath === this.currentPreviewPath && this.previewModel) return;
        this.ensurePreviewRenderer();
        this.clearPreviewModel();
        this.previewCaptionEl.textContent = `Loading: ${safePath}`;
        const ext = safePath.split('.').pop()?.toLowerCase() || '';
        const onLoad = (object, animations = []) => {
            if (requestId !== this.previewRequestId || !this.previewPivot) return;
            this.previewModel = object;
            this.currentPreviewPath = safePath;
            this.normalizePreviewObject(object);
            this.previewPivot.add(object);
            this.previewCaptionEl.textContent = `3D Preview: ${safePath}`;
            this.playPreviewAnimation(animations);
            if (animationPath) this.loadPreviewAnimation(animationPath);
            this.updatePreviewSize();
        };
        const onError = () => { if (requestId !== this.previewRequestId) return; this.previewCaptionEl.textContent = `Preview failed: ${safePath}`; this.currentPreviewPath = ''; };
        if (ext === 'glb' || ext === 'gltf') { new GLTFLoader().load(safePath, (gltf) => onLoad(gltf.scene || gltf.scenes?.[0] || new THREE.Group(), gltf.animations || []), undefined, onError); return; }
        if (ext === 'fbx') { new FBXLoader().load(safePath, (object) => onLoad(object, object.animations || []), undefined, onError); return; }
        if (ext === 'obj') { new OBJLoader().load(safePath, (object) => onLoad(object, []), undefined, onError); return; }
        onError();
    }

    refreshPlayerVariantSelect() {
        if (!this.playerVariantSelectEl) return;
        const item = this.getActiveContentItem();
        const presets = Array.isArray(item?.variantPresets) ? item.variantPresets : [];
        this.playerVariantSelectEl.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'No variant selected';
        this.playerVariantSelectEl.appendChild(placeholder);
        presets.forEach((preset) => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = `${preset.title} [${preset.id}]`;
            this.playerVariantSelectEl.appendChild(option);
        });
        this.playerVariantSelectEl.value = safeText(item?.activeVariantId || '');
    }

    renderPlayerMeshTree() {
        if (!this.meshTreeHostEl) return;
        this.meshTreeHostEl.innerHTML = '';
        if (this.activeContentType !== 'players') return;
        if (!this.previewModel || !this.previewMeshMap.size) {
            const empty = document.createElement('div');
            empty.className = 'dev-panel-empty';
            empty.textContent = 'Upload or select a player model to inspect mesh hierarchy.';
            this.meshTreeHostEl.appendChild(empty);
            return;
        }
        const item = this.getActiveContentItem();
        const meshVisibility = item?.meshVisibility || {};
        const entries = [];
        this.previewModel.traverse((child) => {
            if (!child?.isMesh) return;
            const key = this.getPreviewNodeKey(child);
            let depth = 0;
            let current = child.parent;
            while (current && current !== this.previewModel && current !== this.previewPivot) {
                depth += 1;
                current = current.parent;
            }
            entries.push({ key, label: child.name || child.type || 'Mesh', depth, visible: Object.prototype.hasOwnProperty.call(meshVisibility, key) ? meshVisibility[key] !== false : child.visible !== false });
        });
        entries.forEach((entry) => {
            const row = document.createElement('label');
            row.className = 'dev-panel-mesh-row';
            row.style.paddingLeft = `${12 + (entry.depth * 16)}px`;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = entry.visible;
            checkbox.addEventListener('change', () => this.setPlayerMeshVisibility(entry.key, checkbox.checked));
            const text = document.createElement('span');
            text.textContent = entry.label;
            const hint = document.createElement('code');
            hint.textContent = entry.key;
            row.append(checkbox, text, hint);
            this.meshTreeHostEl.appendChild(row);
        });
    }

    setPlayerMeshVisibility(meshKey, isVisible) {
        const item = this.getActiveContentItem();
        if (!item || this.activeContentType !== 'players') return;
        const next = { ...(item.meshVisibility || {}) };
        next[meshKey] = !!isVisible;
        const mesh = this.previewMeshMap.get(meshKey);
        if (mesh) mesh.visible = !!isVisible;
        this.updateActiveContentField('meshVisibility', next);
    }

    saveCurrentPlayerVariant() {
        const item = this.getActiveContentItem();
        if (!item || this.activeContentType !== 'players') return;
        const title = safeText(window.prompt('Variant name', 'New Variant')).trim();
        if (!title) return;
        const id = toKey(title) || rid('variant');
        const visibleMeshes = [];
        this.previewMeshMap.forEach((mesh, key) => {
            if (mesh?.visible !== false) visibleMeshes.push(key);
        });
        if (!visibleMeshes.length) {
            Object.keys(item.meshVisibility || {}).forEach((key) => {
                if (item.meshVisibility[key] !== false) visibleMeshes.push(key);
            });
        }
        const current = Array.isArray(item.variantPresets) ? clone(item.variantPresets) : [];
        const existingIndex = current.findIndex((preset) => preset.id === id);
        const nextPreset = { id, title, visibleMeshes };
        if (existingIndex >= 0) current[existingIndex] = nextPreset;
        else current.push(nextPreset);
        this.updateActiveContentField('variantPresets', current);
        this.updateActiveContentField('activeVariantId', id);
        this.refreshStatus(`Variant saved: ${title}`);
    }

    applySelectedPlayerVariant() {
        const item = this.getActiveContentItem();
        const presetId = safeText(this.playerVariantSelectEl?.value || item?.activeVariantId || '');
        if (!item || this.activeContentType !== 'players' || !presetId) return;
        const preset = (item.variantPresets || []).find((entry) => entry.id === presetId);
        if (!preset) return;
        const visibleSet = new Set(preset.visibleMeshes || []);
        const nextVisibility = {};
        this.previewMeshMap.forEach((_, key) => { nextVisibility[key] = visibleSet.has(key); });
        this.updateActiveContentField('meshVisibility', nextVisibility);
        this.updateActiveContentField('activeVariantId', presetId);
        this.refreshStatus(`Variant applied: ${preset.title}`);
    }

    deleteSelectedPlayerVariant() {
        const item = this.getActiveContentItem();
        const presetId = safeText(this.playerVariantSelectEl?.value || '');
        if (!item || this.activeContentType !== 'players' || !presetId) return;
        const next = (item.variantPresets || []).filter((entry) => entry.id !== presetId);
        this.updateActiveContentField('variantPresets', next);
        if (safeText(item.activeVariantId) === presetId) this.updateActiveContentField('activeVariantId', '');
        this.refreshStatus(`Variant deleted: ${presetId}`);
    }
}
