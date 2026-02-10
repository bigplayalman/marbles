import Matter from 'matter-js';
import {
  Track,
  MarbleConfig,
  MarbleState,
  MARBLE_RADIUS,
} from '@shared/types';
import { getFinishLineY } from './trackGenerator';

const { Engine, World, Bodies, Body, Events, Composite } = Matter;

export interface PhysicsWorld {
  engine: Matter.Engine;
  marbleBodies: Map<string, Matter.Body>;
  finishY: number;
  update: (delta: number) => void;
  getMarbleStates: () => MarbleState[];
  destroy: () => void;
}

export function createPhysicsWorld(
  track: Track,
  marbles: MarbleConfig[],
  gravityScale: number = 0.0004,
): PhysicsWorld {
  const engine = Engine.create({
    gravity: { x: 0, y: 1, scale: gravityScale },
  });

  // Build track walls from segments
  const wallBodies: Matter.Body[] = [];

  for (const segment of track.segments) {
    // Left wall — create line segments between consecutive points
    for (let i = 0; i < segment.points.length - 1; i++) {
      const p1 = segment.points[i];
      const p2 = segment.points[i + 1];
      const wall = createWallFromPoints(p1.x, p1.y, p2.x, p2.y);
      wallBodies.push(wall);
    }

    // Right wall
    for (let i = 0; i < segment.rightPoints.length - 1; i++) {
      const p1 = segment.rightPoints[i];
      const p2 = segment.rightPoints[i + 1];
      const wall = createWallFromPoints(p1.x, p1.y, p2.x, p2.y);
      wallBodies.push(wall);
    }

    // Divider walls (for split segments — multiple dividers)
    if (segment.dividers) {
      for (const divider of segment.dividers) {
        for (let i = 0; i < divider.length - 1; i++) {
          const p1 = divider[i];
          const p2 = divider[i + 1];
          const wall = createWallFromPoints(p1.x, p1.y, p2.x, p2.y);
          wallBodies.push(wall);
        }
      }
    }
  }

  Composite.add(engine.world, wallBodies);

  // Create marble bodies
  const marbleBodies = new Map<string, Matter.Body>();
  const startX = track.startX;
  const startY = track.startY;

  // Calculate spawn area that fits within the funnel opening
  const funnelLeft = track.funnelLeft + MARBLE_RADIUS + 5;
  const funnelRight = track.funnelRight - MARBLE_RADIUS - 5;
  const availableWidth = funnelRight - funnelLeft;

  marbles.forEach((marble, index) => {
    // Dynamic column count based on how many marbles fit in the funnel width
    const maxCols = Math.max(1, Math.floor(availableWidth / (MARBLE_RADIUS * 2 + 8)));
    const cols = Math.min(marbles.length, maxCols);
    const row = Math.floor(index / cols);
    const col = index % cols;
    const spacing = Math.min(MARBLE_RADIUS * 2 + 10, availableWidth / cols);
    const rowCols = Math.min(cols, marbles.length - row * cols);
    const offsetX = (col - (rowCols - 1) / 2) * spacing;
    const offsetY = row * (MARBLE_RADIUS * 2 + 6);

    const body = Bodies.circle(
      startX + offsetX,
      startY + offsetY,
      MARBLE_RADIUS,
      {
        restitution: 0.4,
        friction: 0.03,
        frictionAir: 0.005,
        density: 0.002,
        label: `marble_${marble.id}`,
      },
    );

    // Small random initial velocity for variation
    Body.setVelocity(body, {
      x: (Math.random() - 0.5) * 0.3,
      y: 0,
    });

    marbleBodies.set(marble.id, body);
    Composite.add(engine.world, body);
  });

  const finishY = getFinishLineY(track);

  // Track finished and disqualified marbles
  const finishedMarbles = new Set<string>();
  const finishTimes = new Map<string, number>();
  const disqualifiedMarbles = new Set<string>();
  // Last known positions for DQ'd marbles (so they can still be rendered)
  const dqPositions = new Map<string, { x: number; y: number; angle: number }>();
  let finishOrder = 0;
  let raceTime = 0;

  // OOB margin — marble is disqualified if it goes this far outside track bounds
  const OOB_MARGIN = 500;

  // Anti-stuck tracking with aggressive escalating force
  const stuckTracking = new Map<string, {
    x: number;
    y: number;
    time: number;
    stuckCount: number; // how many consecutive checks this marble has been stuck
  }>();
  const STUCK_CHECK_INTERVAL = 800; // check every 0.8 seconds (faster detection)
  const STUCK_THRESHOLD = 6; // must move at least 6px in Y

  function isOutOfBounds(body: Matter.Body): boolean {
    const { x, y } = body.position;
    return (
      x < track.boundsMinX - OOB_MARGIN ||
      x > track.boundsMaxX + OOB_MARGIN ||
      y < track.boundsMinY - OOB_MARGIN ||
      y > track.boundsMaxY + OOB_MARGIN
    );
  }

  function update(delta: number) {
    raceTime += delta;
    Engine.update(engine, delta);

    // Check finish line crossings and out-of-bounds
    for (const [id, body] of marbleBodies) {
      if (finishedMarbles.has(id) || disqualifiedMarbles.has(id)) continue;

      if (body.position.y >= finishY) {
        finishedMarbles.add(id);
        finishOrder++;
        finishTimes.set(id, raceTime);
      } else if (isOutOfBounds(body)) {
        // Disqualify — save last position and remove from physics
        disqualifiedMarbles.add(id);
        dqPositions.set(id, { x: body.position.x, y: body.position.y, angle: body.angle });
        Composite.remove(engine.world, body);
      }
    }

    // Anti-stuck: detect and nudge stuck marbles with escalating force
    for (const [id, body] of marbleBodies) {
      if (finishedMarbles.has(id) || disqualifiedMarbles.has(id)) continue;

      const tracking = stuckTracking.get(id);
      if (!tracking || raceTime - tracking.time >= STUCK_CHECK_INTERVAL) {
        if (tracking) {
          const dy = body.position.y - tracking.y;
          const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);

          if (dy < STUCK_THRESHOLD && speed < 2) {
            // Marble is stuck — escalate aggressively until it breaks free
            const stuckCount = tracking.stuckCount + 1;
            const force = Math.min(stuckCount, 8); // escalate up to 8x

            if (stuckCount >= 5) {
              // Severely stuck — teleport downward and blast it loose
              Body.setPosition(body, {
                x: body.position.x + (Math.random() - 0.5) * 40,
                y: body.position.y + 25 + stuckCount * 5,
              });
              Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 12,
                y: 8 + Math.random() * 6 + stuckCount * 2,
              });
            } else if (stuckCount >= 3) {
              // Moderately stuck — strong bounce
              Body.setPosition(body, {
                x: body.position.x + (Math.random() - 0.5) * 25,
                y: body.position.y + 15,
              });
              Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 8,
                y: 6 + Math.random() * 4,
              });
            } else {
              // Early nudge — vigorous push
              const nudgeX = (Math.random() - 0.5) * 6 * force;
              const nudgeY = (3 + Math.random() * 3) * force;
              Body.setVelocity(body, {
                x: body.velocity.x + nudgeX,
                y: body.velocity.y + nudgeY,
              });
            }

            stuckTracking.set(id, {
              x: body.position.x,
              y: body.position.y,
              time: raceTime,
              stuckCount,
            });
          } else {
            // Not stuck — reset counter
            stuckTracking.set(id, {
              x: body.position.x,
              y: body.position.y,
              time: raceTime,
              stuckCount: 0,
            });
          }
        } else {
          stuckTracking.set(id, {
            x: body.position.x,
            y: body.position.y,
            time: raceTime,
            stuckCount: 0,
          });
        }
      }
    }
  }

  function getMarbleStates(): MarbleState[] {
    const states: MarbleState[] = [];
    for (const [id, body] of marbleBodies) {
      const isDQ = disqualifiedMarbles.has(id);
      const dqPos = dqPositions.get(id);
      states.push({
        id,
        x: isDQ && dqPos ? dqPos.x : body.position.x,
        y: isDQ && dqPos ? dqPos.y : body.position.y,
        angle: isDQ && dqPos ? dqPos.angle : body.angle,
        vx: isDQ ? 0 : body.velocity.x,
        vy: isDQ ? 0 : body.velocity.y,
        finished: finishedMarbles.has(id),
        finishTime: finishTimes.get(id),
        disqualified: isDQ,
      });
    }

    // Sort: finished first (by finish time), then active (by Y progress), then DQ'd last
    states.sort((a, b) => {
      if (a.disqualified && !b.disqualified) return 1;
      if (!a.disqualified && b.disqualified) return -1;
      if (a.disqualified && b.disqualified) return 0;
      if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.y - a.y;
    });

    // Assign positions
    states.forEach((s, i) => {
      s.position = i + 1;
    });

    return states;
  }

  function destroy() {
    World.clear(engine.world, false);
    Engine.clear(engine);
  }

  return {
    engine,
    marbleBodies,
    finishY,
    update,
    getMarbleStates,
    destroy,
  };
}

function createWallFromPoints(
  x1: number, y1: number,
  x2: number, y2: number,
): Matter.Body {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const thickness = 10;

  return Bodies.rectangle(cx, cy, length + 2, thickness, {
    isStatic: true,
    angle,
    friction: 0.15,
    restitution: 0.4,
    render: { fillStyle: '#555' },
  });
}
