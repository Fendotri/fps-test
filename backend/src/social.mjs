import crypto from 'node:crypto';
import { sanitizeFriendState } from './friends.mjs';
import { getCaseById, getShopOffers } from './liveops.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

const ROOM_CAPACITY = 4;
const PARTY_ID_LENGTH = 6;
const ROOM_INVITE_TTL_MS = 30 * 60 * 1000;
const MAX_GIFT_NOTE = 120;
const MAX_DM_LENGTH = 240;
const MAX_RECENT_GIFTS = 20;
const MAX_RECENT_INVITES = 20;
const MAX_THREADS = 20;
const MAX_THREAD_MESSAGES = 40;
const MAX_DIRECT_MESSAGES = 1200;
const COIN_GIFT_PRESETS = [100, 250, 500];

const toIso = (value, fallback = null) => {
    const parsed = new Date(value || '');
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toISOString();
};

const ensureString = (value, fallback = '') => `${value || fallback}`.trim();

const clampInt = (value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const cleanIdList = (value) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
        .map((item) => ensureString(item))
        .filter(Boolean)
        .filter((item) => {
            if (seen.has(item)) return false;
            seen.add(item);
            return true;
        });
};

const sortByTimeDesc = (rows) => rows.sort((a, b) => {
    const left = Number(new Date(a?.createdAt || 0).getTime()) || 0;
    const right = Number(new Date(b?.createdAt || 0).getTime()) || 0;
    return right - left;
});

const pushUnique = (list, value) => {
    if (!value || list.includes(value)) return;
    list.push(value);
};

const randomPartyId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let output = '';
    for (let i = 0; i < PARTY_ID_LENGTH; i += 1) {
        output += chars[Math.floor(Math.random() * chars.length)];
    }
    return output;
};

const normalizeVisibility = (value, fallback = 'private') => {
    const safeValue = ensureString(value, fallback).toLowerCase();
    return safeValue === 'public' ? 'public' : 'private';
};

const trimText = (value, maxLength) => Array.from(`${value || ''}`.replace(/\s+/g, ' ').trim())
    .slice(0, maxLength)
    .join('');

const ensureMiniUser = (targetUser, presenceResolver) => {
    if (!targetUser || typeof targetUser !== 'object') return null;
    const cosmetics = targetUser.progression?.cosmetics || {};
    const presence = typeof presenceResolver === 'function'
        ? (presenceResolver(targetUser.id) || {})
        : {};
    return {
        userId: targetUser.id,
        username: targetUser.username,
        title: `${cosmetics.title || 'Rookie'}`,
        nameColor: `${cosmetics.nameColor || 'default'}`,
        avatar: `${cosmetics.avatar || 'rookie_ops'}`,
        avatarFrame: `${cosmetics.avatarFrame || 'default'}`,
        premier: targetUser.premier || null,
        online: !!presence.online,
        lastSeenAt: presence.lastSeenAt || null,
    };
};

const areUsersFriends = (leftUser, rightUser) => {
    const left = sanitizeFriendState(leftUser?.friends, leftUser?.id);
    const right = sanitizeFriendState(rightUser?.friends, rightUser?.id);
    return left.friends.includes(rightUser?.id) && right.friends.includes(leftUser?.id);
};

const createRoomLabel = (user) => {
    const username = `${user?.username || 'Operator'}`.trim() || 'Operator';
    return `${username.toUpperCase()} SQUAD`;
};

export const createDefaultSocialStore = () => ({
    rooms: [],
    roomInvites: [],
    gifts: [],
    directMessages: [],
});

const sanitizeRoom = (rawRoom, validUserIds) => {
    const roomId = ensureString(rawRoom?.id);
    if (!roomId) return null;
    const hostUserId = ensureString(rawRoom?.hostUserId);
    const memberIds = cleanIdList(rawRoom?.memberIds).filter((item) => validUserIds.has(item));
    if (!hostUserId || !validUserIds.has(hostUserId)) return null;
    if (!memberIds.includes(hostUserId)) memberIds.unshift(hostUserId);
    if (!memberIds.length) return null;
    return {
        id: roomId,
        hostUserId: memberIds.includes(hostUserId) ? hostUserId : memberIds[0],
        memberIds: memberIds.slice(0, ROOM_CAPACITY),
        capacity: ROOM_CAPACITY,
        label: trimText(rawRoom?.label || '', 36) || 'SQUAD ROOM',
        partyId: ensureString(rawRoom?.partyId).toUpperCase().slice(0, PARTY_ID_LENGTH) || randomPartyId(),
        visibility: normalizeVisibility(rawRoom?.visibility, 'private'),
        createdAt: toIso(rawRoom?.createdAt) || new Date().toISOString(),
        updatedAt: toIso(rawRoom?.updatedAt) || new Date().toISOString(),
    };
};

