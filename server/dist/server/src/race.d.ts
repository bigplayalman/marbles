import { Lobby, RaceState, Track } from '../../shared/types.js';
export declare function generateTrackServer(seed: number): Track;
export interface ServerRace {
    tick: () => void;
    getState: () => RaceState;
    isFinished: () => boolean;
    destroy: () => void;
}
export declare function createServerRace(lobby: Lobby, track: Track, gravityScale?: number): ServerRace;
