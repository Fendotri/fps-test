import { Octree } from 'three/examples/jsm/math/Octree';
import { GameContext } from '@src/core/GameContext';
import { anisotropy8x, dealWithBakedTexture } from '@src/core/lib/threejs_common';
import { GameObjectMaterialEnum } from '../abstract/GameObjectMaterialEnum';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { Box3, BoxGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';

const MIRAGE_MAP_SCALE = 1.65;
const DUST2_MAP_SCALE = 1.12;
const GENERIC_MAP_SCALE = 1.0;

const resolveScaleOverride = () => {
    const raw = `${(import.meta as any).env?.VITE_LEVEL_MAP_SCALE || ''}`.trim();
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const SCALE_OVERRIDE = resolveScaleOverride();

class LevelMirage implements CycleInterface {

    private ensureSafetyGround(mapRoot: THREE.Object3D) {
        const bounds = new Box3().setFromObject(mapRoot);
        if (bounds.isEmpty()) return;

        const sizeX = Math.max(12, bounds.max.x - bounds.min.x);
        const sizeZ = Math.max(12, bounds.max.z - bounds.min.z);
        const centerX = (bounds.min.x + bounds.max.x) * 0.5;
        const centerZ = (bounds.min.z + bounds.max.z) * 0.5;

        const safetyFloor = new Mesh(
            new BoxGeometry(sizeX + 12, 0.6, sizeZ + 12),
            new MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                side: DoubleSide,
                depthWrite: false,
            }),
        );
        safetyFloor.name = 'MapSafetyFloor';
        safetyFloor.position.set(centerX, bounds.min.y - 0.3, centerZ);
        safetyFloor.userData['MapSafetyFloor'] = true;
        mapRoot.add(safetyFloor);
    }

    init() {
        const boardScene = GameContext.Scenes.Level;

        // Build world collision octree from scaled physics mesh.
        const octTree: Octree = new Octree();
        GameContext.Physical.WorldOCTree = octTree;

        const gltf = GameContext.GameResources.resourceMap.get('Map') as GLTF;
        const mapRoot = gltf.scene;
        const mapAssetPath = `${mapRoot?.userData?.mapAssetPath || ''}`.toLowerCase();
        const isMirageMap = mapAssetPath.includes('mirage');
        const isDust2Map = mapAssetPath.includes('dust');
        const targetScale = SCALE_OVERRIDE || (isMirageMap ? MIRAGE_MAP_SCALE : (isDust2Map ? DUST2_MAP_SCALE : GENERIC_MAP_SCALE));

        mapRoot.scale.setScalar(targetScale);
        mapRoot.updateWorldMatrix(true, true);
        if (isDust2Map) this.ensureSafetyGround(mapRoot);
        mapRoot.updateWorldMatrix(true, true);
        octTree.fromGraphNode(mapRoot);

        if (isMirageMap) {
            const boardMesh = mapRoot.children[0] as THREE.Mesh;
            if (boardMesh && (boardMesh as any).isMesh) {
                const bakedTexture = GameContext.GameResources.textureLoader.load('/levels/t.mirage.baked.75.jpg');
                dealWithBakedTexture(boardMesh, bakedTexture);
                anisotropy8x(boardMesh);
                // keep world scale after detaching from map root
                boardMesh.scale.setScalar(targetScale);
                boardMesh.userData['GameObjectMaterialEnum'] = GameObjectMaterialEnum.GrassGround;
                boardScene.add(boardMesh);
                return;
            }
        }

        // Generic fallback for non-baked maps (e.g. de_dust_2_with_real_light.glb).
        mapRoot.traverse((child: any) => {
            if (!child?.isMesh) return;
            if (child.userData['MapSafetyFloor']) return;
            child.userData['GameObjectMaterialEnum'] = GameObjectMaterialEnum.GrassGround;
        });
        anisotropy8x(mapRoot as unknown as THREE.Mesh);
        boardScene.add(mapRoot);
    }

}

export { LevelMirage };
