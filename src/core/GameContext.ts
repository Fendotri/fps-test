import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import {
    WebGL1Renderer,
    ACESFilmicToneMapping,
    sRGBEncoding,
    Color,
    WebGLRenderTarget,
    Clock,
    PerspectiveCamera,
    Scene,
    OrthographicCamera,
} from 'three';
import { getContainerStatus } from '@src/core/lib/browser_common';
import { LoopInterface } from './inferface/LoopInterface';
import { PointLock } from './PointLock';
import { Octree } from 'three/examples/jsm/math/Octree';
import { GameResources } from './GameResources';
import { createAdaptiveQualityController, getEffectivePixelRatio, getRuntimeQualityProfile } from './RuntimeQuality';

const container = document.querySelector('#game-view') as HTMLElement;
const initialContainerStatus = getContainerStatus(container);
const initialQuality = getRuntimeQualityProfile();

const renderer = new WebGL1Renderer({
    antialias: initialQuality.antialias,
    alpha: false,
    precision: initialQuality.precision,
    powerPreference: 'high-performance',
});
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputEncoding = sRGBEncoding;
renderer.setSize(initialContainerStatus.width, initialContainerStatus.height);
renderer.setPixelRatio(getEffectivePixelRatio(initialContainerStatus.pixcelRatio));
renderer.setClearColor(new Color(0xffffff));
renderer.domElement.className = 'webgl';

const effectCompser = new EffectComposer(
    renderer,
    new WebGLRenderTarget(initialContainerStatus.width, initialContainerStatus.height, { stencilBuffer: true }),
);
effectCompser.renderTarget1.texture.encoding = sRGBEncoding;
effectCompser.renderTarget2.texture.encoding = sRGBEncoding;

const qualityController = createAdaptiveQualityController(renderer);

export const GameContext = {
    GameView: {
        Container: container as HTMLElement,
        Renderer: renderer,
        EffectComposer: effectCompser,
    },

    GameLoop: {
        Clock: new Clock(),
        LoopID: undefined as any as number,
        Pause: true as any as boolean,
        LoopInstance: [] as any as LoopInterface[],
    },

    Cameras: {
        PlayerCamera: new PerspectiveCamera(65, initialContainerStatus.width / initialContainerStatus.height, 0.1, 1000),
        HandModelCamera: new PerspectiveCamera(75, initialContainerStatus.width / initialContainerStatus.height, 0.001, 5),
        UICamera: new OrthographicCamera(-50, 50, 50, -50, 0.001, 1001),
    },

    Scenes: {
        Skybox: new Scene(),
        Level: new Scene(),
        Collision: new Scene(),
        Handmodel: new Scene(),
        UI: new Scene(),
        Sprites: new Scene(),
    },

    Physical: {
        WorldOCTree: undefined as any as Octree,
    },

    PointLock,
    GameResources,

    Performance: {
        QualityController: qualityController,
        QualityProfile: initialQuality,
    },

    CycleObjects: [],
    LoopObjects: [],
};

export const onWindowResize = () => {
    const { width, height, pixcelRatio } = getContainerStatus(GameContext.GameView.Container);

    const effectivePixelRatio = getEffectivePixelRatio(pixcelRatio);

    GameContext.GameView.Renderer.setSize(width, height);
    GameContext.GameView.Renderer.setPixelRatio(effectivePixelRatio);

    Array.isArray(Object.keys(GameContext.Cameras)) && Object.keys(GameContext.Cameras).forEach((key) => {
        const camera = (GameContext.Cameras as any)[key];
        if (camera.aspect) camera.aspect = width / height;
        if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
    });

    GameContext.GameView.EffectComposer.renderTarget1.setSize(width * effectivePixelRatio, height * effectivePixelRatio);
    GameContext.GameView.EffectComposer.renderTarget2.setSize(width * effectivePixelRatio, height * effectivePixelRatio);
};

onWindowResize();
window.addEventListener('resize', onWindowResize);
