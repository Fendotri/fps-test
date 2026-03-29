import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { DomEventPipe, PointLockEvent } from '@src/gameplay/pipes/DomEventPipe';
import { PointLockEventEnum } from '@src/gameplay/abstract/EventsEnum';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { isDebugFreeCameraActive } from '@src/debug/DebugFreeCamera';

const mouseConfig = {
    dpi: 1000,
    mouseSensitivity: 0.5,
};

const _PI_2 = Math.PI / 2;

/**
 * FPS camera controller.
 */
export class FPSCameraController extends EventTarget implements CycleInterface {

    domElement: HTMLElement;
    camera: THREE.Camera;
    localPlayer: LocalPlayer = LocalPlayer.getInstance();
    private scopedSensitivityMul = 1;

    init(): void {

        this.camera = GameContext.Cameras.PlayerCamera;
        this.camera.rotation.order = 'YXZ';

        this.domElement = GameContext.GameView.Container;

        const scope = this;

        window.addEventListener('game:scope-state', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as { sensitivityMul?: number };
            const mul = Number(detail.sensitivityMul);
            scope.scopedSensitivityMul = Number.isFinite(mul) ? Math.max(0.05, Math.min(1, mul)) : 1;
        });

        DomEventPipe.addEventListener(PointLockEvent.type, function (e: CustomEvent) {
            switch (e.detail.enum) {
                case PointLockEventEnum.MOUSEMOVE:
                    if (isDebugFreeCameraActive()) return;
                    if (scope.localPlayer.health <= 0) return;

                    const { dpi, mouseSensitivity } = mouseConfig;
                    const sensitivity = mouseSensitivity * scope.scopedSensitivityMul;

                    const screenTrasformX = e.detail.movementX / dpi * sensitivity;
                    const screenTrasformY = e.detail.movementY / dpi * sensitivity;

                    scope.camera.rotation.y = scope.camera.rotation.y - screenTrasformX;
                    scope.camera.rotation.x = Math.max(_PI_2 - Math.PI, Math.min(_PI_2, scope.camera.rotation.x - screenTrasformY));
                    break;
            }

        });

    }

}
