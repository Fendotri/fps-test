import 'normalize.css';
import '@assets/css/style.scss';
import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from './core/inferface/CycleInterface';
import { LoopInterface } from './core/inferface/LoopInterface';
import { initResource } from './core/GameResources';

initResource().then(async () => {
    const { createGameObjectsMap } = await import('@game-object-map');
    const gameObjectsMap = await createGameObjectsMap();

    gameObjectsMap.forEach((value) => {
        if ((value as any as CycleInterface).init) GameContext.CycleObjects.push(value);
        if ((value as any as LoopInterface).callEveryFrame) GameContext.LoopObjects.push(value);
    });

    for (let i = 0; i < GameContext.CycleObjects.length; i++) {
        (GameContext.CycleObjects[i] as CycleInterface).init();
    }

    loop();
});

const loop = () => {
    const deltaTime = GameContext.GameLoop.Clock.getDelta();
    const elapsedTime = GameContext.GameLoop.Clock.getElapsedTime();

    GameContext.GameLoop.LoopID = window.requestAnimationFrame(() => { loop(); });

    if (GameContext.Performance && GameContext.Performance.QualityController) {
        GameContext.Performance.QualityController.onFrame(deltaTime);
    }

    for (let i = 0; i < GameContext.LoopObjects.length; i++) {
        GameContext.LoopObjects[i].callEveryFrame(deltaTime, elapsedTime);
    }

    GameContext.GameLoop.Pause = false;
};

const pause = () => {
    if (!GameContext.GameLoop.Pause) {
        window.cancelAnimationFrame(GameContext.GameLoop.LoopID);
        GameContext.GameLoop.Pause = true;
    } else {
        loop();
    }
};

window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.code === 'KeyP') pause();
});
