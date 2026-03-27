import { GameContext } from '@src/core/GameContext';
import { CycleInterface } from '@src/core/inferface/CycleInterface';
import { LoopInterface } from '@src/core/inferface/LoopInterface';
import { HitDamageEvent, KillFeedEvent, GameLogicEventPipe, PlayerDamagedEvent, PlayerDiedEvent, PlayerRespawnedEvent } from '@src/gameplay/pipes/GameLogicEventPipe';
import { LocalPlayer } from '@src/gameplay/player/LocalPlayer';
import { getModeRules } from '@src/gameplay/modes/modeRules';
import { PremierProfile, ProgressionProfile, backendApi } from '@src/services/BackendApi';
import { DEFAULT_AVATAR_ID, getAvatarImageUrl } from '@src/shared/AvatarCatalog';

type FeedItem = {
    killer: string;
    victim: string;
    weapon: string;
    headshot: boolean;
    createdAt: number;
};

type DamagePopup = {
    id: number;
    text: string;
    createdAt: number;
    headshot: boolean;
    killed: boolean;
};

type KillCard = {
    id: number;
    victim: string;
    weapon: string;
    headshot: boolean;
};

type ScoreRow = {
    id: string;
    name: string;
    title: string;
    nameColor: string;
    avatar: string;
    avatarFrame: string;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    score: number;
    elo: number;
    premierTier: string;
    calibrated: boolean;
    ping: number;
    local?: boolean;
};

type PlayNowDetail = {
    mode?: string;
    durationSeconds?: number;
    auth?: {
        token?: string;
        username?: string;
        userId?: string;
        premier?: PremierProfile;
        progression?: ProgressionProfile;
    };
};

const ROUND_DURATION_SECONDS = 300;
const ROUND_INTERMISSION_SECONDS = 15;
const KILL_FEED_LIFETIME = 7;
const MAX_KILL_FEED_ITEMS = 6;
const DAMAGE_POPUP_LIFETIME = 0.9;
const MAX_KILL_CARDS = 5;
const ASSIST_DAMAGE_THRESHOLD = 35;

const toInt = (value: any, fallback = 0, min = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.floor(parsed));
};

const premierTierFrom = (elo: number, calibrated: boolean) => {
    if (!calibrated) return 'unranked';
    if (elo >= 30000) return 'gold';
    if (elo >= 25000) return 'red';
    if (elo >= 20000) return 'pink';
    if (elo >= 15000) return 'purple';
    if (elo >= 10000) return 'blue';
    if (elo >= 5000) return 'cyan';
    return 'gray';
};

/**
 * FFA HUD: 5:00 timer, kill feed, end-of-match intermission and Tab scoreboard.
 * Reports round results to backend for economy + premier progression.
 */
export class HUDLayer implements CycleInterface, LoopInterface {

    private localPlayer = LocalPlayer.getInstance();

    private hudRoot: HTMLDivElement;
    private timerValue: HTMLSpanElement;
    private roundValue: HTMLSpanElement;
    private healthValue: HTMLSpanElement;
    private armorValue: HTMLSpanElement;
    private moneyValue: HTMLSpanElement;
    private weaponNameValue: HTMLDivElement;
    private ammoClipValue: HTMLSpanElement;
    private ammoTotalValue: HTMLSpanElement;
    private killFeedList: HTMLDivElement;
    private damagePopupHost: HTMLDivElement;
    private killCardHost: HTMLDivElement;
    private hitFxOverlay: HTMLDivElement;
    private scopeOverlay: HTMLDivElement;
    private roundRewardEl: HTMLDivElement;
    private deathOverlay: HTMLDivElement;
    private deathKillerValue: HTMLSpanElement;
    private deathTimerValue: HTMLSpanElement;
    private roundEndOverlay: HTMLDivElement;
    private roundEndCountdownValue: HTMLSpanElement;
    private roundEndSummaryValue: HTMLDivElement;
    private roundEndContinueBtn: HTMLButtonElement;
    private roundEndMenuBtn: HTMLButtonElement;

    private scoreboardRoot: HTMLDivElement;
    private scoreboardRoundValue: HTMLSpanElement;
    private scoreboardPlayersValue: HTMLSpanElement;
    private scoreboardRankValue: HTMLSpanElement;
    private scoreboardKaValue: HTMLSpanElement;
    private scoreboardPremierValue: HTMLSpanElement;
    private ffaRowsHost: HTMLDivElement;

    private matchLive = false;
    private currentMode = 'ffa';
    private roundStartElapsed = 0;
    private roundNumber = 1;
    private reportingRound = false;
    private intermissionActive = false;
    private intermissionEndsAt = 0;

    private sessionToken: string | null = null;
    private sessionUserId: string | null = null;
    private sessionUsername = 'YOU';

    private killFeedItems: FeedItem[] = [];
    private damagePopups: DamagePopup[] = [];
    private killCards: KillCard[] = [];
    private lifeKillCards = 0;
    private popupSeed = 0;
    private cardSeed = 0;
    private hitFxUntil = 0;
    private roundRewardUntil = 0;
    private deathRespawnAt = 0;
    private localDamageByVictim = new Map<string, number>();
    private localHeadshots = 0;
    private localKillStreak = 0;
    private localBestKillStreak = 0;
    private localWeaponKillStats = new Map<string, number>();

