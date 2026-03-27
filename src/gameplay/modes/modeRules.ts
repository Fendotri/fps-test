export type GameModeId = 'ffa' | 'tdm' | 'dm' | 'competitive' | string;

export type ModeRules = {
    allowInMatchBuyMenu: boolean;
    enableBots: boolean;
    enableRoundFlow: boolean;
    allowDamage: boolean;
    allowEconomy: boolean;
    showFfaHud: boolean;
};

const DEFAULT_RULES: ModeRules = {
    allowInMatchBuyMenu: false,
    enableBots: true,
    enableRoundFlow: true,
    allowDamage: true,
    allowEconomy: true,
    showFfaHud: true,
};

const RULES_BY_MODE: Record<string, ModeRules> = {
    ffa: {
        allowInMatchBuyMenu: false,
        enableBots: true,
        enableRoundFlow: true,
        allowDamage: true,
        allowEconomy: true,
        showFfaHud: true,
    },
    dm: {
        allowInMatchBuyMenu: true,
        enableBots: true,
        enableRoundFlow: true,
        allowDamage: true,
        allowEconomy: true,
        showFfaHud: true,
    },
    tdm: {
        allowInMatchBuyMenu: true,
        enableBots: true,
        enableRoundFlow: true,
        allowDamage: true,
        allowEconomy: true,
        showFfaHud: true,
    },
    competitive: {
        allowInMatchBuyMenu: true,
        enableBots: true,
        enableRoundFlow: true,
        allowDamage: true,
        allowEconomy: true,
        showFfaHud: true,
    },
};

const normalizeMode = (value: any) => `${value || 'ffa'}`.trim().toLowerCase();

let activeMode: GameModeId = 'ffa';

export const setActiveGameMode = (mode: GameModeId) => {
    activeMode = normalizeMode(mode);
};

export const getActiveGameMode = () => activeMode;

export const getModeRules = (mode?: GameModeId): ModeRules => {
    const key = normalizeMode(mode ?? activeMode);
    const rules = RULES_BY_MODE[key];
    if (!rules) return { ...DEFAULT_RULES };
    return { ...rules };
};
