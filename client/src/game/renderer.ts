import { Track, MarbleConfig, MarbleState, MARBLE_RADIUS } from '@shared/types';
import { Camera } from './camera';

export interface Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  resize: () => void;
  render: (
    track: Track,
    marbles: MarbleConfig[],
    marbleStates: MarbleState[],
    camera: Camera,
    raceTime: number,
  ) => void;
}

export function createRenderer(container: HTMLElement): Renderer {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.background = '#1a1a2e';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  function resize() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }

  function render(
    track: Track,
    marbles: MarbleConfig[],
    marbleStates: MarbleState[],
    camera: Camera,
    raceTime: number,
  ) {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Draw track
    drawTrack(ctx, track, camera);

    // Draw finish line
    drawFinishLine(ctx, track, camera);

    // Draw marbles
    drawMarbles(ctx, marbles, marbleStates, camera);
  }

  return { canvas, ctx, resize, render };
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  track: Track,
  camera: Camera,
) {
  // Draw track surface (filled area between walls)
  ctx.beginPath();

  // Forward along left wall
  let first = true;
  for (const segment of track.segments) {
    for (const p of segment.points) {
      const sp = camera.worldToScreen(p.x, p.y);
      if (first) {
        ctx.moveTo(sp.x, sp.y);
        first = false;
      } else {
        ctx.lineTo(sp.x, sp.y);
      }
    }
  }

  // Backward along right wall
  for (let i = track.segments.length - 1; i >= 0; i--) {
    const segment = track.segments[i];
    for (let j = segment.rightPoints.length - 1; j >= 0; j--) {
      const p = segment.rightPoints[j];
      const sp = camera.worldToScreen(p.x, p.y);
      ctx.lineTo(sp.x, sp.y);
    }
  }

  ctx.closePath();
  ctx.fillStyle = 'rgba(40, 40, 80, 0.6)';
  ctx.fill();

  // Draw wall lines
  ctx.strokeStyle = '#4a90d9';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Left wall
  ctx.beginPath();
  first = true;
  for (const segment of track.segments) {
    for (const p of segment.points) {
      const sp = camera.worldToScreen(p.x, p.y);
      if (first) {
        ctx.moveTo(sp.x, sp.y);
        first = false;
      } else {
        ctx.lineTo(sp.x, sp.y);
      }
    }
  }
  ctx.stroke();

  // Right wall
  ctx.beginPath();
  first = true;
  for (const segment of track.segments) {
    for (const p of segment.rightPoints) {
      const sp = camera.worldToScreen(p.x, p.y);
      if (first) {
        ctx.moveTo(sp.x, sp.y);
        first = false;
      } else {
        ctx.lineTo(sp.x, sp.y);
      }
    }
  }
  ctx.stroke();

  // Divider walls (for split segments — multiple dividers)
  ctx.strokeStyle = '#4a90d9';
  ctx.lineWidth = 3;
  for (const segment of track.segments) {
    if (segment.dividers) {
      for (const divider of segment.dividers) {
        if (divider.length < 2) continue;
        ctx.beginPath();
        const sp0 = camera.worldToScreen(divider[0].x, divider[0].y);
        ctx.moveTo(sp0.x, sp0.y);
        for (let i = 1; i < divider.length; i++) {
          const sp = camera.worldToScreen(divider[i].x, divider[i].y);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
      }
    }
  }
}

function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  track: Track,
  camera: Camera,
) {
  const finishSeg = track.segments[track.segments.length - 1];
  const leftP = finishSeg.points[0];
  const rightP = finishSeg.rightPoints[0];
  const sl = camera.worldToScreen(leftP.x, leftP.y);
  const sr = camera.worldToScreen(rightP.x, rightP.y);

  // Checkered pattern
  const checkerSize = 10 * camera.zoom;
  const dx = sr.x - sl.x;
  const dy = sr.y - sl.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(dist / checkerSize);
  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.translate(sl.x, sl.y);
  ctx.rotate(angle);

  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < 2; j++) {
      const isWhite = (i + j) % 2 === 0;
      ctx.fillStyle = isWhite ? '#ffffff' : '#000000';
      ctx.fillRect(i * checkerSize, j * checkerSize - checkerSize, checkerSize, checkerSize);
    }
  }

  ctx.restore();

  // "FINISH" label
  const midX = (sl.x + sr.x) / 2;
  const midY = (sl.y + sr.y) / 2;
  ctx.font = `bold ${16 * camera.zoom}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText('FINISH', midX, midY - 20 * camera.zoom);
  ctx.fillText('FINISH', midX, midY - 20 * camera.zoom);
}

function drawMarbles(
  ctx: CanvasRenderingContext2D,
  marbles: MarbleConfig[],
  marbleStates: MarbleState[],
  camera: Camera,
) {
  // Draw from back to front (highest position number first)
  const sortedStates = [...marbleStates].sort(
    (a, b) => (b.position || 999) - (a.position || 999),
  );

  for (const state of sortedStates) {
    const config = marbles.find(m => m.id === state.id);
    if (!config) continue;

    const sp = camera.worldToScreen(state.x, state.y);
    const r = MARBLE_RADIUS * camera.zoom;

    // Marble shadow
    ctx.beginPath();
    ctx.arc(sp.x + 2, sp.y + 2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();

    // Marble body
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Marble highlight (glass effect)
    ctx.beginPath();
    ctx.arc(sp.x - r * 0.3, sp.y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    // Rotation indicator (stripe)
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(state.angle);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(r * 0.6, 0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Name label
    const fontSize = Math.max(10, 12 * camera.zoom);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';

    // Background for name
    const nameWidth = ctx.measureText(config.name).width + 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.roundRect(
      sp.x - nameWidth / 2,
      sp.y - r - fontSize - 8,
      nameWidth,
      fontSize + 4,
      3,
    );
    ctx.fill();

    // Name text
    ctx.fillStyle = '#fff';
    ctx.fillText(config.name, sp.x, sp.y - r - 6);

    // Position badge (if in top 3)
    if (state.position && state.position <= 3) {
      const badges = ['', '#ffd700', '#c0c0c0', '#cd7f32']; // gold, silver, bronze
      const badgeR = 8 * camera.zoom;
      ctx.beginPath();
      ctx.arc(sp.x + r, sp.y - r, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = badges[state.position];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = `bold ${badgeR}px monospace`;
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(String(state.position), sp.x + r, sp.y - r + badgeR * 0.35);
    }
  }
}
