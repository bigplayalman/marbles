import { MarbleConfig, RaceResult, COUNTDOWN_SECONDS } from '@shared/types';
import { generateTrack } from './game/trackGenerator';
import { createPhysicsWorld, PhysicsWorld } from './game/physics';
import { createRenderer, Renderer } from './game/renderer';
import { createCamera, Camera } from './game/camera';
import { createHUD, HUD } from './game/hud';
import { createLobbyUI, LobbyUI, RaceSettings } from './ui/lobby';

// ============================================================
// Game State
// ============================================================

interface GameState {
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  marbles: MarbleConfig[];
  trackSeed: number;
  countdownRemaining: number;
  raceTime: number;
  results: RaceResult[];
}

const state: GameState = {
  status: 'lobby',
  marbles: [],
  trackSeed: 0,
  countdownRemaining: 0,
  raceTime: 0,
  results: [],
};

// ============================================================
// App Container
// ============================================================

const app = document.getElementById('app')!;
app.style.cssText = 'position: relative; width: 100vw; height: 100vh; overflow: hidden;';

// Game container (behind lobby)
const gameContainer = document.createElement('div');
gameContainer.id = 'game-container';
gameContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
app.appendChild(gameContainer);

// ============================================================
// Systems
// ============================================================

let renderer: Renderer;
let camera: Camera;
let hud: HUD;
let lobbyUI: LobbyUI;
let physics: PhysicsWorld | null = null;
let track: ReturnType<typeof generateTrack> | null = null;
let animFrameId: number = 0;
let lastTime = 0;

// Initialize renderer and camera
renderer = createRenderer(gameContainer);
camera = createCamera(window.innerWidth, window.innerHeight);
camera.setZoom(0.9);
hud = createHUD(gameContainer);

// Resize handler
window.addEventListener('resize', () => {
  renderer.resize();
  camera.screenWidth = window.innerWidth;
  camera.screenHeight = window.innerHeight;
});
renderer.resize();

// Zoom controls
window.addEventListener('wheel', (e) => {
  if (state.status === 'lobby') return;
  const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
  camera.setZoom(camera.zoom + zoomDelta);
});

// ============================================================
// Lobby
// ============================================================

lobbyUI = createLobbyUI(app, (settings) => {
  startRace(settings);
});

// ============================================================
// Race Logic
// ============================================================

function startRace(settings: RaceSettings) {
  const { marbles, gravityScale } = settings;

  // Get seed from input or generate random
  const seedInput = document.getElementById('track-seed') as HTMLInputElement | null;
  const seed = seedInput?.value ? parseInt(seedInput.value) : Math.floor(Math.random() * 999999);

  state.marbles = marbles;
  state.trackSeed = seed;
  state.results = [];
  state.raceTime = 0;
  state.countdownRemaining = COUNTDOWN_SECONDS;
  state.status = 'countdown';

  // Generate track
  track = generateTrack(seed);

  // Create physics world with custom gravity
  if (physics) physics.destroy();
  physics = createPhysicsWorld(track, marbles, gravityScale);

  // Position camera at start, and set finish line target for end-of-race
  camera.x = track.startX;
  camera.y = track.startY;

  const finishSeg = track.segments[track.segments.length - 1];
  const finishLeft = finishSeg.points[0];
  const finishRight = finishSeg.rightPoints[0];
  camera.finishLineX = (finishLeft.x + finishRight.x) / 2;
  camera.finishLineY = finishLeft.y;

  // Hide lobby
  lobbyUI.hide();

  // Start game loop
  lastTime = performance.now();
  if (animFrameId) cancelAnimationFrame(animFrameId);
  gameLoop(performance.now());
}

function gameLoop(timestamp: number) {
  const delta = Math.min(timestamp - lastTime, 50); // cap at 50ms to avoid spiral
  lastTime = timestamp;

  if (state.status === 'countdown') {
    state.countdownRemaining -= delta / 1000;
    if (state.countdownRemaining <= 0) {
      state.status = 'racing';
      state.countdownRemaining = 0;
    }
  }

  if (state.status === 'racing' && physics && track) {
    // Step physics
    physics.update(delta);
    state.raceTime += delta;

    const marbleStates = physics.getMarbleStates();

    // Update camera
    camera.update(marbleStates, delta);

    // Check if all marbles are finished or disqualified
    const allDone = marbleStates.every(m => m.finished || m.disqualified);
    if (allDone && state.results.length === 0) {
      state.status = 'finished';

      // Build results: finished marbles sorted by time, then DQ'd marbles at the end
      const finished = marbleStates
        .filter(m => m.finished)
        .sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity));
      const disqualified = marbleStates.filter(m => m.disqualified);

      let pos = 0;
      state.results = [
        ...finished.map(m => {
          pos++;
          const config = state.marbles.find(c => c.id === m.id)!;
          return {
            marbleId: m.id,
            marbleName: config.name,
            marbleColor: config.color,
            position: pos,
            finishTime: m.finishTime || 0,
          };
        }),
        ...disqualified.map(m => {
          pos++;
          const config = state.marbles.find(c => c.id === m.id)!;
          return {
            marbleId: m.id,
            marbleName: config.name,
            marbleColor: config.color,
            position: pos,
            finishTime: -1, // -1 signals DQ
          };
        }),
      ];
      hud.showResults(state.results);

      // Listen for "New Race" button
      setTimeout(() => {
        document.getElementById('btn-new-race')?.addEventListener('click', () => {
          resetToLobby();
        });
      }, 100);
    }

    // Render
    renderer.render(track, state.marbles, marbleStates, camera, state.raceTime);
    hud.update(state.marbles, marbleStates, state.raceTime, state.status, state.countdownRemaining);
  } else if (state.status === 'countdown' && track) {
    // Render static scene during countdown
    const marbleStates = physics?.getMarbleStates() || [];
    camera.update(marbleStates, delta);
    renderer.render(track, state.marbles, marbleStates, camera, 0);
    hud.update(state.marbles, marbleStates, 0, 'countdown', state.countdownRemaining);
  } else if (state.status === 'finished' && track && physics) {
    // Keep rendering after finish
    const marbleStates = physics.getMarbleStates();
    renderer.render(track, state.marbles, marbleStates, camera, state.raceTime);
  }

  animFrameId = requestAnimationFrame(gameLoop);
}

function resetToLobby() {
  state.status = 'lobby';
  if (physics) {
    physics.destroy();
    physics = null;
  }
  track = null;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = 0;
  }

  // Clear game canvas
  const ctx = renderer.ctx;
  ctx.clearRect(0, 0, renderer.canvas.width, renderer.canvas.height);

  // Destroy and recreate HUD
  hud.destroy();
  hud = createHUD(gameContainer);

  // Show lobby
  lobbyUI.show();
}
