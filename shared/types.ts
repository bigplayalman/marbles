// ============================================================
// Marble Race — Shared Types
// ============================================================

// --- Marble ---

export interface MarbleConfig {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  ownerId?: string; // player ID if not a bot
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
  position?: number; // race position (1st, 2nd, etc.)
  disqualified: boolean;
}

// --- Track ---

export type SegmentType =
  | 'slope'
  | 'steep_slope'
  | 'flat'
  | 'funnel'
  | 'wide_curve'
  | 'zigzag'
  | 'drop'
  | 'narrow'
  | 'gentle_bend'
  | 'split'
  | 'quarter_pipe'
  | 'mini_ramp'
  | 'half_pipe'
  | 'maze'
  | 'lattice'
  | 'finish';

export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackSegment {
  type: SegmentType;
  points: TrackPoint[]; // left wall points
  rightPoints: TrackPoint[]; // right wall points (for enclosed segments)
  dividers?: TrackPoint[][]; // divider walls for split segments (1-3 dividers)
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
  // Bounding box of all track walls (for OOB detection)
  boundsMinX: number;
  boundsMaxX: number;
  boundsMinY: number;
  boundsMaxY: number;
}

// --- Lobby ---

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

// --- Race ---

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

// --- WebSocket Messages ---

export type ClientMessage =
  | { type: 'create_lobby'; playerName: string; marbleName: string; marbleColor: string }
  | { type: 'join_lobby'; code: string; playerName: string; marbleName: string; marbleColor: string }
  | { type: 'add_bot'; botName?: string; botColor?: string }
  | { type: 'remove_bot'; botId: string }
  | { type: 'start_race'; gravityScale?: number }
  | { type: 'leave_lobby' };

export type ServerMessage =
  | { type: 'lobby_created'; lobby: Lobby; playerId: string }
  | { type: 'lobby_joined'; lobby: Lobby; playerId: string }
  | { type: 'lobby_updated'; lobby: Lobby }
  | { type: 'race_countdown'; countdown: number }
  | { type: 'race_start'; trackSeed: number; marbles: MarbleConfig[]; gravityScale: number }
  | { type: 'race_state'; state: RaceState }
  | { type: 'race_finished'; results: RaceResult[] }
  | { type: 'error'; message: string }
  | { type: 'player_left'; playerId: string; lobby: Lobby };

// --- Constants ---

export const MARBLE_RADIUS = 20;
export const TRACK_WIDTH = 350; // default track corridor width
export const GRAVITY = 1;
export const MAX_MARBLES = 20;
export const LOBBY_CODE_LENGTH = 6;
export const COUNTDOWN_SECONDS = 3;
export const TICK_RATE = 60; // physics ticks per second
export const SYNC_RATE = 30; // network sync rate

export const PLAYER_NAMES = [
  'Thunderball', 'Big Red', 'Slick', 'Pebble', 'Cannonball',
  'Dizzy', 'Rocket', 'Bouncer', 'Shadow', 'Blaze',
  'Cyclone', 'Nugget', 'Comet', 'Rumble', 'Frost',
  'Sparky', 'Vortex', 'Marble Madness', 'Rolling Thunder', 'Quicksilver',
  'Jade', 'Onyx', 'Ruby', 'Sapphire', 'Turbo',
  'Zigzag', 'Bullet', 'Drifter', 'Ace', 'Flash',
];

export const MARBLE_COLORS = [
  '#FF4136', '#FF851B', '#FFDC00', '#2ECC40', '#0074D9',
  '#B10DC9', '#F012BE', '#01FF70', '#7FDBFF', '#AAAAAA',
  '#FF6B6B', '#C44DFF', '#FF9F43', '#00D2D3', '#EE5A24',
  '#6C5CE7', '#FDA7DF', '#A3CB38', '#1289A7', '#D980FA',
];
