let debugFreeCameraActive = false;

export const isDebugFreeCameraActive = () => debugFreeCameraActive;

export const setDebugFreeCameraActive = (nextActive: boolean) => {
    const normalized = !!nextActive;
    if (debugFreeCameraActive === normalized) return debugFreeCameraActive;
    debugFreeCameraActive = normalized;
    window.dispatchEvent(new CustomEvent('game:debug-free-camera', {
        detail: { active: debugFreeCameraActive },
    }));
    return debugFreeCameraActive;
};