const sanitizeRoomInvite = (rawInvite, validUserIds, roomIds, now) => {
    const id = ensureString(rawInvite?.id);
    const fromUserId = ensureString(rawInvite?.fromUserId);
    const toUserId = ensureString(rawInvite?.toUserId);
    const roomId = ensureString(rawInvite?.roomId);
    if (!id || !fromUserId || !toUserId || !roomId) return null;
    if (fromUserId === toUserId) return null;
    if (!validUserIds.has(fromUserId) || !validUserIds.has(toUserId)) return null;
    if (!roomIds.has(roomId)) return null;
    const createdAt = toIso(rawInvite?.createdAt) || now.toISOString();
    const expiresAt = toIso(rawInvite?.expiresAt) || new Date(new Date(createdAt).getTime() + ROOM_INVITE_TTL_MS).toISOString();
    const expired = Number(new Date(expiresAt).getTime()) <= now.getTime();
    const rawStatus = ensureString(rawInvite?.status || 'pending').toLowerCase();
    const status = ['pending', 'accepted', 'declined', 'cancelled', 'expired'].includes(rawStatus)
        ? rawStatus
        : 'pending';
    return {
        id,
        fromUserId,
        toUserId,
        roomId,
        status: status === 'pending' && expired ? 'expired' : status,
        createdAt,
        expiresAt,
        respondedAt: toIso(rawInvite?.respondedAt),
    };
};

const sanitizeGift = (rawGift, validUserIds, liveops, now) => {
    const id = ensureString(rawGift?.id);
    const fromUserId = ensureString(rawGift?.fromUserId);
    const toUserId = ensureString(rawGift?.toUserId);
    const type = ensureString(rawGift?.type).toLowerCase();
    if (!id || !fromUserId || !toUserId || !validUserIds.has(fromUserId) || !validUserIds.has(toUserId)) return null;
    if (fromUserId === toUserId) return null;
    if (!['coin', 'case'].includes(type)) return null;
    const amount = clampInt(rawGift?.amount, 0, 0);
    const caseId = ensureString(rawGift?.caseId).toLowerCase();
    if (type === 'coin' && amount <= 0) return null;
    if (type === 'case' && !getCaseById(liveops, caseId)) return null;
    const rawStatus = ensureString(rawGift?.status || 'pending').toLowerCase();
    const status = ['pending', 'claimed'].includes(rawStatus) ? rawStatus : 'pending';
    return {
        id,
        fromUserId,
        toUserId,
        type,
        amount: type === 'coin' ? amount : 0,
        caseId: type === 'case' ? caseId : '',
        note: trimText(rawGift?.note || '', MAX_GIFT_NOTE),
        cost: clampInt(rawGift?.cost, type === 'coin' ? amount : 0, 0),
        createdAt: toIso(rawGift?.createdAt) || now.toISOString(),
        claimedAt: status === 'claimed' ? (toIso(rawGift?.claimedAt) || now.toISOString()) : null,
        status,
    };
};

const sanitizeDirectMessage = (rawMessage, validUserIds, now) => {
    const id = ensureString(rawMessage?.id);
    const fromUserId = ensureString(rawMessage?.fromUserId);
    const toUserId = ensureString(rawMessage?.toUserId);
    const text = trimText(rawMessage?.text || '', MAX_DM_LENGTH);
    if (!id || !fromUserId || !toUserId || !text) return null;
    if (!validUserIds.has(fromUserId) || !validUserIds.has(toUserId)) return null;
    return {
        id,
        fromUserId,
        toUserId,
        text,
        createdAt: toIso(rawMessage?.createdAt) || now.toISOString(),
        readAt: toIso(rawMessage?.readAt),
    };
};

