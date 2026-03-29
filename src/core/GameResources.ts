import { Object3D, AnimationMixer, TextureLoader } from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { getEnabledPlayerProfiles } from '@src/gameplay/player/PlayerAppearance';

const normalizePublicRoot = (value: string) => {
    const raw = `${value || ''}`.trim();
    if (!raw || raw === '/') return '/';
    if (/^[a-z0-9_-]+$/i.test(raw)) return '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
};

const resolveAssetUrl = (publicRoot: string, value: string) => {
    const raw = `${value || ''}`.trim();
    if (!raw) return publicRoot;
    if (/^https?:\/\//i.test(raw)) return raw;
    const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
    if (publicRoot === '/') return normalizedPath;
    const normalizedRoot = publicRoot.endsWith('/') ? publicRoot.slice(0, -1) : publicRoot;
    return `${normalizedRoot}${normalizedPath}`;
};

export const publicPath = normalizePublicRoot(import.meta.env.VITE_PUBLIC_ROOT);
const levelMapPath = `${(import.meta as any).env?.VITE_LEVEL_MAP || ''}`.trim() || '/levels/mirage.glb';

export const GameResources = {
    loader: new GLTFLoader(),
    fbxLoader: new FBXLoader(),
    objLoader: new OBJLoader(),
    textureLoader: new TextureLoader(),
    resourceMap: new Map<string, THREE.Object3D | THREE.AnimationMixer | THREE.AnimationClip | THREE.AnimationAction | GLTF>(),
};

const getContentPlayerModelResourceKey = (modelPath: string) => `ContentPlayerModel:${`${modelPath || ''}`.trim()}`;

const loadContentPlayerModel = async (modelPath: string) => {
    const safePath = `${modelPath || ''}`.trim();
    if (!safePath || GameResources.resourceMap.has(getContentPlayerModelResourceKey(safePath))) return;
    const resolvedPath = resolveAssetUrl(publicPath, safePath);
    const ext = safePath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'glb' || ext === 'gltf') {
        const gltf = await GameResources.loader.loadAsync(resolvedPath);
        GameResources.resourceMap.set(getContentPlayerModelResourceKey(safePath), gltf as unknown as THREE.Object3D);
        return;
    }
    if (ext === 'fbx') {
        const object = await GameResources.fbxLoader.loadAsync(resolvedPath);
        GameResources.resourceMap.set(getContentPlayerModelResourceKey(safePath), object);
        return;
    }
    if (ext === 'obj') {
        const object = await GameResources.objLoader.loadAsync(resolvedPath);
        GameResources.resourceMap.set(getContentPlayerModelResourceKey(safePath), object);
    }
};

const MESH_ALIASES: Record<string, string[]> = {
    AK47_1: ['AK47_1', 'AK47'],
    MP9_1: ['MP9_1', 'AK47_1', 'AK47'],
    Nova_1: ['Nova_1', 'AK47_1', 'AK47'],
    USP_1: ['USP_1', 'USP'],
    M9_1: ['M9_1', 'M9'],
    Arms: ['Arms'],
    Armature: ['Armature', 'Armature.001'],
};

const ANIM_ALIASES: Record<string, string[]> = {
    AK47_equip: ['AK47_equip', 'AK47_equip.001', 'AK47_equip.002'],
    AK47_fire: ['AK47_fire', 'AK47_fire.001'],
    AK47_hold: ['AK47_hold', 'AK47_hold.001'],
    AK47_reload: ['AK47_reload', 'AK47_reload.001'],
    AK47_view: ['AK47_view', 'Default', 'Default.001'],
    MP9_equip: ['MP9_equip', 'AK47_equip', 'AK47_equip.001', 'AK47_equip.002'],
    MP9_fire: ['MP9_fire', 'AK47_fire', 'AK47_fire.001'],
    MP9_hold: ['MP9_hold', 'AK47_hold', 'AK47_hold.001'],
    MP9_reload: ['MP9_reload', 'AK47_reload', 'AK47_reload.001'],
    Nova_equip: ['Nova_equip', 'AK47_equip', 'AK47_equip.001', 'AK47_equip.002'],
    Nova_fire: ['Nova_fire', 'AK47_fire', 'AK47_fire.001'],
    Nova_hold: ['Nova_hold', 'AK47_hold', 'AK47_hold.001'],
    Nova_reload: ['Nova_reload', 'AK47_reload', 'AK47_reload.001'],
    USP_equip: ['USP_equip', 'USP_equip.001'],
    USP_fire: ['USP_fire', 'USP_fire.001'],
    USP_hold: ['USP_hold', 'USP_hold.001'],
    USP_reload: ['USP_reload', 'USP_reload.001'],
    M9_equip: ['M9_equip', 'M9_equip.001'],
    M9_fire: ['M9_fire', 'M9_fire.001'],
    M9_hold: ['M9_hold', 'M9_hold.001'],
};