    private scoreboardRows: ScoreRow[] = [
        { id: 'local', name: 'YOU', title: 'Rookie', nameColor: 'default', avatar: DEFAULT_AVATAR_ID, avatarFrame: 'default', kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, elo: 0, premierTier: 'unranked', calibrated: false, ping: 18, local: true },
        { id: 'bot_alex', name: 'BOT_ALEX', title: 'Sharpshooter', nameColor: 'blue', avatar: 'hawk_eye', avatarFrame: 'steel', kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, elo: 12450, premierTier: 'blue', calibrated: true, ping: 24 },
        { id: 'bot_mira', name: 'BOT_MIRA', title: 'Entry Fragger', nameColor: 'purple', avatar: 'captain_royal', avatarFrame: 'royal', kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, elo: 18700, premierTier: 'purple', calibrated: true, ping: 28 },
        { id: 'bot_ivan', name: 'BOT_IVAN', title: 'Rookie', nameColor: 'cyan', avatar: 'dust_raider', avatarFrame: 'default', kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, elo: 8350, premierTier: 'cyan', calibrated: true, ping: 20 },
        { id: 'bot_nova', name: 'BOT_NOVA', title: 'Predator', nameColor: 'pink', avatar: 'night_viper', avatarFrame: 'neon', kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, elo: 24200, premierTier: 'pink', calibrated: true, ping: 31 },
        { id: 'bot_shade', name: 'BOT_SHADE', title: 'Legend', nameColor: 'gold', avatar: 'premier_ace', avatarFrame: 'legend', kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, elo: 30500, premierTier: 'gold', calibrated: true, ping: 26 },
    ];

    private lastHealth = '';
    private lastArmor = '';
    private lastMoney = '';
    private lastWeaponName = '';
    private lastAmmoClip = '';
    private lastAmmoTotal = '';
    private lastRoundText = '';
    private lastTimerText = '';

    init(): void {
        const container = GameContext.GameView.Container;

        this.hudRoot = document.createElement('div');
        this.hudRoot.id = 'cs-hud';
        this.hudRoot.classList.add('hidden');
        this.hudRoot.innerHTML = `
            <div class="cs2-top-center">
                <span class="cs2-round" id="hud-round-value">FFA · ROUND 1</span>
                <span class="cs2-timer" id="hud-timer-value">05:00</span>
            </div>
            <div class="cs2-scope-overlay hidden" id="hud-scope-overlay">
                <div class="cs2-scope-line cs2-scope-line-v"></div>
                <div class="cs2-scope-line cs2-scope-line-h"></div>
            </div>

            <div class="cs2-hitfx" id="hud-hitfx"></div>
            <div class="cs2-round-reward hidden" id="hud-round-reward"></div>
            <div class="cs2-damage-popups" id="hud-damage-popups"></div>
            <div class="cs2-kill-cards" id="hud-kill-cards"></div>
            <div class="cs2-killfeed" id="hud-killfeed-list"></div>
            <div class="cs2-death-overlay hidden" id="hud-death-overlay">
                <div class="cs2-death-card">
                    <div class="cs2-death-title">ELIMINATED</div>
                    <div class="cs2-death-killer">Killed by <span id="hud-death-killer">BOT</span></div>
                    <div class="cs2-death-respawn">Respawning in <span id="hud-death-timer">5.0</span>s</div>
                </div>
            </div>
            <div class="cs2-round-end hidden" id="hud-round-end">
                <div class="cs2-round-end-card">
                    <div class="cs2-round-end-title">MATCH OVER</div>
                    <div class="cs2-round-end-count">Next match in <span id="hud-round-end-countdown">15</span>s</div>
                    <div class="cs2-round-end-summary" id="hud-round-end-summary">PLACEMENT #1 | SCORE 0</div>
                    <div class="cs2-round-end-actions">
                        <button id="hud-round-continue-btn">CONTINUE</button>
                        <button id="hud-round-main-menu-btn">MAIN MENU</button>
                    </div>
                </div>
            </div>

            <div class="cs2-bottom-left">
                <div class="cs2-pills-row">
                    <div class="cs2-pill cs2-pill-health"><span class="cs2-pill-label">HP</span><span class="cs2-pill-value" id="hud-health-value">100</span></div>
                    <div class="cs2-pill cs2-pill-armor"><span class="cs2-pill-label">AR</span><span class="cs2-pill-value" id="hud-armor-value">000</span></div>
                </div>
                <div class="cs2-money" id="hud-money-value">$0800</div>
            </div>

            <div class="cs2-bottom-right">
                <div class="cs2-weapon-name" id="hud-weapon-name">AK47</div>
                <div class="cs2-ammo-wrap">
                    <span class="cs2-ammo-clip" id="hud-ammo-clip">30</span>
                    <span class="cs2-ammo-sep">/</span>
                    <span class="cs2-ammo-total" id="hud-ammo-total">90</span>
                </div>
            </div>
        `;

        this.scoreboardRoot = document.createElement('div');
        this.scoreboardRoot.id = 'cs2-scoreboard';
        this.scoreboardRoot.className = 'hidden';
        this.scoreboardRoot.innerHTML = `
            <div class="cs2-scoreboard-shell">
                <div class="cs2-scoreboard-header">
                    <div class="cs2-sb-title">FREE FOR ALL · MIRAGE</div>
                    <span class="cs2-sb-round" id="hud-scoreboard-round">ROUND 1</span>
                </div>
                <div class="cs2-sb-meta">
                    <div class="cs2-sb-chip"><span>Players</span><strong id="hud-scoreboard-players">0</strong></div>
                    <div class="cs2-sb-chip"><span>Your Place</span><strong id="hud-scoreboard-rank">-</strong></div>
                    <div class="cs2-sb-chip"><span>Your K/A</span><strong id="hud-scoreboard-ka">0.00</strong></div>
                    <div class="cs2-sb-chip"><span>ELO</span><strong id="hud-scoreboard-premier">?</strong></div>
                    <div class="cs2-sb-hint">HOLD TAB TO CLOSE</div>
                </div>
                <div class="cs2-sb-table-wrap">
                    <div class="cs2-sb-table" id="hud-ffa-rows"></div>
                </div>
            </div>
        `;

        container.appendChild(this.hudRoot);
        container.appendChild(this.scoreboardRoot);

        this.timerValue = this.hudRoot.querySelector('#hud-timer-value') as HTMLSpanElement;
        this.roundValue = this.hudRoot.querySelector('#hud-round-value') as HTMLSpanElement;
        this.healthValue = this.hudRoot.querySelector('#hud-health-value') as HTMLSpanElement;
        this.armorValue = this.hudRoot.querySelector('#hud-armor-value') as HTMLSpanElement;
        this.moneyValue = this.hudRoot.querySelector('#hud-money-value') as HTMLSpanElement;
        this.weaponNameValue = this.hudRoot.querySelector('#hud-weapon-name') as HTMLDivElement;
        this.ammoClipValue = this.hudRoot.querySelector('#hud-ammo-clip') as HTMLSpanElement;
        this.ammoTotalValue = this.hudRoot.querySelector('#hud-ammo-total') as HTMLSpanElement;
        this.killFeedList = this.hudRoot.querySelector('#hud-killfeed-list') as HTMLDivElement;
        this.damagePopupHost = this.hudRoot.querySelector('#hud-damage-popups') as HTMLDivElement;
        this.killCardHost = this.hudRoot.querySelector('#hud-kill-cards') as HTMLDivElement;
        this.hitFxOverlay = this.hudRoot.querySelector('#hud-hitfx') as HTMLDivElement;
        this.scopeOverlay = this.hudRoot.querySelector('#hud-scope-overlay') as HTMLDivElement;
        this.roundRewardEl = this.hudRoot.querySelector('#hud-round-reward') as HTMLDivElement;
        this.deathOverlay = this.hudRoot.querySelector('#hud-death-overlay') as HTMLDivElement;
        this.deathKillerValue = this.hudRoot.querySelector('#hud-death-killer') as HTMLSpanElement;
        this.deathTimerValue = this.hudRoot.querySelector('#hud-death-timer') as HTMLSpanElement;
        this.roundEndOverlay = this.hudRoot.querySelector('#hud-round-end') as HTMLDivElement;
        this.roundEndCountdownValue = this.hudRoot.querySelector('#hud-round-end-countdown') as HTMLSpanElement;
        this.roundEndSummaryValue = this.hudRoot.querySelector('#hud-round-end-summary') as HTMLDivElement;
        this.roundEndContinueBtn = this.hudRoot.querySelector('#hud-round-continue-btn') as HTMLButtonElement;
        this.roundEndMenuBtn = this.hudRoot.querySelector('#hud-round-main-menu-btn') as HTMLButtonElement;

        this.scoreboardRoundValue = this.scoreboardRoot.querySelector('#hud-scoreboard-round') as HTMLSpanElement;
        this.scoreboardPlayersValue = this.scoreboardRoot.querySelector('#hud-scoreboard-players') as HTMLSpanElement;
        this.scoreboardRankValue = this.scoreboardRoot.querySelector('#hud-scoreboard-rank') as HTMLSpanElement;
        this.scoreboardKaValue = this.scoreboardRoot.querySelector('#hud-scoreboard-ka') as HTMLSpanElement;
        this.scoreboardPremierValue = this.scoreboardRoot.querySelector('#hud-scoreboard-premier') as HTMLSpanElement;
        this.ffaRowsHost = this.scoreboardRoot.querySelector('#hud-ffa-rows') as HTMLDivElement;

        this.roundEndContinueBtn.addEventListener('click', () => {
            this.finishIntermissionAndContinue();
        });
        this.roundEndMenuBtn.addEventListener('click', () => {
            this.exitToMainMenuFromRoundEnd();
        });

        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.hideOverlays);