const cleanupRooms = (rooms, invites) => {
    const roomIds = new Set(rooms.map((room) => room.id));
    invites.forEach((invite) => {
        if (invite.status === 'pending' && !roomIds.has(invite.roomId)) {
            invite.status = 'expired';
            invite.respondedAt = new Date().toISOString();
        }
    });
    return rooms.filter((room) => room.memberIds.length > 0);
};

export const normalizeSocialStore = (raw, users = [], liveops, now = new Date()) => {
    const base = createDefaultSocialStore();
    const validUserIds = new Set(users
        .filter((user) => user && typeof user === 'object' && ensureString(user.id))
        .map((user) => user.id));
    const social = raw && typeof raw === 'object' ? raw : {};

    base.rooms = (Array.isArray(social.rooms) ? social.rooms : [])
        .map((room) => sanitizeRoom(room, validUserIds))
        .filter(Boolean);

    const claimedMembership = new Set();
    base.rooms = base.rooms.filter((room) => {
        room.memberIds = room.memberIds.filter((userId) => {
            const key = `${userId}`;
            if (claimedMembership.has(key)) return false;
            claimedMembership.add(key);
            return true;
        });
        if (!room.memberIds.length) return false;
        if (!room.memberIds.includes(room.hostUserId)) room.hostUserId = room.memberIds[0];
        return true;
    });

    const roomIds = new Set(base.rooms.map((room) => room.id));
    base.roomInvites = (Array.isArray(social.roomInvites) ? social.roomInvites : [])
        .map((invite) => sanitizeRoomInvite(invite, validUserIds, roomIds, now))
        .filter(Boolean);
    base.roomInvites = sortByTimeDesc(base.roomInvites).slice(0, 240);
    base.rooms = cleanupRooms(base.rooms, base.roomInvites);

    base.gifts = (Array.isArray(social.gifts) ? social.gifts : [])
        .map((gift) => sanitizeGift(gift, validUserIds, liveops, now))
        .filter(Boolean);
    base.gifts = sortByTimeDesc(base.gifts).slice(0, 320);

    base.directMessages = (Array.isArray(social.directMessages) ? social.directMessages : [])
        .map((message) => sanitizeDirectMessage(message, validUserIds, now))
        .filter(Boolean);
    base.directMessages = sortByTimeDesc(base.directMessages).slice(0, MAX_DIRECT_MESSAGES).reverse();

    return base;
};

export const buildGiftCatalog = (liveops) => {
    const caseOffers = getShopOffers(liveops)
        .filter((offer) => offer && offer.type === 'case' && ensureString(offer.caseId))
        .slice(0, 6);

    const catalog = COIN_GIFT_PRESETS.map((amount) => ({
        key: `coin_${amount}`,
        type: 'coin',
        label: `${amount} FP`,
        amount,
        priceCoin: amount,
        caseId: '',
    }));

    caseOffers.forEach((offer) => {
        catalog.push({
            key: `case_${offer.caseId}`,
            type: 'case',
            label: `${offer.title || offer.caseId}`,
            amount: 0,
            priceCoin: clampInt(offer.priceCoin ?? offer.price, 0, 0),
            caseId: `${offer.caseId || ''}`.trim().toLowerCase(),
        });
    });

    return catalog;
};

const resolveGiftCatalogItem = (liveops, giftKey) => {
    const safeKey = ensureString(giftKey).toLowerCase();
    return buildGiftCatalog(liveops).find((item) => item.key === safeKey) || null;
};

export const findCurrentRoomByUserId = (socialStore, userId) => {
    const safeUserId = ensureString(userId);
    if (!safeUserId) return null;
    return (socialStore?.rooms || []).find((room) => room.memberIds.includes(safeUserId)) || null;
};

export const findRoomByPartyId = (socialStore, partyId) => {
    const safePartyId = ensureString(partyId).toUpperCase();
    if (!safePartyId) return null;
    return (socialStore?.rooms || []).find((room) => ensureString(room.partyId).toUpperCase() === safePartyId) || null;
};

