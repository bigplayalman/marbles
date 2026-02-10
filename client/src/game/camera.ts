import { MarbleState } from '@shared/types';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  targetId: string | null; // null = follow leading active marble
  screenWidth: number;
  screenHeight: number;
  finishLineX: number; // set externally for end-of-race camera
  finishLineY: number;
  update: (marbles: MarbleState[], dt: number) => void;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  setTarget: (id: string | null) => void;
  setZoom: (zoom: number) => void;
}

export function createCamera(screenWidth: number, screenHeight: number): Camera {
  const camera: Camera = {
    x: 0,
    y: 0,
    zoom: 1,
    targetId: null,
    screenWidth,
    screenHeight,
    finishLineX: 0,
    finishLineY: 0,

    update(marbles: MarbleState[], dt: number) {
      if (marbles.length === 0) return;

      let targetX: number;
      let targetY: number;

      // If a specific marble is targeted, follow it (unless finished/DQ'd)
      if (camera.targetId) {
        const found = marbles.find(m => m.id === camera.targetId);
        if (found && !found.finished && !found.disqualified) {
          targetX = found.x;
          targetY = found.y;
        } else {
          // Target finished or DQ'd — clear target, fallback to auto
          camera.targetId = null;
          return camera.update(marbles, dt);
        }
      } else {
        // Find leading active marble (not finished, not DQ'd)
        const active = marbles.filter(m => !m.finished && !m.disqualified);

        if (active.length > 0) {
          // Follow the active marble with the most progress (highest Y)
          const leader = active.reduce((a, b) => (b.y > a.y ? b : a));
          targetX = leader.x;
          targetY = leader.y;
        } else {
          // All marbles finished or DQ'd — point camera at the finish line
          targetX = camera.finishLineX;
          targetY = camera.finishLineY;
        }
      }

      // Smooth lerp to target
      const lerpSpeed = 0.05;
      camera.x += (targetX - camera.x) * lerpSpeed;
      camera.y += (targetY - camera.y) * lerpSpeed;
    },

    worldToScreen(wx: number, wy: number) {
      return {
        x: (wx - camera.x) * camera.zoom + camera.screenWidth / 2,
        y: (wy - camera.y) * camera.zoom + camera.screenHeight / 2,
      };
    },

    setTarget(id: string | null) {
      camera.targetId = id;
    },

    setZoom(zoom: number) {
      camera.zoom = Math.max(0.3, Math.min(3, zoom));
    },
  };

  return camera;
}
