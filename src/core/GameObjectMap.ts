import { LevelMirage } from '../gameplay/levels/LevelMirage';
import { EnemyBotSystem } from '../gameplay/bot/EnemyBotSystem';
import { LocalPlayer } from '../gameplay/player/LocalPlayer';
import { DOMLayer } from '../viewlayers/DomLayer';
import { GLViewportLayer } from '../viewlayers/GLViewportLayer';
import { BulletHoleAshLayer } from '../viewlayers/scene/BulletHoleAshLayer';
import { BulletHoleFlashLayer } from '../viewlayers/scene/BulletHoleFlashLayer';
import { BulletHoleLayer } from '../viewlayers/scene/BulletHoleLayer';
import { SkyLayer } from '../viewlayers/SkyLayer';
import { CrosshairLayer } from '../viewlayers/ui/CrosshairLayer';
import { HandModelLayer } from '../viewlayers/ui/HandModelLayer';
import { HUDLayer } from '../viewlayers/ui/HUDLayer';
import { ChamberBulletShell } from '../viewlayers/weapon/ChamberBulletShellLayer';
import { ChamberSmokeLayer } from '../viewlayers/weapon/ChamberSmokeLayer';
import { MuzzleFlashLayer } from '../viewlayers/weapon/MuzzleFlashLayer';
import { ScopeSystem } from '../gameplay/weapon/ScopeSystem';
import { CycleInterface } from './inferface/CycleInterface';
import { LoopInterface } from './inferface/LoopInterface';

export const createGameObjectsMap = () => {
    const gameObjects: Array<LoopInterface | CycleInterface> = [
        new DOMLayer(),
        new HUDLayer(),
        new SkyLayer(),
        new HandModelLayer(),
        new CrosshairLayer(),
        new BulletHoleLayer(),
        new BulletHoleFlashLayer(),
        new BulletHoleAshLayer(),
        new ChamberBulletShell(),
        new ChamberSmokeLayer(),
        new MuzzleFlashLayer(),
        new GLViewportLayer(),
        new LevelMirage(),
        new ScopeSystem(),
        EnemyBotSystem.getInstance(),
        LocalPlayer.getInstance(),
    ];

    const map = new Map<string, LoopInterface | CycleInterface>();
    gameObjects.forEach((item) => {
        map.set(item.constructor.name, item);
    });
    return map;
};
