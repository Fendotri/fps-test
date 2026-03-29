import { WebSocketServer } from 'ws';
import { parseBearerToken, verifyToken } from './auth.mjs';

const safeJsonParse = (payload) => {
    try {
        return JSON.parse(payload);
    } catch {
        return null;
    }
};

const nowMs = () => Date.now();

/**
 * Multiplayer-ready websocket foundation.
 * Current feature set: auth, room join and state broadcast loop for FFA.
 */
export const attachRealtimeGateway = ({ server, config, db }) => {
    const rooms = new Map();
    const clients = new Map();

    const wss = new WebSocketServer({ noServer: true });

    const ensureRoom = (roomId) => {
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                createdAt: nowMs(),
                players: new Map(),
                state: {
                    tick: 0,
                    players: {},
                    runtimeBots: null,
                    runtimeBotsVersion: 0,
                },
            });
        }
        return rooms.get(roomId);
    };

    const leaveRoom = (ws) => {
        const meta = clients.get(ws);
        if (!meta || !meta.roomId) return;
        const room = rooms.get(meta.roomId);
        if (!room) return;
        room.players.delete(meta.userId);
        delete room.state.players[meta.userId];
        if (room.players.size === 0) rooms.delete(meta.roomId);
    };

    const broadcastRoomState = () => {
        rooms.forEach((room) => {
            room.state.tick += 1;
            const payload = JSON.stringify({
                type: 'state',
                roomId: room.id,
                tick: room.state.tick,
                players: room.state.players,
                runtimeBots: room.state.runtimeBots,
                runtimeBotsVersion: room.state.runtimeBotsVersion,
                serverTime: nowMs(),
            });

            room.players.forEach((socket) => {
                if (socket.readyState === socket.OPEN) socket.send(payload);
            });
        });
    };

    const tickInterval = Math.max(5, Math.floor(1000 / Math.max(1, config.wsTickRate)));
    const timer = setInterval(broadcastRoomState, tickInterval);

    wss.on('connection', (ws, request, clientInfo) => {
        const { userId, username } = clientInfo;
        clients.set(ws, { userId, username, roomId: null, lastInputAt: null });

        ws.send(JSON.stringify({
            type: 'welcome',
            userId,
            username,
            tickRate: config.wsTickRate,
        }));

        ws.on('message', (raw) => {
            const data = safeJsonParse(raw.toString('utf8'));
            if (!data || typeof data !== 'object') return;

            const meta = clients.get(ws);
            if (!meta) return;

            if (data.type === 'join_ffa') {
                const roomId = typeof data.roomId === 'string' && data.roomId ? data.roomId : 'ffa-main';
                leaveRoom(ws);
                const room = ensureRoom(roomId);
                room.players.set(meta.userId, ws);
                room.state.players[meta.userId] = room.state.players[meta.userId] || {
                    username: meta.username,
                    x: 0,
                    y: 0,
                    z: 0,
                    hp: 100,
                    armor: 100,
                    hasHelmet: true,
                    yaw: 0,
                    pitch: 0,
                    fireSeq: 0,
                    weaponId: '',
                };
                meta.roomId = roomId;
                ws.send(JSON.stringify({ type: 'joined', roomId }));
                return;
            }

            if (data.type === 'player_input') {
                if (!meta.roomId) return;
                const room = rooms.get(meta.roomId);
                if (!room) return;
                meta.lastInputAt = nowMs();
                const playerState = room.state.players[meta.userId] || {
                    username: meta.username,
                    x: 0,
                    y: 0,
                    z: 0,
                    hp: 100,
                    armor: 100,
                    hasHelmet: true,
                    yaw: 0,
                    pitch: 0,
                    fireSeq: 0,
                    weaponId: '',
                };
                if (typeof data.x === 'number') playerState.x = data.x;
                if (typeof data.y === 'number') playerState.y = data.y;
                if (typeof data.z === 'number') playerState.z = data.z;
                if (typeof data.hp === 'number') playerState.hp = data.hp;
                if (typeof data.armor === 'number') playerState.armor = data.armor;
                if (typeof data.hasHelmet === 'boolean') playerState.hasHelmet = data.hasHelmet;
                if (typeof data.yaw === 'number') playerState.yaw = data.yaw;
                if (typeof data.pitch === 'number') playerState.pitch = data.pitch;
                if (typeof data.fireSeq === 'number') playerState.fireSeq = data.fireSeq;
                if (typeof data.weaponId === 'string') playerState.weaponId = data.weaponId;
                room.state.players[meta.userId] = playerState;
                return;
            }

            if (data.type === 'player_respawn') {
                if (!meta.roomId) return;
                const room = rooms.get(meta.roomId);
                if (!room) return;
                const playerState = room.state.players[meta.userId];
                if (!playerState) return;
                playerState.hp = 100;
                playerState.armor = 100;
                playerState.hasHelmet = true;
                if (typeof data.x === 'number') playerState.x = data.x;
                if (typeof data.y === 'number') playerState.y = data.y;
                if (typeof data.z === 'number') playerState.z = data.z;
                room.state.players[meta.userId] = playerState;
                return;
            }

            if (data.type === 'runtime_tuning') {
                if (!meta.roomId) return;
                const room = rooms.get(meta.roomId);
                if (!room) return;
                const payload = data?.bots;
                if (!payload || typeof payload !== 'object') return;
                room.state.runtimeBots = payload;
                room.state.runtimeBotsVersion = nowMs();
                return;
            }

            if (data.type === 'player_hit') {
                if (!meta.roomId) return;
                const room = rooms.get(meta.roomId);
                if (!room) return;
                const targetId = typeof data.targetId === 'string' ? data.targetId : '';
                if (!targetId || targetId === meta.userId) return;
                const targetSocket = room.players.get(targetId);
                const targetState = room.state.players[targetId];
                if (!targetSocket || !targetState || (Number(targetState.hp) || 0) <= 0) return;

                const hpDamage = Math.max(1, Math.floor(Number(data.damage) || 0));
                const armorDamage = Math.max(0, Math.floor(Number(data.armorDamage) || 0));
                targetState.armor = Math.max(0, (Number(targetState.armor) || 0) - armorDamage);
                targetState.hp = Math.max(0, (Number(targetState.hp) || 0) - hpDamage);
                if (targetState.armor <= 0) targetState.hasHelmet = false;
                const killed = targetState.hp <= 0;
                room.state.players[targetId] = targetState;

                if (targetSocket.readyState === targetSocket.OPEN) {
                    targetSocket.send(JSON.stringify({
                        type: 'damage_taken',
                        attackerId: meta.userId,
                        attackerName: typeof data.attackerName === 'string' && data.attackerName ? data.attackerName : meta.username,
                        weaponId: typeof data.weaponId === 'string' ? data.weaponId : '',
                        weaponName: typeof data.weaponName === 'string' ? data.weaponName : (typeof data.weaponId === 'string' ? data.weaponId : 'RIFLE'),
                        damage: hpDamage,
                        armorDamage,
                        headshot: data.headshot === true,
                        health: targetState.hp,
                        armor: targetState.armor,
                        attackerX: room.state.players[meta.userId]?.x || 0,
                        attackerY: room.state.players[meta.userId]?.y || 0,
                        attackerZ: room.state.players[meta.userId]?.z || 0,
                    }));
                }

                if (killed) {
                    const deathPayload = JSON.stringify({
                        type: 'player_died',
                        targetId,
                        attackerId: meta.userId,
                        attackerName: typeof data.attackerName === 'string' && data.attackerName ? data.attackerName : meta.username,
                        weaponId: typeof data.weaponId === 'string' ? data.weaponId : '',
                        weaponName: typeof data.weaponName === 'string' ? data.weaponName : (typeof data.weaponId === 'string' ? data.weaponId : 'RIFLE'),
                        headshot: data.headshot === true,
                        x: targetState.x || 0,
                        y: targetState.y || 0,
                        z: targetState.z || 0,
                        yaw: targetState.yaw || 0,
                    });
                    room.players.forEach((socket) => {
                        if (socket.readyState === socket.OPEN) socket.send(deathPayload);
                    });
                }
                return;
            }

            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', ts: nowMs() }));
            }
        });

        ws.on('close', () => {
            leaveRoom(ws);
            clients.delete(ws);
        });
    });

    server.on('upgrade', (request, socket, head) => {
        try {
            const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
            if (url.pathname !== '/ws') return;

            const authHeader = request.headers.authorization;
            const tokenFromHeader = parseBearerToken(authHeader);
            const tokenFromQuery = url.searchParams.get('token');
            const token = tokenFromHeader || tokenFromQuery;
            const payload = verifyToken(token, config.authSecret);
            if (!payload || !payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            const data = db.read();
            const user = data.users.find((item) => item.id === payload.sub);
            if (!user) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            if (Number(user.tokenVersion) !== Number(payload.ver || 0)) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, { userId: user.id, username: user.username });
            });
        } catch {
            socket.destroy();
        }
    });

    return {
        close: () => {
            clearInterval(timer);
            wss.clients.forEach((client) => client.close());
        },
    };
};

