export interface MarbleConfig {
    id: string;
    name: string;
    color: string;
    isBot: boolean;
    ownerId?: string;
}
export interface MarbleState {
    id: string;
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    finished: boolean;
    finishTime?: number;
    position?: number;
    disqualified: boolean;
}
export type SegmentType = 'slope' | 'steep_slope' | 'flat' | 'funnel' | 'wide_curve' | 'zigzag' | 'drop' | 'narrow' | 'gentle_bend' | 'split' | 'quarter_pipe' | 'mini_ramp' | 'half_pipe' | 'maze' | 'lattice' | 'finish';
export interface TrackPoint {
    x: number;
    y: number;
}
export interface TrackSegment {
    type: SegmentType;
    points: TrackPoint[];
    rightPoints: TrackPoint[];
    dividers?: TrackPoint[][];
}
export interface Track {
    seed: number;
    segments: TrackSegment[];
    startX: number;
    startY: number;
    width: number;
    height: number;
    funnelLeft: number;
    funnelRight: number;
    boundsMinX: number;
    boundsMaxX: number;
    boundsMinY: number;
    boundsMaxY: number;
}
export type LobbyState = 'waiting' | 'countdown' | 'racing' | 'results';
export interface LobbyPlayer {
    id: string;
    name: string;
    marbleName: string;
    marbleColor: string;
    isHost: boolean;
    isBot: boolean;
}
export interface Lobby {
    code: string;
    hostId: string;
    state: LobbyState;
    players: LobbyPlayer[];
    trackSeed?: number;
    gravityScale?: number;
    maxPlayers: number;
}
export interface RaceResult {
    marbleId: string;
    marbleName: string;
    marbleColor: string;
    position: number;
    finishTime: number;
}
export interface RaceState {
    status: 'countdown' | 'racing' | 'finished';
    countdown: number;
    elapsedTime: number;
    marbles: MarbleState[];
    results: RaceResult[];
}
export type ClientMessage = {
    type: 'create_lobby';
    playerName: string;
    marbleName: string;
    marbleColor: string;
} | {
    type: 'join_lobby';
    code: string;
    playerName: string;
    marbleName: string;
    marbleColor: string;
} | {
    type: 'add_bot';
    botName?: string;
    botColor?: string;
} | {
    type: 'remove_bot';
    botId: string;
} | {
    type: 'start_race';
    gravityScale?: number;
} | {
    type: 'leave_lobby';
};
export type ServerMessage = {
    type: 'lobby_created';
    lobby: Lobby;
    playerId: string;
} | {
    type: 'lobby_joined';
    lobby: Lobby;
    playerId: string;
} | {
    type: 'lobby_updated';
    lobby: Lobby;
} | {
    type: 'race_countdown';
    countdown: number;
} | {
    type: 'race_start';
    trackSeed: number;
    marbles: MarbleConfig[];
    gravityScale: number;
} | {
    type: 'race_state';
    state: RaceState;
} | {
    type: 'race_finished';
    results: RaceResult[];
} | {
    type: 'error';
    message: string;
} | {
    type: 'player_left';
    playerId: string;
    lobby: Lobby;
};
export declare const MARBLE_RADIUS = 20;
export declare const TRACK_WIDTH = 350;
export declare const GRAVITY = 1;
export declare const MAX_MARBLES = 20;
export declare const LOBBY_CODE_LENGTH = 6;
export declare const COUNTDOWN_SECONDS = 3;
export declare const TICK_RATE = 60;
export declare const SYNC_RATE = 30;
export declare const PLAYER_NAMES: string[];
export declare const MARBLE_COLORS: string[];
