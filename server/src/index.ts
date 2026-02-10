import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  ClientMessage,
  ServerMessage,
  MarbleConfig,
  TICK_RATE,
  SYNC_RATE,
} from '../../shared/types.js';
import {
  createLobby,
  joinLobby,
  leaveLobby,
  addBot,
  removeBot,
  getLobby,
  getPlayerLobby,
  setLobbyState,
  setTrackSeed,
} from './lobby.js';
import { createServerRace, generateTrackServer, ServerRace } from './race.js';

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({ logger: true });

// Track connected clients
const clients = new Map<string, WebSocket>(); // playerId -> WebSocket
const activeRaces = new Map<string, { race: ServerRace; interval: NodeJS.Timeout }>(); // lobbyCode -> race

async function start() {
  await fastify.register(cors, {
    origin: true,
  });

  await fastify.register(websocket);

  // Health check
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // WebSocket endpoint
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, req) => {
      const playerId = `player_${Math.random().toString(36).substring(2, 10)}`;
      clients.set(playerId, socket);
      console.log(`[WS] Player connected: ${playerId}`);

      socket.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as ClientMessage;
          handleMessage(playerId, socket, msg);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
          sendTo(socket, { type: 'error', message: 'Invalid message format' });
        }
      });

      socket.on('close', () => {
        console.log(`[WS] Player disconnected: ${playerId}`);
        handleDisconnect(playerId);
        clients.delete(playerId);
      });

      socket.on('error', (err: Error) => {
        console.error(`[WS] Error for ${playerId}:`, err);
      });
    });
  });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Server running on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

function sendTo(socket: WebSocket, msg: ServerMessage) {
  if (socket.readyState === 1) { // WebSocket.OPEN
    socket.send(JSON.stringify(msg));
  }
}

function broadcastToLobby(lobbyCode: string, msg: ServerMessage, excludeId?: string) {
  const lobby = getLobby(lobbyCode);
  if (!lobby) return;

  for (const player of lobby.players) {
    if (player.isBot) continue;
    if (player.id === excludeId) continue;
    const ws = clients.get(player.id);
    if (ws) sendTo(ws, msg);
  }
}

function handleMessage(playerId: string, socket: WebSocket, msg: ClientMessage) {
  switch (msg.type) {
    case 'create_lobby': {
      const lobby = createLobby(playerId, msg.playerName, msg.marbleName, msg.marbleColor);
      sendTo(socket, { type: 'lobby_created', lobby, playerId });
      break;
    }

    case 'join_lobby': {
      const lobby = joinLobby(msg.code.toUpperCase(), playerId, msg.playerName, msg.marbleName, msg.marbleColor);
      if (!lobby) {
        sendTo(socket, { type: 'error', message: 'Lobby not found, full, or already racing.' });
        return;
      }
      sendTo(socket, { type: 'lobby_joined', lobby, playerId });
      broadcastToLobby(lobby.code, { type: 'lobby_updated', lobby }, playerId);
      break;
    }

    case 'add_bot': {
      const playerLobby = getPlayerLobby(playerId);
      if (!playerLobby || playerLobby.hostId !== playerId) {
        sendTo(socket, { type: 'error', message: 'Only the host can add bots.' });
        return;
      }
      const updated = addBot(playerLobby.code, msg.botName, msg.botColor);
      if (updated) {
        broadcastToLobby(updated.code, { type: 'lobby_updated', lobby: updated });
        sendTo(socket, { type: 'lobby_updated', lobby: updated });
      }
      break;
    }

    case 'remove_bot': {
      const playerLobby2 = getPlayerLobby(playerId);
      if (!playerLobby2 || playerLobby2.hostId !== playerId) {
        sendTo(socket, { type: 'error', message: 'Only the host can remove bots.' });
        return;
      }
      const updated2 = removeBot(playerLobby2.code, msg.botId);
      if (updated2) {
        broadcastToLobby(updated2.code, { type: 'lobby_updated', lobby: updated2 });
        sendTo(socket, { type: 'lobby_updated', lobby: updated2 });
      }
      break;
    }

    case 'start_race': {
      const playerLobby3 = getPlayerLobby(playerId);
      if (!playerLobby3 || playerLobby3.hostId !== playerId) {
        sendTo(socket, { type: 'error', message: 'Only the host can start the race.' });
        return;
      }
      if (playerLobby3.players.length < 2) {
        sendTo(socket, { type: 'error', message: 'Need at least 2 marbles to race.' });
        return;
      }

      const gravityScale = msg.gravityScale ?? 0.0004;
      const seed = Math.floor(Math.random() * 999999);
      setTrackSeed(playerLobby3.code, seed);
      setLobbyState(playerLobby3.code, 'racing');

      // Generate track on server — this is the authoritative track
      const track = generateTrackServer(seed);

      const marbleConfigs: MarbleConfig[] = playerLobby3.players.map(p => ({
        id: p.id,
        name: p.marbleName,
        color: p.marbleColor,
        isBot: p.isBot,
        ownerId: p.isBot ? undefined : p.id,
      }));

      // Broadcast race start to all players
      const raceStartMsg: ServerMessage = {
        type: 'race_start',
        trackSeed: seed,
        marbles: marbleConfigs,
        gravityScale,
      };
      broadcastToLobby(playerLobby3.code, raceStartMsg);
      sendTo(socket, raceStartMsg);

      // Start server-side simulation with the same track
      const race = createServerRace(playerLobby3, track, gravityScale);
      const tickInterval = 1000 / TICK_RATE;
      let tickCount = 0;
      const ticksPerSync = Math.round(TICK_RATE / SYNC_RATE);

      const interval = setInterval(() => {
        race.tick();
        tickCount++;

        // Send state at sync rate
        if (tickCount % ticksPerSync === 0) {
          const raceState = race.getState();
          const stateMsg: ServerMessage = { type: 'race_state', state: raceState };
          broadcastToLobby(playerLobby3.code, stateMsg);
          sendTo(socket, stateMsg);
        }

        // Check if finished
        if (race.isFinished()) {
          const finalState = race.getState();
          const resultsMsg: ServerMessage = {
            type: 'race_finished',
            results: finalState.results,
          };
          broadcastToLobby(playerLobby3.code, resultsMsg);
          sendTo(socket, resultsMsg);

          clearInterval(interval);
          race.destroy();
          activeRaces.delete(playerLobby3.code);
          setLobbyState(playerLobby3.code, 'results');
        }
      }, tickInterval);

      activeRaces.set(playerLobby3.code, { race, interval });
      break;
    }

    case 'leave_lobby': {
      handleDisconnect(playerId);
      break;
    }
  }
}

function handleDisconnect(playerId: string) {
  const result = leaveLobby(playerId);
  if (result) {
    broadcastToLobby(result.lobby.code, {
      type: 'player_left',
      playerId,
      lobby: result.lobby,
    });
  }
}

start();
