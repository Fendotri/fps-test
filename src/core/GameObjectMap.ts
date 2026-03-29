import { LevelMirage } from '../gameplay/levels/LevelMirage';
import { EnemyBotSystem } from '../gameplay/bot/EnemyBotSystem';
import { OnlineRoomSystem } from '../gameplay/online/OnlineRoomSystem';
import { LocalPlayer } from '../gameplay/player/LocalPlayer';
import { DOMLayer } from '../viewlayers/DomLayer';
import { GLViewportLayer } from '../viewlayers/GLViewportLayer';
import { BulletHoleAshLayer } from '../viewlayers/scene/BulletHoleAshLayer';
import { BulletHoleFlashLayer } from '../viewlayers/scene/BulletHoleFlashLayer';
import { BulletHoleLayer } from '../viewlayers/scene/BulletHoleLayer';
import { BodyHitFXLayer } from '../viewlayers/scene/BodyHitFXLayer';
import { BulletTracerLayer } from '../viewlayers/scene/BulletTracerLayer';
import { SkyLayer } from '../viewlayers/SkyLayer';
import { CrosshairLayer } from '../viewlayers/ui/CrosshairLayer';
import { DeveloperPanelLayer } from '../viewlayers/ui/DeveloperPanelLayer';
import { HandModelLayer } from '../viewlayers/ui/HandModelLayer';
import { HUDLayer } from '../viewlayers/ui/HUDLayer';
import { ChamberBulletShell } from '../viewlayers/weapon/ChamberBulletShellLayer';
import { ChamberSmokeLayer } from '../viewlayers/weapon/ChamberSmokeLayer';
import { MuzzleFlashLayer } from '../viewlayers/weapon/MuzzleFlashLayer';
import { MuzzleSparkLayer } from '../viewlayers/weapon/MuzzleSparkLayer';
import { ScopeSystem } from '../gameplay/weapon/ScopeSystem';
import { CycleInterface } from './inferface/CycleInterface';
import { LoopInterface } from './inferface/LoopInterface';

export const createGameObjectsMap = () => {
    const gameObjects: Array<LoopInterface | CycleInterface> = [
        new DOMLayer(),
        new HUDLayer(),
        new DeveloperPanelLayer(),
        new SkyLayer(),
        new HandModelLayer(),
        new CrosshairLayer(),
        new BulletHoleLayer(),
        new BulletHoleFlashLayer(),
        new BulletHoleAshLayer(),
        new BodyHitFXLayer(),
        new BulletTracerLayer(),
        new ChamberBulletShell(),
        new ChamberSmokeLayer(),
        new MuzzleFlashLayer(),
        new MuzzleSparkLayer(),
        new GLViewportLayer(),
        new LevelMirage(),
        new ScopeSystem(),
        new OnlineRoomSystem(),
        EnemyBotSystem.getInstance(),
        LocalPlayer.getInstance(),
    ];

    const map = new Map<string, LoopInterface | CycleInterface>();
    gameObjects.forEach((item) => {
        map.set(item.constructor.name, item);
    });
    return map;
};
