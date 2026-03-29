import { UserInputEventEnum } from '../abstract/EventsEnum';
import { UserInputEventPipe, UserInputEvent } from '../pipes/UserinputEventPipe';
import { getModeRules, setActiveGameMode } from '../modes/modeRules';
import { isDebugFreeCameraActive } from '@src/debug/DebugFreeCamera';

type PlayNowDetail = {
    mode?: string;
};

/**
 * Maps browser keyboard/mouse input to gameplay events.
 */
export class UserInputSystem {
    private matchLive = false;

    constructor() {
        this.browserEnviromentDefaultBinding();
    }

    browserEnviromentDefaultBinding() {
        window.addEventListener('game:play-now', (event: Event) => {
            this.matchLive = true;
            const detail = ((event as CustomEvent).detail || {}) as PlayNowDetail;
            setActiveGameMode(detail?.mode || 'ffa');
        });

        window.addEventListener('game:return-main-menu', () => {
            this.matchLive = false;
            setActiveGameMode('ffa');
        });

        document.addEventListener('mousedown', (e: MouseEvent) => {
            if (isDebugFreeCameraActive()) return;
            if (e.button === 0) {
                UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_TRIGGLE_DOWN;
                UserInputEventPipe.dispatchEvent(UserInputEvent);
            }
            if (e.button === 2) {
                e.preventDefault();
                UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_SCOPE_TOGGLE;
                UserInputEventPipe.dispatchEvent(UserInputEvent);
            }
        });

        document.addEventListener('mouseup', (e: MouseEvent) => {
            if (isDebugFreeCameraActive()) return;
            if (e.button === 0) {
                UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_TRIGGLE_UP;
                UserInputEventPipe.dispatchEvent(UserInputEvent);
            }
        });

        document.addEventListener('contextmenu', (e: MouseEvent) => {
            if (isDebugFreeCameraActive() || this.matchLive || document.pointerLockElement) e.preventDefault();
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (isDebugFreeCameraActive()) return;
            if (e.code === 'Space' && e.repeat) return;

            switch (e.code) {
                case 'KeyR':
                    UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_RELOAD;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'Digit1':
                    UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_SWITCH_PRIMARY_WEAPON;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'Digit2':
                    UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_SWITCH_SECONDARY_WEAPON;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'Digit3':
                    UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_SWITCH_MALEE_WEAPON;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyQ':
                    UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_SWITCH_LAST_WEAPON;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyB': {
                    if (!this.matchLive) break;
                    const modeRules = getModeRules();
                    if (modeRules.allowInMatchBuyMenu) {
                        window.dispatchEvent(new CustomEvent('game:buy-menu-request', {
                            detail: { mode: 'live' },
                        }));
                    }
                    break;
                }
                case 'KeyE':
                    UserInputEvent.detail.enum = UserInputEventEnum.BUTTON_INTERACT;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyW':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_FORWARD_DOWN;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyA':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_LEFT_DOWN;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyS':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_BACKWARD_DOWN;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyD':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_RIGHT_DOWN;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'Space':
                    UserInputEvent.detail.enum = UserInputEventEnum.JUMP;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    UserInputEvent.detail.enum = UserInputEventEnum.WALK_DOWN;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyC':
                    UserInputEvent.detail.enum = UserInputEventEnum.CROUCH_DOWN;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
            }
        });

        document.addEventListener('keyup', (e: KeyboardEvent) => {
            if (isDebugFreeCameraActive()) return;
            switch (e.code) {
                case 'KeyW':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_FORWARD_UP;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyA':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_LEFT_UP;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyS':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_BACKWARD_UP;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyD':
                    UserInputEvent.detail.enum = UserInputEventEnum.MOVE_RIGHT_UP;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    UserInputEvent.detail.enum = UserInputEventEnum.WALK_UP;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
                case 'KeyC':
                    UserInputEvent.detail.enum = UserInputEventEnum.CROUCH_UP;
                    UserInputEventPipe.dispatchEvent(UserInputEvent);
                    break;
            }
        });
    }
}