const leaveRoomInternal = (socialStore, userId, now = new Date()) => {
    const room = findCurrentRoomByUserId(socialStore, userId);
    if (!room) return null;
    room.memberIds = room.memberIds.filter((item) => item !== userId);
    room.updatedAt = now.toISOString();
    if (!room.memberIds.length) {
        socialStore.rooms = (socialStore.rooms || []).filter((item) => item.id !== room.id);
        (socialStore.roomInvites || []).forEach((invite) => {
            if (invite.roomId !== room.id || invite.status !== 'pending') return;
            invite.status = 'expired';
            invite.respondedAt = now.toISOString();
        });
        return null;
    }
    if (!room.memberIds.includes(room.hostUserId)) room.hostUserId = room.memberIds[0];
    return room;
};

const ensureUniquePartyId = (socialStore, currentRoomId = '') => {
    const rooms = Array.isArray(socialStore?.rooms) ? socialStore.rooms : [];
    for (let i = 0; i < 32; i += 1) {
        const candidate = randomPartyId();
        if (!rooms.some((room) => room.id !== currentRoomId && room.partyId === candidate)) return candidate;
    }
    return `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`.slice(0, PARTY_ID_LENGTH);
};

const ensureRoomForUser = (socialStore, user, now = new Date(), options = {}) => {
    let room = findCurrentRoomByUserId(socialStore, user.id);
    if (room) {
        room.updatedAt = now.toISOString();
        if (!room.memberIds.includes(user.id)) pushUnique(room.memberIds, user.id);
        if (!room.hostUserId) room.hostUserId = user.id;
        if (!room.partyId) room.partyId = ensureUniquePartyId(socialStore, room.id);
        if (options.visibility) room.visibility = normalizeVisibility(options.visibility, room.visibility || 'private');
        return room;
    }
    room = {
        id: crypto.randomUUID(),
        hostUserId: user.id,
        memberIds: [user.id],
        capacity: ROOM_CAPACITY,
        label: createRoomLabel(user),
        partyId: ensureUniquePartyId(socialStore),
        visibility: normalizeVisibility(options.visibility, 'private'),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
    };
    socialStore.rooms = Array.isArray(socialStore.rooms) ? socialStore.rooms : [];
    socialStore.rooms.push(room);
    return room;
};

const buildRoomPublic = ({ room, usersById, presenceResolver, viewerUserId }) => {
    if (!room) return null;
    const members = room.memberIds
        .map((userId) => usersById.get(userId))
        .filter(Boolean)
        .map((user) => ensureMiniUser(user, presenceResolver))
        .filter(Boolean)
        .sort((a, b) => {
            if (a.userId === room.hostUserId) return -1;
            if (b.userId === room.hostUserId) return 1;
            if (a.online !== b.online) return a.online ? -1 : 1;
            return a.username.localeCompare(b.username, 'en', { sensitivity: 'base' });
        });

    return {
        id: room.id,
        label: room.label,
        partyId: room.partyId,
        visibility: normalizeVisibility(room.visibility, 'private'),
        hostUserId: room.hostUserId,
        capacity: clampInt(room.capacity, ROOM_CAPACITY, 2, ROOM_CAPACITY),
        memberCount: members.length,
        isHost: room.hostUserId === viewerUserId,
        members,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
    };
};

const buildInvitePublic = ({ invite, usersById, socialStore, presenceResolver, viewerUserId }) => {
    const fromUser = usersById.get(invite.fromUserId);
    const room = (socialStore.rooms || []).find((item) => item.id === invite.roomId) || null;
    return {
        id: invite.id,
        roomId: invite.roomId,
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        isOutgoing: invite.fromUserId === viewerUserId,
        from: ensureMiniUser(fromUser, presenceResolver),
        room: buildRoomPublic({ room, usersById, presenceResolver, viewerUserId }),
    };
};

const buildGiftPublic = ({ gift, usersById, liveops, presenceResolver, viewerUserId }) => {
    const fromUser = usersById.get(gift.fromUserId);
    const toUser = usersById.get(gift.toUserId);
    const caseMeta = gift.type === 'case' ? getCaseById(liveops, gift.caseId) : null;
    return {
        id: gift.id,
        type: gift.type,
        status: gift.status,
        amount: gift.amount,
        caseId: gift.caseId || '',
        caseTitle: caseMeta?.title || '',
        label: gift.type === 'coin' ? `${gift.amount} FP` : (caseMeta?.title || gift.caseId || 'Case Gift'),
        note: gift.note || '',
        createdAt: gift.createdAt,
        claimedAt: gift.claimedAt,
        isIncoming: gift.toUserId === viewerUserId,
        from: ensureMiniUser(fromUser, presenceResolver),
        to: ensureMiniUser(toUser, presenceResolver),
    };
};

