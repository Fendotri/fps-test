import { getContentStudioSnapshot } from '@src/content/ContentStudio';

const toKey = (value: string) => `${value || ''}`.trim().toLowerCase();

const hashSeed = (value: string) => {
    const input = `${value || ''}`;
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) - hash) + input.charCodeAt(i);
    return Math.abs(hash);
};

export const getEnabledPlayerProfiles = () => {
    const snapshot = getContentStudioSnapshot();
    return Array.isArray(snapshot?.players) ? snapshot.players.filter((item) => item?.enabled !== false) : [];
};

export const getRuntimePlayerAppearance = (seed: string) => {
    const profiles = getEnabledPlayerProfiles();
    if (!profiles.length) return null;
    const profile = profiles[hashSeed(seed) % profiles.length];
    const presets = Array.isArray(profile?.variantPresets) ? profile.variantPresets : [];
    const activeVariantId = toKey(profile?.activeVariantId || '');
    const selectedPreset = (activeVariantId && presets.find((item) => toKey(item?.id) === activeVariantId))
        || (presets.length ? presets[hashSeed(`variant:${seed}`) % presets.length] : null);
    return {
        profile,
        modelPath: `${profile?.modelPath || ''}`.trim(),
        iconPath: `${profile?.iconPath || ''}`.trim(),
        animationPath: `${profile?.animationPath || ''}`.trim(),
        meshVisibility: profile?.meshVisibility && typeof profile.meshVisibility === 'object' ? profile.meshVisibility : {},
        visibleMeshes: Array.isArray(selectedPreset?.visibleMeshes) ? selectedPreset.visibleMeshes : [],
        variantId: `${selectedPreset?.id || ''}`.trim(),
    };
};