        window.addEventListener('game:play-now', (e: Event) => {
            this.startMatch((e as CustomEvent).detail as PlayNowDetail);
        });
        window.addEventListener('game:return-main-menu', () => {
            this.stopMatch();
        });
        window.addEventListener('game:scope-state', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as { active?: boolean; overlay?: string };
            this.applyScopeOverlayState(!!detail.active, `${detail.overlay || 'none'}`);
        });
        window.addEventListener('game:profile-updated', (event: Event) => {
            const detail = ((event as CustomEvent).detail || {}) as {
                premier?: PremierProfile;
                progression?: ProgressionProfile;
            };
            const local = this.getLocalRow();
            if (detail.premier && typeof detail.premier === 'object') {
                local.elo = toInt(detail.premier.rating, local.elo, 0);
                local.calibrated = !!detail.premier.visible;
                local.premierTier = `${detail.premier.tier || premierTierFrom(local.elo, local.calibrated)}`;
            }
            if (detail.progression?.cosmetics) {
                local.title = `${detail.progression.cosmetics.title || local.title}`;
                local.nameColor = `${detail.progression.cosmetics.nameColor || local.nameColor}`;
                local.avatar = `${detail.progression.cosmetics.avatar || local.avatar}`;
                local.avatarFrame = `${detail.progression.cosmetics.avatarFrame || local.avatarFrame}`;
            }
            this.renderScoreboard();
        });

        GameLogicEventPipe.addEventListener(KillFeedEvent.type, (e: CustomEvent) => {
            if (!this.matchLive) return;
            const killer = `${e.detail.killerName || this.sessionUsername}`;
            const victim = `${e.detail.victimName || 'ENEMY'}`;
            const weapon = `${e.detail.weaponName || 'RIFLE'}`;
            const headshot = !!e.detail.headshot;
            this.pushKillFeed(killer, victim, weapon, headshot);
            this.applyScoreFromKill(killer, victim, weapon, headshot);
            this.applyAssistFromKillFeed(killer, victim);

            if (killer === 'YOU' || killer === this.sessionUsername) {
                this.pushKillCard(victim, weapon, headshot);
            }
            if (victim === 'YOU' || victim === this.sessionUsername) {
                this.clearKillCards();
            }
        });

        GameLogicEventPipe.addEventListener(HitDamageEvent.type, (e: CustomEvent) => {
            if (!this.matchLive) return;
            const damage = Math.max(0, Math.floor(Number(e.detail.damage) || 0));
            if (damage <= 0) return;
            const victim = `${e.detail.victimName || ''}`;
            if (victim) {
                this.localDamageByVictim.set(victim, (this.localDamageByVictim.get(victim) || 0) + damage);
            }
            const localRow = this.getLocalRow();
            localRow.damage += damage;
            localRow.score += Math.floor(damage * 0.35);
            const headshot = !!e.detail.headshot;
            const killed = !!e.detail.killed;
            if (killed && victim) this.localDamageByVictim.delete(victim);
            this.pushDamagePopup(damage, headshot, killed);
            this.renderScoreboard();
        });

        GameLogicEventPipe.addEventListener(PlayerDamagedEvent.type, (e: CustomEvent) => {
            if (!this.matchLive) return;
            const damage = Math.max(0, Math.floor(Number(e.detail.damage) || 0));
            if (damage <= 0) return;
            const attacker = `${e.detail.attackerName || ''}`;
            if (!attacker) return;
            const row = this.scoreboardRows.find(item => item.name === attacker);
            if (!row) return;
            row.damage += damage;
            row.score += Math.floor(damage * 0.3);
            this.renderScoreboard();
        });

        GameLogicEventPipe.addEventListener(PlayerDiedEvent.type, (e: CustomEvent) => {
            if (!this.matchLive) return;
            const killer = `${e.detail.killerName || 'BOT'}`;
            const respawnAt = Number(e.detail.respawnAt) || 0;
            this.localKillStreak = 0;
            this.showDeathOverlay(killer, respawnAt);
        });

        GameLogicEventPipe.addEventListener(PlayerRespawnedEvent.type, () => {
            this.hideDeathOverlay();
        });

        this.renderKillFeed();
        this.renderScoreboard();
    }

    callEveryFrame(deltaTime?: number, elapsedTime?: number): void {
        if (!this.matchLive) return;

        const elapsed = elapsedTime || 0;
        if (this.intermissionActive) {
            this.syncBottomHud();
            this.updateRoundEndCountdown(elapsed);
            this.updateDeathOverlay(elapsed);
            return;
        }

        this.updateRoundTimer(elapsed);
        this.syncBottomHud();
        this.pruneKillFeed(elapsed);
        this.pruneDamagePopups(elapsed);
        this.updateHitFx(elapsed);
        this.updateRoundReward(elapsed);
        this.updateDeathOverlay(elapsed);
        this.syncLocalScoreRow();
    }

    private startMatch(detail?: PlayNowDetail) {
        this.currentMode = `${detail?.mode || 'ffa'}`.trim().toLowerCase();
        const modeRules = getModeRules(this.currentMode);
        if (!modeRules.showFfaHud || !modeRules.enableRoundFlow) {
            this.stopMatch();
            return;
        }
        this.matchLive = true;
        this.intermissionActive = false;
        this.intermissionEndsAt = 0;
        this.hudRoot.classList.remove('hidden');
        this.roundNumber = 1;
        this.roundStartElapsed = GameContext.GameLoop.Clock.getElapsedTime();
        this.sessionToken = detail?.auth?.token || null;
        this.sessionUserId = detail?.auth?.userId || null;
        this.sessionUsername = detail?.auth?.username || 'YOU';

        const localRow = this.getLocalRow();
        localRow.name = this.sessionUsername;
        localRow.elo = toInt(detail?.auth?.premier?.rating, localRow.elo || 5000, 0);
        localRow.calibrated = !!detail?.auth?.premier?.visible;
        localRow.premierTier = `${detail?.auth?.premier?.tier || premierTierFrom(localRow.elo, localRow.calibrated)}`;
        localRow.title = `${detail?.auth?.progression?.cosmetics?.title || 'Rookie'}`;
        localRow.nameColor = `${detail?.auth?.progression?.cosmetics?.nameColor || 'default'}`;
        localRow.avatar = `${detail?.auth?.progression?.cosmetics?.avatar || DEFAULT_AVATAR_ID}`;
        localRow.avatarFrame = `${detail?.auth?.progression?.cosmetics?.avatarFrame || 'default'}`;

        this.resetRoundStats();
        this.renderScoreboard();
        this.killFeedItems = [];
        this.renderKillFeed();
        this.damagePopups = [];
        this.renderDamagePopups();
        this.localDamageByVictim.clear();
        this.localHeadshots = 0;
        this.localKillStreak = 0;
        this.localBestKillStreak = 0;
        this.localWeaponKillStats.clear();
        this.clearKillCards();
        this.hideRoundReward();
        this.hideRoundEndOverlay();
        this.hideDeathOverlay();
        this.applyScopeOverlayState(false, 'none');
    }

    private stopMatch() {
        this.matchLive = false;
        this.intermissionActive = false;
        this.intermissionEndsAt = 0;
        this.hudRoot.classList.add('hidden');
        this.scoreboardRoot.classList.add('hidden');
        this.killFeedItems = [];
        this.renderKillFeed();
        this.damagePopups = [];
        this.renderDamagePopups();
        this.localDamageByVictim.clear();
        this.localHeadshots = 0;
        this.localKillStreak = 0;
        this.localBestKillStreak = 0;
        this.localWeaponKillStats.clear();
        this.clearKillCards();
        this.hideRoundReward();
        this.hideRoundEndOverlay();
        this.hideDeathOverlay();
        this.applyScopeOverlayState(false, 'none');
    }

    private updateRoundTimer(elapsed: number) {
        const roundElapsed = elapsed - this.roundStartElapsed;
        if (roundElapsed >= ROUND_DURATION_SECONDS) {
            this.beginRoundIntermission(elapsed);
            return;
        }

        const remaining = Math.max(0, ROUND_DURATION_SECONDS - Math.floor(elapsed - this.roundStartElapsed));
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        const timerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        const roundText = `FFA · ROUND ${this.roundNumber}`;

        if (timerText !== this.lastTimerText) {
            this.lastTimerText = timerText;
            this.timerValue.textContent = timerText;
        }
        if (roundText !== this.lastRoundText) {
            this.lastRoundText = roundText;
            this.roundValue.textContent = roundText;
            this.scoreboardRoundValue.textContent = roundText;
        }
    }

    private beginRoundIntermission(elapsed: number) {
        if (this.intermissionActive) return;

        const sorted = this.getSortedRows();
        const localRow = this.getLocalRow();
        const placement = Math.max(1, sorted.findIndex(row => row.id === localRow.id) + 1 || sorted.length);
        const winner = sorted[0];
        if (winner) {
            this.pushKillFeed('SYSTEM', `${winner.name} wins round`, 'FFA', false);
        }

        this.intermissionActive = true;
        this.intermissionEndsAt = elapsed + ROUND_INTERMISSION_SECONDS;
        this.hideDeathOverlay();
        this.roundEndCountdownValue.textContent = `${ROUND_INTERMISSION_SECONDS}`;
        this.roundEndSummaryValue.textContent = `PLACEMENT #${placement} | SCORE ${Math.max(0, Math.floor(localRow.score))} | ELO ${localRow.calibrated ? localRow.elo : '?'}`;
        this.roundEndOverlay.classList.remove('hidden');

        const durationSeconds = Math.max(1, Math.floor(elapsed - this.roundStartElapsed));
        const opponentElo = this.computeOpponentAverageElo();
        this.reportRoundResult({
            kills: localRow.kills,
            deaths: localRow.deaths,
            assists: localRow.assists,
            headshots: this.localHeadshots,
            damage: localRow.damage,
            score: localRow.score,
            wins: placement === 1 ? 1 : 0,
            maxKillStreak: this.localBestKillStreak,
            weaponKills: Object.fromEntries(this.localWeaponKillStats.entries()),
            placement,
            playerCount: Math.max(2, sorted.length),
            opponentAvgElo: opponentElo,
            matchesPlayed: 1,
            durationSeconds,
            mapName: 'mirage',
        });

        window.dispatchEvent(new CustomEvent('game:round-intermission-start', {
            detail: {
                round: this.roundNumber,
                placement,
            },
        }));
        if (GameContext.PointLock.isLocked) GameContext.PointLock.unlock();
    }

    private updateRoundEndCountdown(elapsed: number) {
        if (!this.intermissionActive) return;
        const remain = Math.max(0, Math.ceil(this.intermissionEndsAt - elapsed));
        this.roundEndCountdownValue.textContent = `${remain}`;
        if (remain <= 0) {
            this.finishIntermissionAndContinue();
        }
    }

    private finishIntermissionAndContinue() {
        if (!this.matchLive) return;

        this.intermissionActive = false;
        this.intermissionEndsAt = 0;
        this.hideRoundEndOverlay();
        this.roundNumber += 1;
        this.roundStartElapsed = GameContext.GameLoop.Clock.getElapsedTime();
        this.resetRoundStats();
        this.localDamageByVictim.clear();
        this.killFeedItems = [];
        this.renderKillFeed();
        this.damagePopups = [];
        this.renderDamagePopups();
        this.clearKillCards();
        this.renderScoreboard();
        window.dispatchEvent(new CustomEvent('game:round-intermission-end', {
            detail: { round: this.roundNumber },
        }));
        if (!GameContext.PointLock.isLocked) GameContext.PointLock.lock();
    }

    private exitToMainMenuFromRoundEnd() {
        this.hideRoundEndOverlay();
        this.intermissionActive = false;
        this.intermissionEndsAt = 0;
        this.matchLive = false;
        this.hudRoot.classList.add('hidden');
        this.scoreboardRoot.classList.add('hidden');
        window.dispatchEvent(new CustomEvent('game:open-main-menu'));
        window.dispatchEvent(new CustomEvent('game:return-main-menu'));
        if (GameContext.PointLock.isLocked) GameContext.PointLock.unlock();
    }

    private hideRoundEndOverlay() {
        this.roundEndOverlay.classList.add('hidden');
    }

    private async reportRoundResult(payload: {
        kills: number;
        deaths: number;
        assists: number;
        headshots: number;
        damage: number;
        score: number;
        wins: number;
        maxKillStreak: number;
        weaponKills: Record<string, number>;
        placement: number;
        playerCount: number;
        opponentAvgElo: number;
        matchesPlayed: number;
        durationSeconds: number;
        mapName: string;
    }) {
        if (!this.sessionToken) return;
        if (this.reportingRound) return;
        this.reportingRound = true;
        try {
            const result = await backendApi.reportFfaResult(this.sessionToken, payload);
            if (typeof result.wallet === 'number') {
                this.localPlayer.money = result.wallet;
                window.dispatchEvent(new CustomEvent('game:profile-updated', {
                    detail: {
                        wallet: result.wallet,
                        stats: result.stats,
                        premier: result.premier,
                        progression: result.progression,
                    },
                }));
            }
            if (result.premier) {
                const local = this.getLocalRow();
                local.elo = toInt(result.premier.rating, local.elo, 0);
                local.calibrated = !!result.premier.visible;
                local.premierTier = `${result.premier.tier || premierTierFrom(local.elo, local.calibrated)}`;
                if (result.progression?.cosmetics) {
                    local.title = `${result.progression.cosmetics.title || local.title}`;
                    local.nameColor = `${result.progression.cosmetics.nameColor || local.nameColor}`;
                    local.avatar = `${result.progression.cosmetics.avatar || local.avatar}`;
                    local.avatarFrame = `${result.progression.cosmetics.avatarFrame || local.avatarFrame}`;
                }
                this.roundEndSummaryValue.textContent = `PLACEMENT #${payload.placement} | SCORE ${Math.max(0, Math.floor(local.score))} | ELO ${result.premier.display}`;
                this.renderScoreboard();
            }
            if (result.rewardBreakdown) {
                this.showRoundReward(result.rewardBreakdown, payload.placement, result.questRewardTotal || 0);
            } else {
                this.showRoundReward({
                    placement: 0,
                    win: 0,
                    kill: result.reward || 0,
                    total: result.reward || 0,
                }, payload.placement, result.questRewardTotal || 0);
            }
            window.dispatchEvent(new CustomEvent('game:leaderboard-updated'));
        } catch {
            // Ignore temporary network failures; next rounds will retry.
        } finally {
            this.reportingRound = false;
        }
    }

    private resetRoundStats() {
        this.scoreboardRows.forEach(row => {
            row.kills = 0;
            row.deaths = 0;
            row.assists = 0;
            row.damage = 0;
            row.score = 0;
        });
        this.localPlayer.kills = 0;
        this.localPlayer.deaths = 0;
        this.localPlayer.assists = 0;
        this.localHeadshots = 0;
        this.localKillStreak = 0;
        this.localBestKillStreak = 0;
        this.localWeaponKillStats.clear();
    }

    private syncBottomHud() {
        const hp = this.clampToHud(this.localPlayer.health);
        const armor = this.clampToHud(this.localPlayer.armor);
        const money = this.clampMoney(this.localPlayer.money);

        const inventory = this.localPlayer.inventorySystem;
        const weapon = inventory ? inventory.weapons.get(inventory.nowEquipInventory) : null;

        const weaponName = weapon ? weapon.weaponName : 'HANDS';
        const ammoClip = (weapon && typeof weapon.bulletLeftMagzine === 'number')
            ? `${Math.max(0, weapon.bulletLeftMagzine)}`
            : '--';
        const ammoTotal = (weapon && typeof weapon.bulletLeftTotal === 'number')
            ? `${Math.max(0, weapon.bulletLeftTotal)}`
            : '--';

        const hpText = this.padNumber(hp);
        const armorText = this.padNumber(armor);
        const moneyText = `$${money.toString().padStart(4, '0')}`;

        if (hpText !== this.lastHealth) {
            this.lastHealth = hpText;
            this.healthValue.textContent = hpText;
        }
        if (armorText !== this.lastArmor) {
            this.lastArmor = armorText;
            this.armorValue.textContent = armorText;
        }
        if (moneyText !== this.lastMoney) {
            this.lastMoney = moneyText;
            this.moneyValue.textContent = moneyText;
        }
        if (weaponName !== this.lastWeaponName) {
            this.lastWeaponName = weaponName;
            this.weaponNameValue.textContent = weaponName.toUpperCase();
        }
        if (ammoClip !== this.lastAmmoClip) {
            this.lastAmmoClip = ammoClip;
            this.ammoClipValue.textContent = ammoClip;
        }
        if (ammoTotal !== this.lastAmmoTotal) {
            this.lastAmmoTotal = ammoTotal;
            this.ammoTotalValue.textContent = ammoTotal;
        }
    }

    private pushKillFeed(killer: string, victim: string, weapon: string, headshot: boolean) {
        const now = GameContext.GameLoop.Clock.getElapsedTime();
        this.killFeedItems.push({ killer, victim, weapon, headshot, createdAt: now });
        if (this.killFeedItems.length > MAX_KILL_FEED_ITEMS) {
            this.killFeedItems.splice(0, this.killFeedItems.length - MAX_KILL_FEED_ITEMS);
        }
        this.renderKillFeed();
    }

    private pruneKillFeed(now: number) {
        const before = this.killFeedItems.length;
        this.killFeedItems = this.killFeedItems.filter(item => now - item.createdAt <= KILL_FEED_LIFETIME);
        if (this.killFeedItems.length !== before) this.renderKillFeed();
    }

    private renderKillFeed() {
        const ordered = [...this.killFeedItems].reverse();
        this.killFeedList.innerHTML = ordered.map(item => `
            <div class="cs2-kill-item">
                <span class="cs2-kill-killer">${item.killer}</span>
                <span class="cs2-kill-weapon">${item.weapon}${item.headshot ? ' HS' : ''}</span>
                <span class="cs2-kill-victim">${item.victim}</span>
            </div>
        `).join('');
    }

    private pushDamagePopup(damage: number, headshot: boolean, killed: boolean) {
        const now = GameContext.GameLoop.Clock.getElapsedTime();
        this.hitFxUntil = Math.max(this.hitFxUntil, now + 0.12);
        const text = killed ? `-${damage} KILL` : headshot ? `-${damage} HS` : `-${damage}`;
        this.damagePopups.push({
            id: ++this.popupSeed,
            text,
            createdAt: now,
            headshot,
            killed,
        });
        if (this.damagePopups.length > 5) {
            this.damagePopups.splice(0, this.damagePopups.length - 5);
        }
        this.renderDamagePopups();
    }

    private pruneDamagePopups(now: number) {
        const before = this.damagePopups.length;
        this.damagePopups = this.damagePopups.filter(item => now - item.createdAt <= DAMAGE_POPUP_LIFETIME);
        if (before !== this.damagePopups.length) this.renderDamagePopups();
    }

    private renderDamagePopups() {
        const ordered = [...this.damagePopups].reverse();
        this.damagePopupHost.innerHTML = ordered.map(item => `
            <div class="cs2-damage-item ${item.killed ? 'is-kill' : item.headshot ? 'is-hs' : ''}">${item.text}</div>
        `).join('');
    }

    private updateHitFx(elapsed: number) {
        const active = elapsed <= this.hitFxUntil;
        this.hitFxOverlay.classList.toggle('active', active);
    }

    private showRoundReward(
        rewardBreakdown: { placement: number; win: number; kill: number; total: number },
        placement: number,
        questReward = 0,
    ) {
        const total = Math.max(0, Math.floor(Number(rewardBreakdown.total) || 0));
        const kill = Math.max(0, Math.floor(Number(rewardBreakdown.kill) || 0));
        const place = Math.max(0, Math.floor(Number(rewardBreakdown.placement) || 0));
        const win = Math.max(0, Math.floor(Number(rewardBreakdown.win) || 0));
        const quests = Math.max(0, Math.floor(Number(questReward) || 0));
        const grandTotal = total + quests;

        this.roundRewardEl.textContent = quests > 0
            ? `ROUND #${placement} | +${grandTotal} COIN (MATCH ${total} + QUEST ${quests})`
            : `ROUND #${placement} | +${total} COIN (KILL ${kill} + PLACE ${place} + WIN ${win})`;
        this.roundRewardEl.classList.remove('hidden');
        this.roundRewardUntil = GameContext.GameLoop.Clock.getElapsedTime() + 5.2;
    }

    private updateRoundReward(elapsed: number) {
        if (this.roundRewardUntil <= 0) return;
        if (elapsed >= this.roundRewardUntil) {
            this.hideRoundReward();
        }
    }

    private hideRoundReward() {
        this.roundRewardUntil = 0;
        this.roundRewardEl.classList.add('hidden');
    }

    private showDeathOverlay(killerName: string, respawnAt: number) {
        this.deathRespawnAt = respawnAt;
        this.deathKillerValue.textContent = killerName;
        this.deathOverlay.classList.remove('hidden');
        this.updateDeathOverlay(GameContext.GameLoop.Clock.getElapsedTime());
    }

    private hideDeathOverlay() {
        this.deathRespawnAt = 0;
        this.deathOverlay.classList.add('hidden');
    }

    private updateDeathOverlay(elapsed: number) {
        if (this.deathRespawnAt <= 0) return;
        const remain = Math.max(0, this.deathRespawnAt - elapsed);
        this.deathTimerValue.textContent = remain.toFixed(1);
        if (remain <= 0.02 || this.localPlayer.health > 0) this.hideDeathOverlay();
    }

    private pushKillCard(victim: string, weapon: string, headshot: boolean) {
        if (this.lifeKillCards >= MAX_KILL_CARDS) return;
        this.lifeKillCards += 1;
        this.killCards.push({
            id: ++this.cardSeed,
            victim,
            weapon,
            headshot,
        });
        if (this.killCards.length > MAX_KILL_CARDS) {
            this.killCards.splice(0, this.killCards.length - MAX_KILL_CARDS);
        }
        this.renderKillCards();
    }

    private clearKillCards() {
        this.lifeKillCards = 0;
        this.killCards = [];
        this.renderKillCards();
    }

    private renderKillCards() {
        this.killCardHost.innerHTML = this.killCards.map((card, idx) => `
            <div class="cs2-kill-card">
                <span class="cs2-kill-card-index">#${idx + 1}</span>
                <span class="cs2-kill-card-main">${card.victim}</span>
                <span class="cs2-kill-card-sub">${card.weapon}${card.headshot ? ' HS' : ''}</span>
            </div>
        `).join('');
    }

    private syncLocalScoreRow() {
        const local = this.getLocalRow();
        let changed = false;
        if (local.kills !== this.localPlayer.kills) { local.kills = this.localPlayer.kills; changed = true; }
        if (local.deaths !== this.localPlayer.deaths) { local.deaths = this.localPlayer.deaths; changed = true; }
        if (local.assists !== this.localPlayer.assists) { local.assists = this.localPlayer.assists; changed = true; }
        if (local.ping !== this.localPlayer.ping) { local.ping = this.localPlayer.ping; changed = true; }
        if (changed) this.renderScoreboard();
    }

    private applyScoreFromKill(killerName: string, victimName: string, weaponName: string, headshot: boolean) {
        const localRow = this.getLocalRow();
        const killerRow = (killerName === 'YOU')
            ? localRow
            : this.scoreboardRows.find(row => row.name === killerName);
        const victimRow = (victimName === 'YOU')
            ? localRow
            : this.scoreboardRows.find(row => row.name === victimName);

        if (killerRow) {
            killerRow.kills += 1;
            killerRow.score += headshot ? 160 : 120;
        }
        if (victimRow) {
            victimRow.deaths += 1;
            victimRow.score = Math.max(0, victimRow.score - 45);
        }

        if (killerName === 'YOU' || killerName === this.sessionUsername) {
            this.localPlayer.kills += 1;
            this.localPlayer.money = this.clampMoney(this.localPlayer.money + 300);
            if (headshot) this.localHeadshots += 1;
            this.localKillStreak += 1;
            if (this.localKillStreak > this.localBestKillStreak) this.localBestKillStreak = this.localKillStreak;
            const weaponId = this.normalizeWeaponId(weaponName);
            if (weaponId) {
                this.localWeaponKillStats.set(weaponId, (this.localWeaponKillStats.get(weaponId) || 0) + 1);
            }
        }

        if (victimName === 'YOU' || victimName === this.sessionUsername) {
            this.localKillStreak = 0;
        }

        this.renderScoreboard();
    }

    private applyAssistFromKillFeed(killerName: string, victimName: string) {
        if (!victimName) return;
        const damage = this.localDamageByVictim.get(victimName) || 0;
        const killerIsLocal = killerName === 'YOU' || killerName === this.sessionUsername;

        if (!killerIsLocal && damage >= ASSIST_DAMAGE_THRESHOLD) {
            this.localPlayer.assists += 1;
            const local = this.getLocalRow();
            local.assists += 1;
            local.score += 60;
            this.pushKillFeed('SYSTEM', `ASSIST on ${victimName}`, 'ASSIST', false);
        }

        this.localDamageByVictim.delete(victimName);
        this.renderScoreboard();
    }

    private getSortedRows() {
        return [...this.scoreboardRows]
            .sort((a, b) =>
                b.score - a.score ||
                b.kills - a.kills ||
                a.deaths - b.deaths ||
                b.assists - a.assists ||
                b.damage - a.damage
            );
    }

    private computeOpponentAverageElo() {
        const others = this.scoreboardRows.filter(row => !row.local);
        if (!others.length) return 10000;
        const total = others.reduce((sum, row) => sum + Math.max(0, toInt(row.elo, 10000, 0)), 0);
        return Math.round(total / others.length);
    }

    private renderScoreboard() {
        const rows = this.getSortedRows();
        const localRow = this.getLocalRow();
        const localRank = rows.findIndex(row => row.id === localRow.id) + 1;
        const localKa = (localRow.kills / Math.max(1, localRow.assists)).toFixed(2);

        this.scoreboardPlayersValue.textContent = `${rows.length}`;
        this.scoreboardRankValue.textContent = localRank > 0 ? `#${localRank}` : '-';
        this.scoreboardKaValue.textContent = localKa;
        this.scoreboardPremierValue.textContent = this.formatEloForUi(localRow);

        const header = `
            <div class="cs2-sb-row cs2-sb-row-head cs2-sb-row-ffa">
                <span>#</span><span>PLAYER</span><span>RANK</span><span>K</span><span>D</span><span>A</span><span>K/A</span><span>SCORE</span><span>DMG</span><span>PING</span>
            </div>
        `;

        const body = rows.map((row, idx) => `
            <div class="cs2-sb-row cs2-sb-row-ffa ${row.local ? 'is-local' : ''} ${idx < 3 ? 'is-top' : ''}">
                <span>${idx + 1}</span>
                <span class="cs2-sb-col-player">
                    <span class="cs2-sb-player ${this.normalizeFrameClass(row.avatarFrame)}">
                        <span class="cs2-sb-avatar-shell ${this.normalizeFrameClass(row.avatarFrame)}">
                            <img class="cs2-sb-avatar" src="${getAvatarImageUrl(row.avatar)}" alt="${row.name}" />
                        </span>
                        <span class="cs2-sb-player-title">${row.title}</span>
                        <span class="cs2-sb-player-name ${this.normalizeNameColorClass(row.nameColor)}">${row.name}</span>
                    </span>
                </span>
                <span>${this.renderRankBadge(row)}</span>
                <span>${row.kills}</span>
                <span>${row.deaths}</span>
                <span>${row.assists}</span>
                <span>${(row.kills / Math.max(1, row.assists)).toFixed(2)}</span>
                <span>${Math.max(0, Math.floor(row.score))}</span>
                <span>${Math.max(0, Math.floor(row.damage))}</span>
                <span class="cs2-sb-ping ${row.ping <= 30 ? 'is-good' : row.ping <= 60 ? 'is-mid' : 'is-bad'}">${Math.max(0, row.ping)}</span>
            </div>
        `).join('');

        this.ffaRowsHost.innerHTML = `${header}${body}`;
    }

    private applyScopeOverlayState(active: boolean, overlay: string) {
        if (!this.scopeOverlay) return;
        this.scopeOverlay.classList.toggle('hidden', !active || !this.matchLive);
        this.scopeOverlay.classList.toggle('is-sniper', active && overlay === 'sniper');
        this.scopeOverlay.classList.toggle('is-rifle', active && overlay === 'rifle');
    }

    private onKeyDown = (e: KeyboardEvent) => {
        if (!this.matchLive) return;
        if (e.code === 'Tab') {
            e.preventDefault();
            this.scoreboardRoot.classList.remove('hidden');
        }
    };

    private onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Tab') {
            e.preventDefault();
            this.scoreboardRoot.classList.add('hidden');
        }
    };

    private hideOverlays = () => {
        this.scoreboardRoot.classList.add('hidden');
    };

    private getLocalRow() {
        const local = this.scoreboardRows.find(row => row.local);
        if (local) return local;
        const created: ScoreRow = {
            id: 'local',
            name: this.sessionUsername,
            title: 'Rookie',
            nameColor: 'default',
            avatar: DEFAULT_AVATAR_ID,
            avatarFrame: 'default',
            kills: 0,
            deaths: 0,
            assists: 0,
            damage: 0,
            score: 0,
            elo: 5000,
            premierTier: 'unranked',
            calibrated: false,
            ping: 18,
            local: true,
        };
        this.scoreboardRows.unshift(created);
        return created;
    }

    private clampToHud(value: number): number {
        if (typeof value !== 'number' || Number.isNaN(value)) return 0;
        return Math.max(0, Math.min(999, Math.floor(value)));
    }

    private clampMoney(value: number): number {
        if (typeof value !== 'number' || Number.isNaN(value)) return 0;
        return Math.max(0, Math.min(16000, Math.floor(value)));
    }

    private padNumber(value: number): string {
        return `${value}`.padStart(3, '0');
    }

    private formatEloForUi(row: ScoreRow) {
        if (!row.calibrated) return '?';
        return Math.max(0, Math.floor(row.elo)).toLocaleString('en-US');
    }

    private renderRankBadge(row: ScoreRow) {
        const elo = this.formatEloForUi(row);
        return `
            <span class="cs2-rank-badge premier-${row.premierTier}">
                <span class="cs2-rank-bars"></span>
                <span class="cs2-rank-value">${elo}</span>
            </span>
        `;
    }

    private normalizeWeaponId(raw: string) {
        const lower = `${raw || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!lower) return '';
        if (lower.includes('ak47')) return 'ak47';
        if (lower.includes('m4a1s') || lower.includes('m4a1')) return 'm4a1_s';
        if (lower.includes('usps') || lower === 'usp') return 'usp_s';
        if (lower.includes('glock')) return 'glock18';
        if (lower.includes('deagle') || lower.includes('deserteagle')) return 'deagle';
        if (lower.includes('mac10')) return 'mac10';
        if (lower.includes('mp9')) return 'mp9';
        if (lower.includes('p90')) return 'p90';
        if (lower.includes('sg553')) return 'sg553';
        if (lower.includes('aug')) return 'aug';
        if (lower.includes('awp')) return 'awp';
        if (lower.includes('xm1014')) return 'xm1014';
        if (lower.includes('negev')) return 'negev';
        if (lower.includes('m9') || lower.includes('knife')) return 'm9';
        return lower;
    }

    private normalizeNameColorClass(raw: string) {
        const safe = `${raw || 'default'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        return `name-${safe || 'default'}`;
    }

    private normalizeFrameClass(raw: string) {
        const safe = `${raw || 'default'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        return `frame-${safe || 'default'}`;
    }
}