const buildThreadSummaries = ({ user, usersById, socialStore, presenceResolver }) => {
    const byCounterpart = new Map();
    const rows = Array.isArray(socialStore.directMessages) ? socialStore.directMessages : [];
    rows.forEach((message) => {
        if (message.fromUserId !== user.id && message.toUserId !== user.id) return;
        const counterpartId = message.fromUserId === user.id ? message.toUserId : message.fromUserId;
        const counterpart = usersById.get(counterpartId);
        if (!counterpart) return;
        const previous = byCounterpart.get(counterpartId) || {
            user: ensureMiniUser(counterpart, presenceResolver),
            lastMessageText: '',
            lastMessageAt: '',
            lastSenderId: '',
            unreadCount: 0,
        };
        if (message.toUserId === user.id && !message.readAt) previous.unreadCount += 1;
        if (!previous.lastMessageAt || Number(new Date(message.createdAt).getTime()) >= Number(new Date(previous.lastMessageAt).getTime())) {
            previous.lastMessageAt = message.createdAt;
            previous.lastMessageText = message.text;
            previous.lastSenderId = message.fromUserId;
        }
        byCounterpart.set(counterpartId, previous);
    });
    return Array.from(byCounterpart.values())
        .sort((a, b) => (Number(new Date(b.lastMessageAt).getTime()) || 0) - (Number(new Date(a.lastMessageAt).getTime()) || 0))
        .slice(0, MAX_THREADS);
};

export const buildDirectThread = ({ user, otherUserId, users = [], socialStore, presenceResolver }) => {
    const usersById = new Map(users
        .filter((item) => item && typeof item === 'object' && ensureString(item.id))
        .map((item) => [item.id, item]));
    const counterpart = usersById.get(otherUserId);
    if (!user || !counterpart) {
        return {
            threadUser: null,
            messages: [],
        };
    }
    const messages = (socialStore?.directMessages || [])
        .filter((item) => (
            (item.fromUserId === user.id && item.toUserId === otherUserId)
            || (item.fromUserId === otherUserId && item.toUserId === user.id)
        ))
        .slice(-MAX_THREAD_MESSAGES)
        .map((item) => ({
            id: item.id,
            fromUserId: item.fromUserId,
            toUserId: item.toUserId,
            text: item.text,
            createdAt: item.createdAt,
            readAt: item.readAt,
            isSelf: item.fromUserId === user.id,
            from: ensureMiniUser(usersById.get(item.fromUserId), presenceResolver),
        }));
    return {
        threadUser: ensureMiniUser(counterpart, presenceResolver),
        messages,
    };
};

