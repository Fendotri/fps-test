const clone = (value) => JSON.parse(JSON.stringify(value));

const cleanIdList = (value, selfId = '') => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
        .map((item) => `${item || ''}`.trim())
        .filter((item) => !!item && item !== selfId)
        .filter((item) => {
            if (seen.has(item)) return false;
            seen.add(item);
            return true;
        });
};

const sortByUsername = (rows) => rows.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return `${a.username || ''}`.localeCompare(`${b.username || ''}`, 'en', { sensitivity: 'base' });
});

const removeId = (list, targetId) => list.filter((item) => item !== targetId);

const pushUnique = (list, value) => {
    if (!value || list.includes(value)) return;
    list.push(value);
};

export const createDefaultFriendState = () => ({
    friends: [],
    incoming: [],
    outgoing: [],
});

export const buildEmptyFriendsSnapshot = () => ({
    friends: [],
    incoming: [],
    outgoing: [],
    counts: {
        friends: 0,
        incoming: 0,
        outgoing: 0,
        online: 0,
    },
});

export const sanitizeFriendState = (raw, selfId = '') => {
    const base = createDefaultFriendState();
    if (!raw || typeof raw !== 'object') return base;

    return {
        friends: cleanIdList(raw.friends, selfId),
        incoming: cleanIdList(raw.incoming, selfId),
        outgoing: cleanIdList(raw.outgoing, selfId),
    };
};

const ensureFriendState = (user) => {
    if (!user || typeof user !== 'object') return createDefaultFriendState();
    user.friends = sanitizeFriendState(user.friends, `${user.id || ''}`.trim());
    return user.friends;
};

const clearRelationship = (state, targetId) => {
    state.friends = removeId(state.friends, targetId);
    state.incoming = removeId(state.incoming, targetId);
    state.outgoing = removeId(state.outgoing, targetId);
};

const makeFriends = (leftUser, rightUser) => {
    const left = ensureFriendState(leftUser);
    const right = ensureFriendState(rightUser);
    clearRelationship(left, rightUser.id);
    clearRelationship(right, leftUser.id);
    pushUnique(left.friends, rightUser.id);
    pushUnique(right.friends, leftUser.id);
};

const buildFriendEntry = ({ targetUser, relation, presenceResolver }) => {
    const cosmetics = targetUser?.progression?.cosmetics || {};
    const presence = typeof presenceResolver === 'function'
        ? (presenceResolver(targetUser?.id) || {})
        : {};
    return {
        userId: targetUser.id,
        username: targetUser.username,
        title: `${cosmetics.title || 'Rookie'}`,
        nameColor: `${cosmetics.nameColor || 'default'}`,
        avatar: `${cosmetics.avatar || 'rookie_ops'}`,
        avatarFrame: `${cosmetics.avatarFrame || 'default'}`,
        premier: targetUser?.premier || null,
        relation,
        online: !!presence.online,
        lastSeenAt: presence.lastSeenAt || null,
    };
};

export const reconcileFriendGraph = (users = []) => {
    const byId = new Map();
    users.forEach((user) => {
        if (!user || typeof user !== 'object') return;
        const userId = `${user.id || ''}`.trim();
        if (!userId) return;
        ensureFriendState(user);
        byId.set(userId, user);
    });

    byId.forEach((user, userId) => {
        const state = ensureFriendState(user);
        state.friends = state.friends.filter((id) => byId.has(id) && id !== userId);
        state.incoming = state.incoming.filter((id) => byId.has(id) && id !== userId);
        state.outgoing = state.outgoing.filter((id) => byId.has(id) && id !== userId);
    });

    byId.forEach((user) => {
        const state = ensureFriendState(user);

        state.friends.forEach((targetId) => {
            const target = byId.get(targetId);
            if (!target) return;
            const targetState = ensureFriendState(target);
            clearRelationship(targetState, user.id);
            pushUnique(targetState.friends, user.id);
        });

        state.outgoing.forEach((targetId) => {
            const target = byId.get(targetId);
            if (!target) return;
            const targetState = ensureFriendState(target);
            if (targetState.friends.includes(user.id)) {
                state.outgoing = removeId(state.outgoing, targetId);
                targetState.incoming = removeId(targetState.incoming, user.id);
                return;
            }
            pushUnique(targetState.incoming, user.id);
        });

        state.incoming.forEach((targetId) => {
            const target = byId.get(targetId);
            if (!target) return;
            const targetState = ensureFriendState(target);
            if (targetState.friends.includes(user.id)) {
                state.incoming = removeId(state.incoming, targetId);
                targetState.outgoing = removeId(targetState.outgoing, user.id);
                return;
            }
            pushUnique(targetState.outgoing, user.id);
        });
    });
};

