import {
  Lobby,
  LobbyPlayer,
  LobbyState,
  LOBBY_CODE_LENGTH,
  MAX_MARBLES,
  PLAYER_NAMES,
  MARBLE_COLORS,
} from '../../shared/types.js';

const lobbies = new Map<string, Lobby>();
const playerLobbyMap = new Map<string, string>(); // playerId -> lobbyCode

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
  let code = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Make sure it's unique
  if (lobbies.has(code)) return generateCode();
  return code;
}

function getUsedPlayerNames(lobby: Lobby): Set<string> {
  return new Set(lobby.players.map(p => p.marbleName));
}

function getUsedColors(lobby: Lobby): Set<string> {
  return new Set(lobby.players.map(p => p.marbleColor));
}

function getUnusedPlayerName(lobby: Lobby): string {
  const used = getUsedPlayerNames(lobby);
  for (const name of PLAYER_NAMES) {
    if (!used.has(name)) return name;
  }
  return `Player ${lobby.players.length}`;
}

function getUnusedColor(lobby: Lobby): string {
  const used = getUsedColors(lobby);
  for (const color of MARBLE_COLORS) {
    if (!used.has(color)) return color;
  }
  return `hsl(${Math.random() * 360}, 70%, 55%)`;
}

export function createLobby(
  playerId: string,
  playerName: string,
  marbleName: string,
  marbleColor: string,
): Lobby {
  const code = generateCode();
  const host: LobbyPlayer = {
    id: playerId,
    name: playerName,
    marbleName,
    marbleColor,
    isHost: true,
    isBot: false,
  };

  const lobby: Lobby = {
    code,
    hostId: playerId,
    state: 'waiting',
    players: [host],
    maxPlayers: MAX_MARBLES,
  };

  lobbies.set(code, lobby);
  playerLobbyMap.set(playerId, code);
  return lobby;
}

export function joinLobby(
  code: string,
  playerId: string,
  playerName: string,
  marbleName: string,
  marbleColor: string,
): Lobby | null {
  const lobby = lobbies.get(code);
  if (!lobby) return null;
  if (lobby.state !== 'waiting') return null;
  if (lobby.players.length >= lobby.maxPlayers) return null;

  const player: LobbyPlayer = {
    id: playerId,
    name: playerName,
    marbleName,
    marbleColor,
    isHost: false,
    isBot: false,
  };

  lobby.players.push(player);
  playerLobbyMap.set(playerId, code);
  return lobby;
}

export function leaveLobby(playerId: string): { lobby: Lobby; wasHost: boolean } | null {
  const code = playerLobbyMap.get(playerId);
  if (!code) return null;

  const lobby = lobbies.get(code);
  if (!lobby) return null;

  const wasHost = lobby.hostId === playerId;
  lobby.players = lobby.players.filter(p => p.id !== playerId);
  playerLobbyMap.delete(playerId);

  if (lobby.players.length === 0) {
    // Nobody left, destroy lobby
    lobbies.delete(code);
    return null;
  }

  // Transfer host
  if (wasHost) {
    const nonBots = lobby.players.filter(p => !p.isBot);
    if (nonBots.length > 0) {
      lobby.hostId = nonBots[0].id;
      nonBots[0].isHost = true;
    } else {
      // Only bots left, destroy lobby
      lobbies.delete(code);
      return null;
    }
  }

  return { lobby, wasHost };
}

export function addBot(lobbyCode: string, botName?: string, botColor?: string): Lobby | null {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return null;
  if (lobby.players.length >= lobby.maxPlayers) return null;

  const name = botName || getUnusedPlayerName(lobby);
  const color = botColor || getUnusedColor(lobby);
  const botId = `player_${Math.random().toString(36).substring(2, 10)}`;

  lobby.players.push({
    id: botId,
    name: name,
    marbleName: name,
    marbleColor: color,
    isHost: false,
    isBot: true,
  });

  return lobby;
}

export function removeBot(lobbyCode: string, botId: string): Lobby | null {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return null;

  lobby.players = lobby.players.filter(p => p.id !== botId);
  return lobby;
}

export function getLobby(code: string): Lobby | null {
  return lobbies.get(code) || null;
}

export function getPlayerLobby(playerId: string): Lobby | null {
  const code = playerLobbyMap.get(playerId);
  if (!code) return null;
  return lobbies.get(code) || null;
}

export function setLobbyState(code: string, state: LobbyState): void {
  const lobby = lobbies.get(code);
  if (lobby) lobby.state = state;
}

export function setTrackSeed(code: string, seed: number): void {
  const lobby = lobbies.get(code);
  if (lobby) lobby.trackSeed = seed;
}