export const buildSocialSnapshot = ({ user, users = [], socialStore, liveops, presenceResolver }) => {
    const usersById = new Map(users
        .filter((item) => item && typeof item === 'object' && ensureString(item.id))
        .map((item) => [item.id, item]));
    const room = findCurrentRoomByUserId(socialStore, user?.id);
    const incomingInvites = (socialStore?.roomInvites || [])
        .filter((invite) => invite.toUserId === user?.id && invite.status === 'pending')
        .sort((a, b) => (Number(new Date(b.createdAt).getTime()) || 0) - (Number(new Date(a.createdAt).getTime()) || 0))
        .slice(0, MAX_RECENT_INVITES)
        .map((invite) => buildInvitePublic({ invite, usersById, socialStore, presenceResolver, viewerUserId: user?.id }));
    const outgoingInvites = (socialStore?.roomInvites || [])
        .filter((invite) => invite.fromUserId === user?.id && invite.status === 'pending')
        .sort((a, b) => (Number(new Date(b.createdAt).getTime()) || 0) - (Number(new Date(a.createdAt).getTime()) || 0))
        .slice(0, MAX_RECENT_INVITES)
        .map((invite) => buildInvitePublic({ invite, usersById, socialStore, presenceResolver, viewerUserId: user?.id }));
    const giftsInbox = (socialStore?.gifts || [])
        .filter((gift) => gift.toUserId === user?.id)
        .sort((a, b) => (Number(new Date(b.createdAt).getTime()) || 0) - (Number(new Date(a.createdAt).getTime()) || 0))
        .slice(0, MAX_RECENT_GIFTS)
        .map((gift) => buildGiftPublic({ gift, usersById, liveops, presenceResolver, viewerUserId: user?.id }));
    const giftsSent = (socialStore?.gifts || [])
        .filter((gift) => gift.fromUserId === user?.id)
        .sort((a, b) => (Number(new Date(b.createdAt).getTime()) || 0) - (Number(new Date(a.createdAt).getTime()) || 0))
        .slice(0, MAX_RECENT_GIFTS)
        .map((gift) => buildGiftPublic({ gift, usersById, liveops, presenceResolver, viewerUserId: user?.id }));
    const threads = buildThreadSummaries({ user, usersById, socialStore, presenceResolver });
    const unreadCount = threads.reduce((acc, item) => acc + clampInt(item.unreadCount, 0, 0), 0);

    return {
        squad: {
            room: buildRoomPublic({ room, usersById, presenceResolver, viewerUserId: user?.id }),
            incomingInvites,
            outgoingInvites,
            capacity: ROOM_CAPACITY,
        },
        gifts: {
            catalog: buildGiftCatalog(liveops),
            inbox: giftsInbox,
            sent: giftsSent,
            claimableCount: giftsInbox.filter((item) => item.status === 'pending').length,
        },
        messages: {
            threads,
            unreadCount,
        },
    };
};

export const sendSquadInvite = ({ socialStore, fromUser, toUser, now = new Date() }) => {
    if (!fromUser || !toUser) return { ok: false, reason: 'user-not-found' };
    if (fromUser.id === toUser.id) return { ok: false, reason: 'cannot-invite-self' };
    if (!areUsersFriends(fromUser, toUser)) return { ok: false, reason: 'friends-only' };
    const room = ensureRoomForUser(socialStore, fromUser, now);
    if (room.memberIds.includes(toUser.id)) return { ok: true, reason: 'already-in-room', roomId: room.id };
    if (room.memberIds.length >= clampInt(room.capacity, ROOM_CAPACITY, 2, ROOM_CAPACITY)) {
        return { ok: false, reason: 'room-full' };
    }
    const existing = (socialStore.roomInvites || []).find((invite) => (
        invite.status === 'pending'
        && invite.fromUserId === fromUser.id
        && invite.toUserId === toUser.id
        && invite.roomId === room.id
    ));
    if (existing) return { ok: true, reason: 'already-pending', inviteId: existing.id, roomId: room.id };

    socialStore.roomInvites = Array.isArray(socialStore.roomInvites) ? socialStore.roomInvites : [];
    socialStore.roomInvites.forEach((invite) => {
        if (invite.status !== 'pending') return;
        if (invite.fromUserId === fromUser.id && invite.toUserId === toUser.id) {
            invite.status = 'cancelled';
            invite.respondedAt = now.toISOString();
        }
    });

    const created = {
        id: crypto.randomUUID(),
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        roomId: room.id,
        status: 'pending',
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ROOM_INVITE_TTL_MS).toISOString(),
        respondedAt: null,
    };
    socialStore.roomInvites.push(created);
    room.updatedAt = now.toISOString();
    return { ok: true, reason: 'invite-sent', inviteId: created.id, roomId: room.id };
};

export const createSquadRoom = ({ socialStore, user, visibility = 'private', now = new Date(), forceNew = false }) => {
    if (!user) return { ok: false, reason: 'user-not-found' };
    if (forceNew) leaveRoomInternal(socialStore, user.id, now);
    const room = ensureRoomForUser(socialStore, user, now, { visibility });
    room.visibility = normalizeVisibility(visibility, room.visibility || 'private');
    room.updatedAt = now.toISOString();
    return {
        ok: true,
        reason: forceNew ? 'room-created-new' : 'room-ready',
        roomId: room.id,
        partyId: room.partyId,
        visibility: room.visibility,
    };
};

