export const SHOP_OFFERS = [
    {
        id: 'case_basic',
        title: 'Falcon Case',
        price: 180,
        type: 'case',
        caseId: 'falcon_case',
        description: 'Random skin case',
    },
    {
        id: 'case_premium',
        title: 'Mirage Case',
        price: 320,
        type: 'case',
        caseId: 'mirage_case',
        description: 'Higher rarity skin pool',
    },
    {
        id: 'starter_pack',
        title: 'Starter Skin Pack',
        price: 550,
        type: 'bundle',
        bundleSize: 3,
        description: '3 guaranteed skins',
    },
];

export const CASES = {
    falcon_case: {
        id: 'falcon_case',
        title: 'Falcon Case',
        drops: [
            { skin: 'Forest Camo AK', weight: 18 },
            { skin: 'Crimson USP', weight: 16 },
            { skin: 'Ice Nova', weight: 16 },
            { skin: 'Carbon AWP', weight: 10 },
            { skin: 'Neon MP9', weight: 14 },
            { skin: 'Night M9', weight: 12 },
            { skin: 'Urban Heavy Outfit', weight: 8 },
            { skin: 'Bronze Mirage Gloves', weight: 6 },
        ],
    },
    mirage_case: {
        id: 'mirage_case',
        title: 'Mirage Case',
        drops: [
            { skin: 'Obsidian AK', weight: 11 },
            { skin: 'Ruby USP', weight: 10 },
            { skin: 'Azure Nova', weight: 10 },
            { skin: 'Gold Carbon AWP', weight: 8 },
            { skin: 'Arctic MP9', weight: 10 },
            { skin: 'Ivory M9', weight: 8 },
            { skin: 'Phoenix Operator Outfit', weight: 7 },
            { skin: 'Diamond Mirage Gloves', weight: 5 },
        ],
    },
};

export const DEFAULT_EQUIPPED = {
    character: 'Heavy',
    rifle: 'Default AK',
    pistol: 'Default USP',
    knife: 'Default Knife',
};

