import { createGameObjectsMap as createBaseGameObjectsMap } from './GameObjectMap';
import { SprayLabSystem } from '../gameplay/combat/SprayLabSystem';

export const createGameObjectsMap = () => {
    const map = createBaseGameObjectsMap();
    map.set('SprayLabSystem', new SprayLabSystem());
    return map;
};