export const setSquadRoomVisibility = ({ socialStore, userId, visibility = 'private', now = new Date() }) => {
    const room = findCurrentRoomByUserId(socialStore, userId);
    if (!room) return { ok: false, reason: 'room-not-found' };
    if (room.hostUserId !== userId) return { ok: false, reason: 'host-only' };
    room.visibility = normalizeVisibility(visibility, room.visibility || 'private');
    room.updatedAt = now.toISOString();
    return {
        ok: true,
        reason: 'visibility-updated',
        roomId: room.id,
        partyId: room.partyId,
        visibility: room.visibility,
    };
};

export const joinSquadRoomByPartyId = ({ socialStore, user, partyId, now = new Date() }) => {
    if (!user) return { ok: false, reason: 'user-not-found' };
    const room = findRoomByPartyId(socialStore, partyId);
    if (!room) return { ok: false, reason: 'party-not-found' };
    if (room.memberIds.includes(user.id)) {
        room.updatedAt = now.toISOString();
        return { ok: true, reason: 'already-in-room', roomId: room.id, partyId: room.partyId };
    }
    if (room.memberIds.length >= clampInt(room.capacity, ROOM_CAPACITY, 2, ROOM_CAPACITY)) {
        return { ok: false, reason: 'room-full' };
    }
    leaveRoomInternal(socialStore, user.id, now);
    pushUnique(room.memberIds, user.id);
    room.updatedAt = now.toISOString();
    (socialStore.roomInvites || []).forEach((invite) => {
        if (invite.status !== 'pending') return;
        if (invite.toUserId !== user.id) return;
        invite.status = 'expired';
        invite.respondedAt = now.toISOString();
    });
    return {
        ok: true,
        reason: 'joined-room',
        roomId: room.id,
        partyId: room.partyId,
        visibility: room.visibility,
    };
};

export const respondSquadInvite = ({ socialStore, inviteId, actorUser, action, now = new Date() }) => {
    const safeInviteId = ensureString(inviteId);
    const safeAction = ensureString(action).toLowerCase();
    const invite = (socialStore?.roomInvites || []).find((item) => item.id === safeInviteId);
    if (!invite) return { ok: false, reason: 'invite-not-found' };
    if (invite.status !== 'pending') return { ok: false, reason: 'invite-not-pending' };
    const actorId = ensureString(actorUser?.id);
    if (!actorId) return { ok: false, reason: 'user-not-found' };

    if (safeAction === 'cancel') {
        if (invite.fromUserId !== actorId) return { ok: false, reason: 'not-invite-owner' };
        invite.status = 'cancelled';
        invite.respondedAt = now.toISOString();
        return { ok: true, reason: 'cancelled' };
    }

    if (invite.toUserId !== actorId) return { ok: false, reason: 'not-invite-target' };

    if (safeAction === 'decline') {
        invite.status = 'declined';
        invite.respondedAt = now.toISOString();
        return { ok: true, reason: 'declined' };
    }

    if (safeAction !== 'accept') return { ok: false, reason: 'invalid-action' };

    const room = (socialStore.rooms || []).find((item) => item.id === invite.roomId);
    if (!room) {
        invite.status = 'expired';
        invite.respondedAt = now.toISOString();
        return { ok: false, reason: 'room-expired' };
    }

    if (!room.memberIds.includes(actorId) && room.memberIds.length >= clampInt(room.capacity, ROOM_CAPACITY, 2, ROOM_CAPACITY)) {
        return { ok: false, reason: 'room-full' };
    }

    leaveRoomInternal(socialStore, actorId, now);
    pushUnique(room.memberIds, actorId);
    if (!room.hostUserId) room.hostUserId = invite.fromUserId;
    room.updatedAt = now.toISOString();
    invite.status = 'accepted';
    invite.respondedAt = now.toISOString();
    (socialStore.roomInvites || []).forEach((item) => {
        if (item.status !== 'pending') return;
        if (item.toUserId !== actorId) return;
        if (item.id === invite.id) return;
        item.status = 'expired';
        item.respondedAt = now.toISOString();
    });
    return { ok: true, reason: 'joined-room', roomId: room.id };
};