const assignFirstAvailableAlias = (
    canonicalName: string,
    aliases: string[],
    lookup: (name: string) => THREE.Object3D | undefined,
) => {
    if (GameResources.resourceMap.has(canonicalName)) return;
    for (const alias of aliases) {
        const found = lookup(alias);
        if (!found) continue;
        GameResources.resourceMap.set(canonicalName, found);
        return;
    }
};

const normalizeClipName = (rawName: string) => `${rawName || ''}`.replace(/\.\d+$/, '');

const ensureWeaponFallbackResources = (scene: THREE.Object3D) => {
    Object.entries(MESH_ALIASES).forEach(([canonicalName, aliases]) => {
        assignFirstAvailableAlias(canonicalName, aliases, (name) => scene.getObjectByName(name) as THREE.Object3D | undefined);
    });

    if (!GameResources.resourceMap.has('AWP_1')) {
        const importedAwp = scene.getObjectByName('RootNode')
            || scene.getObjectByName('Sketchfab_model')
            || scene.getObjectByName('1e9d9f7ea9124e5dba545ae434457965.fbx');
        if (importedAwp) {
            const awpObject = importedAwp.clone(true);
            awpObject.name = 'AWP_1';
            awpObject.visible = false;
            GameResources.resourceMap.set('AWP_1', awpObject);
        }
    }

    const animAliases: Array<[string, string]> = [
        ['AWP_equip', 'AK47_equip'],
        ['AWP_reload', 'AK47_reload'],
        ['AWP_fire', 'AK47_fire'],
        ['AWP_hold', 'AK47_hold'],
        ['AWP_view', 'AK47_view'],
    ];
    animAliases.forEach(([target, source]) => {
        if (!GameResources.resourceMap.has(target) && GameResources.resourceMap.has(source)) {
            GameResources.resourceMap.set(target, GameResources.resourceMap.get(source) as THREE.AnimationAction);
        }
    });
};

/** initialize all shared glTF resources */
export const initResource = async () => {
    const hands = GameResources.loader.loadAsync(resolveAssetUrl(publicPath, '/role/base/hand_base.glb'));
    const role = GameResources.loader.loadAsync(resolveAssetUrl(publicPath, '/role/base/role_base.glb'));
    const map = GameResources.loader.loadAsync(resolveAssetUrl(publicPath, levelMapPath));
    const playerModels = getEnabledPlayerProfiles()
        .map((item) => `${item?.modelPath || ''}`.trim())
        .filter(Boolean)
        .filter((path, index, list) => list.indexOf(path) === index)
        .map((path) => loadContentPlayerModel(path).catch(() => null));

    const [gltf1, gltf2, gltf3] = await Promise.all([hands, role, map, ...playerModels]).then((items) => items.slice(0, 3) as [GLTF, GLTF, GLTF]);

    let armature: THREE.Object3D;
    gltf1.scene.traverse((child: Object3D) => {
        if (child.name === 'Armature') {
            armature = child;
            GameResources.resourceMap.set(child.name, child);
        }
        if (child.type === 'SkinnedMesh') {
            child.visible = false;
            GameResources.resourceMap.set(child.name, child);
        }
    });

    const animationMixer = new AnimationMixer(armature);
    GameResources.resourceMap.set('AnimationMixer', animationMixer);
    gltf1.animations.forEach((animationClip: THREE.AnimationClip) => {
        const animationAction = animationMixer.clipAction(animationClip, armature);
        GameResources.resourceMap.set(animationClip.name, animationAction);
        const normalizedClipName = normalizeClipName(animationClip.name);
        if (!GameResources.resourceMap.has(normalizedClipName)) {
            GameResources.resourceMap.set(normalizedClipName, animationAction);
        }
    });

    Object.entries(ANIM_ALIASES).forEach(([canonicalName, aliases]) => {
        if (GameResources.resourceMap.has(canonicalName)) return;
        for (const alias of aliases) {
            const action = GameResources.resourceMap.get(alias);
            if (!action) continue;
            GameResources.resourceMap.set(canonicalName, action);
            break;
        }
    });

    ensureWeaponFallbackResources(gltf1.scene);

    GameResources.resourceMap.set('Role', gltf2);
    GameResources.resourceMap.set(getContentPlayerModelResourceKey('/role/base/role_base.glb'), gltf2 as unknown as THREE.Object3D);
    gltf3.scene.userData.mapAssetPath = levelMapPath;
    GameResources.resourceMap.set('Map', gltf3);

    Promise.resolve();
};
