import captainRoyalUrl from '@assets/avatar/captain_royal.svg';
import dustRaiderUrl from '@assets/avatar/dust_raider.svg';
import hawkEyeUrl from '@assets/avatar/hawk_eye.svg';
import nightViperUrl from '@assets/avatar/night_viper.svg';
import premierAceUrl from '@assets/avatar/premier_ace.svg';
import rookieOpsUrl from '@assets/avatar/rookie_ops.svg';

export type FrontendAvatarCatalogItem = {
    id: string;
    label: string;
    imageUrl: string;
};

export const DEFAULT_AVATAR_ID = 'rookie_ops';

export const FRONTEND_AVATAR_CATALOG: FrontendAvatarCatalogItem[] = [
    { id: 'rookie_ops', label: 'Rookie Ops', imageUrl: rookieOpsUrl },
    { id: 'dust_raider', label: 'Dust Raider', imageUrl: dustRaiderUrl },
    { id: 'hawk_eye', label: 'Hawk Eye', imageUrl: hawkEyeUrl },
    { id: 'night_viper', label: 'Night Viper', imageUrl: nightViperUrl },
    { id: 'captain_royal', label: 'Captain Royal', imageUrl: captainRoyalUrl },
    { id: 'premier_ace', label: 'Premier Ace', imageUrl: premierAceUrl },
];

const avatarById = new Map(FRONTEND_AVATAR_CATALOG.map((item) => [item.id, item]));

export const getAvatarCatalogItem = (avatarId?: string | null) => {
    const safeId = `${avatarId || ''}`.trim().toLowerCase();
    return avatarById.get(safeId) || avatarById.get(DEFAULT_AVATAR_ID)!;
};

export const getAvatarImageUrl = (avatarId?: string | null) => getAvatarCatalogItem(avatarId).imageUrl;
export const getAvatarLabel = (avatarId?: string | null) => getAvatarCatalogItem(avatarId).label;