export const leaveSquadRoom = ({ socialStore, userId, now = new Date() }) => {
    const room = leaveRoomInternal(socialStore, ensureString(userId), now);
    return {
        ok: true,
        reason: room ? 'left-room' : 'room-cleared',
    };
};

export const sendFriendGift = ({ socialStore, fromUser, toUser, giftKey, note = '', liveops, now = new Date() }) => {
    if (!fromUser || !toUser) return { ok: false, reason: 'user-not-found' };
    if (fromUser.id === toUser.id) return { ok: false, reason: 'cannot-gift-self' };
    if (!areUsersFriends(fromUser, toUser)) return { ok: false, reason: 'friends-only' };
    const giftDef = resolveGiftCatalogItem(liveops, giftKey);
    if (!giftDef) return { ok: false, reason: 'gift-not-found' };
    const cost = clampInt(giftDef.priceCoin, 0, 0);
    if (clampInt(fromUser.wallet, 0, 0) < cost) return { ok: false, reason: 'insufficient-wallet' };

    fromUser.wallet = clampInt(fromUser.wallet, 0, 0) - cost;
    const created = {
        id: crypto.randomUUID(),
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        type: giftDef.type,
        amount: giftDef.type === 'coin' ? clampInt(giftDef.amount, 0, 1) : 0,
        caseId: giftDef.type === 'case' ? giftDef.caseId : '',
        note: trimText(note, MAX_GIFT_NOTE),
        cost,
        status: 'pending',
        createdAt: now.toISOString(),
        claimedAt: null,
    };
    socialStore.gifts = Array.isArray(socialStore.gifts) ? socialStore.gifts : [];
    socialStore.gifts.push(created);
    return {
        ok: true,
        reason: 'gift-sent',
        gift: clone(created),
        charged: cost,
    };
};

export const claimFriendGift = ({ socialStore, user, giftId, liveops, now = new Date() }) => {
    const safeGiftId = ensureString(giftId);
    const gift = (socialStore?.gifts || []).find((item) => item.id === safeGiftId);
    if (!gift || gift.toUserId !== user?.id) return { ok: false, reason: 'gift-not-found' };
    if (gift.status !== 'pending') return { ok: false, reason: 'gift-not-pending' };

    if (gift.type === 'coin') {
        user.wallet = clampInt(user.wallet, 0, 0) + clampInt(gift.amount, 0, 0);
    } else {
        const caseId = ensureString(gift.caseId).toLowerCase();
        if (!getCaseById(liveops, caseId)) return { ok: false, reason: 'gift-invalid' };
        if (!user.inventory || typeof user.inventory !== 'object') user.inventory = { cases: {}, skins: [], skinMeta: {}, equipped: {} };
        if (!user.inventory.cases || typeof user.inventory.cases !== 'object') user.inventory.cases = {};
        user.inventory.cases[caseId] = clampInt(user.inventory.cases[caseId], 0, 0) + 1;
    }

    gift.status = 'claimed';
    gift.claimedAt = now.toISOString();
    return {
        ok: true,
        reason: 'gift-claimed',
        gift: clone(gift),
    };
};

export const sendDirectMessage = ({ socialStore, fromUser, toUser, text, now = new Date() }) => {
    if (!fromUser || !toUser) return { ok: false, reason: 'user-not-found' };
    if (fromUser.id === toUser.id) return { ok: false, reason: 'cannot-message-self' };
    if (!areUsersFriends(fromUser, toUser)) return { ok: false, reason: 'friends-only' };
    const finalText = trimText(text, MAX_DM_LENGTH);
    if (!finalText) return { ok: false, reason: 'empty-message' };
    socialStore.directMessages = Array.isArray(socialStore.directMessages) ? socialStore.directMessages : [];
    const created = {
        id: crypto.randomUUID(),
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        text: finalText,
        createdAt: now.toISOString(),
        readAt: null,
    };
    socialStore.directMessages.push(created);
    return {
        ok: true,
        reason: 'message-sent',
        message: clone(created),
    };
};

export const markDirectThreadRead = ({ socialStore, userId, otherUserId, now = new Date() }) => {
    (socialStore?.directMessages || []).forEach((message) => {
        if (message.toUserId !== userId) return;
        if (message.fromUserId !== otherUserId) return;
        if (message.readAt) return;
        message.readAt = now.toISOString();
    });
};
