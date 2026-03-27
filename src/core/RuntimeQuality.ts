import { Vector2, WebGL1Renderer } from 'three';
import { QUALITY_AUTO_ENABLED } from './BuildFlags';

export type QualityTier = 'low' | 'medium' | 'high';

export type RuntimeQualityProfile = {
    tier: QualityTier;
    antialias: boolean;
    precision: 'highp' | 'mediump';
    pixelRatioCap: number;
    fxBudget: number;
};

const PROFILES: Record<QualityTier, RuntimeQualityProfile> = {
    low: {
        tier: 'low',
        antialias: false,
        precision: 'mediump',
        pixelRatioCap: 1.0,
        fxBudget: 0.45,
    },
    medium: {
        tier: 'medium',
        antialias: false,
        precision: 'highp',
        pixelRatioCap: 1.25,
        fxBudget: 0.72,
    },
    high: {
        tier: 'high',
        antialias: true,
        precision: 'highp',
        pixelRatioCap: 1.5,
        fxBudget: 1.0,
    },
};

const hasWindow = typeof window !== 'undefined';
const hasNavigator = typeof navigator !== 'undefined';

const detectDeviceTier = (): QualityTier => {
    if (!hasWindow || !hasNavigator) return 'medium';

    const nav = navigator as Navigator & { deviceMemory?: number };
    const memory = Number(nav.deviceMemory || 0);
    const cores = Number(nav.hardwareConcurrency || 0);
    const ua = `${nav.userAgent || ''}`;
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
    const isChromebook = /cros/i.test(ua);

    if (isMobile || isChromebook) return 'low';
    if ((memory > 0 && memory <= 4) || (cores > 0 && cores <= 4)) return 'low';
    if ((memory > 0 && memory <= 8) || (cores > 0 && cores <= 8)) return 'medium';
    return 'high';
};

let activeTier: QualityTier = QUALITY_AUTO_ENABLED ? detectDeviceTier() : 'medium';

export const getRuntimeQualityProfile = (): RuntimeQualityProfile => PROFILES[activeTier];

export const getEffectivePixelRatio = (devicePixelRatio: number): number => {
    const dpr = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
    return Math.min(dpr, getRuntimeQualityProfile().pixelRatioCap);
};

export const scaleQualityCount = (base: number, min = 1): number => {
    const budget = getRuntimeQualityProfile().fxBudget;
    return Math.max(min, Math.round(Math.max(0, base) * budget));
};

export const scaleQualityTime = (base: number, floor = 0.05): number => {
    const budget = getRuntimeQualityProfile().fxBudget;
    return Math.max(floor, base * (0.72 + budget * 0.28));
};

export const applyQualityTier = (tier: QualityTier, renderer?: WebGL1Renderer): RuntimeQualityProfile => {
    activeTier = tier;
    const profile = getRuntimeQualityProfile();

    if (renderer && hasWindow) {
        const size = renderer.getSize(new Vector2());
        renderer.setPixelRatio(getEffectivePixelRatio(window.devicePixelRatio || 1));
        renderer.setSize(size.x, size.y, false);
    }

    if (hasWindow) {
        window.dispatchEvent(new CustomEvent('game:quality-tier', {
            detail: {
                tier: profile.tier,
                fxBudget: profile.fxBudget,
                pixelRatioCap: profile.pixelRatioCap,
            },
        }));
    }

    return profile;
};

export type AdaptiveQualityController = {
    onFrame: (deltaTime: number) => void;
    getTier: () => QualityTier;
};

export const createAdaptiveQualityController = (renderer: WebGL1Renderer): AdaptiveQualityController => {
    let lowFpsAccum = 0;

    return {
        onFrame(deltaTime: number) {
            if (!QUALITY_AUTO_ENABLED || !hasWindow) return;

            const dt = Math.max(0.0001, Number(deltaTime) || 0.016);
            const fps = 1 / dt;

            if (fps < 44) lowFpsAccum += dt;
            else lowFpsAccum = Math.max(0, lowFpsAccum - dt * 1.6);

            if (lowFpsAccum < 4.5) return;

            if (activeTier === 'high') {
                applyQualityTier('medium', renderer);
            } else if (activeTier === 'medium') {
                applyQualityTier('low', renderer);
            }
            lowFpsAccum = 0;
        },
        getTier() {
            return activeTier;
        },
    };
};
