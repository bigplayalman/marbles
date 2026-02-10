import { Lobby, LobbyState } from '../../shared/types.js';
export declare function createLobby(playerId: string, playerName: string, marbleName: string, marbleColor: string): Lobby;
export declare function joinLobby(code: string, playerId: string, playerName: string, marbleName: string, marbleColor: string): Lobby | null;
export declare function leaveLobby(playerId: string): {
    lobby: Lobby;
    wasHost: boolean;
} | null;
export declare function addBot(lobbyCode: string, botName?: string, botColor?: string): Lobby | null;
export declare function removeBot(lobbyCode: string, botId: string): Lobby | null;
export declare function getLobby(code: string): Lobby | null;
export declare function getPlayerLobby(playerId: string): Lobby | null;
export declare function setLobbyState(code: string, state: LobbyState): void;
export declare function setTrackSeed(code: string, seed: number): void;
