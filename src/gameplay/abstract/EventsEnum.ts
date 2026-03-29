/**
 * Pointer lock events.
 */
export enum PointLockEventEnum {
    LOCK,
    UNLOCK,
    MOUSEMOVE,
}

/**
 * Gameplay input events.
 */
export enum UserInputEventEnum {
    BUTTON_SWITCH_PRIMARY_WEAPON,
    BUTTON_SWITCH_SECONDARY_WEAPON,
    BUTTON_SWITCH_MALEE_WEAPON,
    BUTTON_SWITCH_LAST_WEAPON,
    BUTTON_RELOAD,
    BUTTON_TRIGGLE_DOWN,
    BUTTON_TRIGGLE_UP,
    BUTTON_SCOPE_TOGGLE,
    BUTTON_INTERACT,

    JUMP,
    MOVE_FORWARD_DOWN,
    MOVE_BACKWARD_DOWN,
    MOVE_LEFT_DOWN,
    MOVE_RIGHT_DOWN,
    MOVE_FORWARD_UP,
    MOVE_BACKWARD_UP,
    MOVE_LEFT_UP,
    MOVE_RIGHT_UP,
    WALK_DOWN,
    WALK_UP,
    CROUCH_DOWN,
    CROUCH_UP,
}

/**
 * Weapon animation events.
 */
export enum WeaponAnimationEventEnum {
    HOLD,
    EQUIP,
    RELIEVE_EQUIP,
    FIRE,
    RELOAD,
    PICKUP,
}