export const buildFriendsSnapshot = ({ user, users = [], presenceResolver }) => {
    if (!user || typeof user !== 'object') return buildEmptyFriendsSnapshot();

    const byId = new Map(users
        .filter((item) => item && typeof item === 'object' && `${item.id || ''}`.trim())
        .map((item) => [item.id, item]));
    const state = sanitizeFriendState(user.friends, user.id);

    const friends = state.friends
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((targetUser) => buildFriendEntry({ targetUser, relation: 'friend', presenceResolver }));

    const incoming = state.incoming
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((targetUser) => buildFriendEntry({ targetUser, relation: 'incoming', presenceResolver }));

    const outgoing = state.outgoing
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((targetUser) => buildFriendEntry({ targetUser, relation: 'outgoing', presenceResolver }));

    sortByUsername(friends);
    sortByUsername(incoming);
    sortByUsername(outgoing);

    return {
        friends,
        incoming,
        outgoing,
        counts: {
            friends: friends.length,
            incoming: incoming.length,
            outgoing: outgoing.length,
            online: friends.filter((item) => item.online).length,
        },
    };
};

export const searchFriendCandidates = ({ user, users = [], query = '', limit = 8, presenceResolver }) => {
    const safeQuery = `${query || ''}`.trim().toLowerCase();
    if (!safeQuery) return [];
    const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 8)));
    const state = sanitizeFriendState(user?.friends, user?.id);

    const rows = users
        .filter((candidate) => candidate && candidate.id !== user?.id)
        .filter((candidate) => `${candidate.usernameLower || candidate.username || ''}`.includes(safeQuery))
        .map((targetUser) => {
            let relation = 'none';
            if (state.friends.includes(targetUser.id)) relation = 'friend';
            else if (state.incoming.includes(targetUser.id)) relation = 'incoming';
            else if (state.outgoing.includes(targetUser.id)) relation = 'outgoing';
            return buildFriendEntry({ targetUser, relation, presenceResolver });
        })
        .sort((a, b) => {
            const aExact = a.username.toLowerCase() === safeQuery ? 1 : 0;
            const bExact = b.username.toLowerCase() === safeQuery ? 1 : 0;
            if (aExact !== bExact) return bExact - aExact;
            const aStarts = a.username.toLowerCase().startsWith(safeQuery) ? 1 : 0;
            const bStarts = b.username.toLowerCase().startsWith(safeQuery) ? 1 : 0;
            if (aStarts !== bStarts) return bStarts - aStarts;
            if (a.online !== b.online) return a.online ? -1 : 1;
            return a.username.localeCompare(b.username, 'en', { sensitivity: 'base' });
        });

    return rows.slice(0, safeLimit);
};

export const sendFriendRequest = ({ fromUser, toUser }) => {
    if (!fromUser || !toUser) return { ok: false, reason: 'user-not-found' };
    if (fromUser.id === toUser.id) return { ok: false, reason: 'cannot-add-self' };

    const from = ensureFriendState(fromUser);
    const to = ensureFriendState(toUser);

    if (from.friends.includes(toUser.id) || to.friends.includes(fromUser.id)) {
        makeFriends(fromUser, toUser);
        return { ok: true, reason: 'already-friends', status: 'friends' };
    }
    if (from.outgoing.includes(toUser.id)) return { ok: true, reason: 'already-pending', status: 'outgoing' };

    if (from.incoming.includes(toUser.id) || to.outgoing.includes(fromUser.id)) {
        makeFriends(fromUser, toUser);
        return { ok: true, reason: 'accepted', status: 'friends' };
    }

    pushUnique(from.outgoing, toUser.id);
    pushUnique(to.incoming, fromUser.id);
    return { ok: true, reason: 'requested', status: 'outgoing' };
};

export const acceptFriendRequest = ({ user, requester }) => {
    if (!user || !requester) return { ok: false, reason: 'user-not-found' };
    const state = ensureFriendState(user);
    const requesterState = ensureFriendState(requester);

    if (state.friends.includes(requester.id) || requesterState.friends.includes(user.id)) {
        makeFriends(user, requester);
        return { ok: true, reason: 'already-friends', status: 'friends' };
    }
    if (!state.incoming.includes(requester.id) && !requesterState.outgoing.includes(user.id)) {
        return { ok: false, reason: 'request-not-found' };
    }

    makeFriends(user, requester);
    return { ok: true, reason: 'accepted', status: 'friends' };
};

export const declineFriendRequest = ({ user, requester }) => {
    if (!user || !requester) return { ok: false, reason: 'user-not-found' };
    const state = ensureFriendState(user);
    const requesterState = ensureFriendState(requester);
    state.incoming = removeId(state.incoming, requester.id);
    requesterState.outgoing = removeId(requesterState.outgoing, user.id);
    return { ok: true, reason: 'declined' };
};

export const cancelFriendRequest = ({ user, target }) => {
    if (!user || !target) return { ok: false, reason: 'user-not-found' };
    const state = ensureFriendState(user);
    const targetState = ensureFriendState(target);
    state.outgoing = removeId(state.outgoing, target.id);
    targetState.incoming = removeId(targetState.incoming, user.id);
    return { ok: true, reason: 'cancelled' };
};

export const removeFriend = ({ user, target }) => {
    if (!user || !target) return { ok: false, reason: 'user-not-found' };
    const state = ensureFriendState(user);
    const targetState = ensureFriendState(target);
    clearRelationship(state, target.id);
    clearRelationship(targetState, user.id);
    return { ok: true, reason: 'removed' };
};

export const cloneFriendState = (state) => clone(sanitizeFriendState(state));
