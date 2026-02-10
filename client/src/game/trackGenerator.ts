import {
  Track,
  TrackSegment,
  TrackPoint,
  SegmentType,
  TRACK_WIDTH,
  MARBLE_RADIUS,
} from '@shared/types';

// Seeded PRNG (mulberry32)
function createRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function rngInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rngRange(rng, min, max + 1));
}

function rngPick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Minimum passage width — must fit at least 3 marbles side by side
const MIN_PASSAGE_WIDTH = MARBLE_RADIUS * 2 * 3 + 20; // ~92px

// Segment types (no obstacle-based segments)
const SEGMENT_TYPES: SegmentType[] = [
  'slope', 'steep_slope', 'flat', 'funnel',
  'wide_curve', 'zigzag', 'drop', 'narrow', 'gentle_bend', 'split',
  'quarter_pipe', 'mini_ramp', 'half_pipe', 'lattice', 'lattice',
];

interface SegmentEnd {
  x: number;
  y: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
}

function getSegmentEnd(segment: TrackSegment): SegmentEnd {
  const leftEnd = segment.points[segment.points.length - 1];
  const rightEnd = segment.rightPoints[segment.rightPoints.length - 1];
  return {
    x: (leftEnd.x + rightEnd.x) / 2,
    y: Math.max(leftEnd.y, rightEnd.y),
    leftX: leftEnd.x,
    leftY: leftEnd.y,
    rightX: rightEnd.x,
    rightY: rightEnd.y,
  };
}

// Minimum interior angle between 3 consecutive points (in degrees)
const MIN_ANGLE_DEG = 130;

// Enforce minimum angle: subdivide any bend sharper than MIN_ANGLE_DEG
function enforceMinAngle(points: TrackPoint[]): TrackPoint[] {
  if (points.length < 3) return points;
  const minAngleRad = MIN_ANGLE_DEG * Math.PI / 180;
  let result = [...points];
  let changed = true;
  let passes = 0;
  while (changed && passes < 5) {
    changed = false;
    passes++;
    const next: TrackPoint[] = [result[0]];
    for (let i = 1; i < result.length - 1; i++) {
      const a = result[i - 1];
      const b = result[i];
      const c = result[i + 1];
      const abx = a.x - b.x, aby = a.y - b.y;
      const cbx = c.x - b.x, cby = c.y - b.y;
      const dot = abx * cbx + aby * cby;
      const magA = Math.sqrt(abx * abx + aby * aby);
      const magC = Math.sqrt(cbx * cbx + cby * cby);
      if (magA < 1 || magC < 1) { next.push(b); continue; }
      const cosAngle = dot / (magA * magC);
      const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
      if (angle < minAngleRad) {
        // Insert midpoints before and after to soften the bend
        next.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        next.push(b);
        next.push({ x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 });
        changed = true;
      } else {
        next.push(b);
      }
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}

// Interpolate points along a path to create smooth curves
function smoothPoints(points: TrackPoint[], subdivisions: number = 3): TrackPoint[] {
  if (points.length < 3) return enforceMinAngle(points);
  const result: TrackPoint[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 1; s <= subdivisions; s++) {
      const t = s / (subdivisions + 1);
      // Catmull-Rom interpolation
      const tt = t * t;
      const ttt = tt * t;
      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt
      );
      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt
      );
      result.push({ x, y });
    }
    result.push(p2);
  }
  return enforceMinAngle(result);
}

export function generateTrack(seed: number): Track {
  const rng = createRNG(seed);
  const segments: TrackSegment[] = [];

  let curX = 0;
  let curY = 0;
  let trackWidth = TRACK_WIDTH;

  // Starting funnel
  const startSegment = createStartSegment(curX, curY, trackWidth);
  segments.push(startSegment);
  let prevEnd = getSegmentEnd(startSegment);
  curX = prevEnd.x;
  curY = prevEnd.y;

  // Opening maze — back-to-back 90-degree switchback turns
  const mazeSeg = createMazeSegment(prevEnd, trackWidth, rng);
  segments.push(mazeSeg);
  prevEnd = getSegmentEnd(mazeSeg);
  curX = prevEnd.x;
  curY = prevEnd.y;

  // Generate 12-18 random segments
  const numSegments = rngInt(rng, 12, 18);

  for (let i = 0; i < numSegments; i++) {
    const segType = rngPick(rng, SEGMENT_TYPES);
    const segment = createSegment(segType, prevEnd, trackWidth, rng);
    segments.push(segment);
    prevEnd = getSegmentEnd(segment);
    curX = prevEnd.x;
    curY = prevEnd.y;

    // Vary track width slightly
    trackWidth = Math.max(250, Math.min(450, trackWidth + rngRange(rng, -20, 20)));
  }

  // Finish segment
  const finishSeg = createFinishSegment(prevEnd, trackWidth);
  segments.push(finishSeg);

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const seg of segments) {
    for (const p of [...seg.points, ...seg.rightPoints]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  const startSeg = segments[0];
  const topLeft = startSeg.points[0];
  const topRight = startSeg.rightPoints[0];
  const spawnX = (topLeft.x + topRight.x) / 2;
  const spawnY = topLeft.y + 20;

  return {
    seed,
    segments,
    startX: spawnX,
    startY: spawnY,
    width: maxX - minX + 200,
    height: maxY - minY + 200,
    funnelLeft: topLeft.x,
    funnelRight: topRight.x,
    boundsMinX: minX,
    boundsMaxX: maxX,
    boundsMinY: minY,
    boundsMaxY: maxY,
  };
}

function createStartSegment(x: number, y: number, width: number): TrackSegment {
  const funnelWidth = width * 1.5;
  const h = 250;
  // Smooth funnel with 4 points per side
  return {
    type: 'funnel',
    points: smoothPoints([
      { x: x - funnelWidth / 2, y },
      { x: x - funnelWidth / 2 + 20, y: y + h * 0.3 },
      { x: x - width / 2 - 15, y: y + h * 0.7 },
      { x: x - width / 2, y: y + h },
    ]),
    rightPoints: smoothPoints([
      { x: x + funnelWidth / 2, y },
      { x: x + funnelWidth / 2 - 20, y: y + h * 0.3 },
      { x: x + width / 2 + 15, y: y + h * 0.7 },
      { x: x + width / 2, y: y + h },
    ]),
  };
}

function createFinishSegment(prev: SegmentEnd, width: number): TrackSegment {
  const h = 350;
  const x = prev.x;
  const y = prev.y;
  return {
    type: 'finish',
    points: smoothPoints([
      { x: prev.leftX, y: prev.leftY },
      { x: x - width / 2, y: y + h * 0.4 },
      { x: x - width / 2, y: y + h },
      { x: x - width * 0.7, y: y + h + 150 },
    ]),
    rightPoints: smoothPoints([
      { x: prev.rightX, y: prev.rightY },
      { x: x + width / 2, y: y + h * 0.4 },
      { x: x + width / 2, y: y + h },
      { x: x + width * 0.7, y: y + h + 150 },
    ]),
  };
}

function createMazeSegment(
  prev: SegmentEnd,
  width: number,
  rng: () => number,
): TrackSegment {
  // Maze: a switchback pattern with back-to-back 69-degree turns
  // Shelves are angled at 21 degrees from horizontal (90 - 69 = 21)
  // Creates 3-5 corridors connected by angled passages
  const numCorridors = rngInt(rng, 3, 5);
  const corridorH = rngRange(rng, 120, 180); // height of each corridor section
  const turnH = rngRange(rng, 100, 140);     // height of the vertical connecting passage
  const mazeWidth = width * 1.4;             // total maze width (wider than normal track)
  const corridorWidth = width * 0.6;          // width of each corridor passage
  const mazeHW = mazeWidth / 2;

  // 69-degree turn: shelves tilt at 21 degrees from horizontal
  // The drop across the shelf length creates a 69-degree angle with the vertical flow
  const tiltAngle = 21 * Math.PI / 180; // 21 degrees in radians

  const x = prev.x;
  const y = prev.y;

  // Build outer walls (left/right) as a big bounding box that widens and narrows
  const leftPts: TrackPoint[] = [{ x: prev.leftX, y: prev.leftY }];
  const rightPts: TrackPoint[] = [{ x: prev.rightX, y: prev.rightY }];

  // Expand to maze width
  leftPts.push({ x: x - mazeHW, y: y + 30 });
  rightPts.push({ x: x + mazeHW, y: y + 30 });

  // Run the full maze height — account for extra Y from tilted shelves
  let curY = y + 30;
  const mazeBodyH = numCorridors * corridorH + (numCorridors - 1) * turnH;
  leftPts.push({ x: x - mazeHW, y: curY + mazeBodyH });
  rightPts.push({ x: x + mazeHW, y: curY + mazeBodyH });

  // Narrow back to track width at exit
  const exitY = curY + mazeBodyH + turnH;
  leftPts.push({ x: x - width / 2, y: exitY });
  rightPts.push({ x: x + width / 2, y: exitY });

  // Internal divider walls — angled shelves that force 69-degree turns
  // Each shelf tilts downward in the direction of the gap (guiding marbles toward it)
  const dividers: TrackPoint[][] = [];
  let shelfY = curY;

  for (let i = 0; i < numCorridors; i++) {
    shelfY += corridorH;

    if (i < numCorridors - 1) {
      // Alternate which side the gap is on
      const gapOnRight = i % 2 === 0;
      const shelfLeft = x - mazeHW + 10; // 10px inset from outer wall
      const shelfRight = x + mazeHW - 10;
      const gapSize = corridorWidth;

      // Calculate the Y drop across the shelf due to tilt
      let shelfStartX: number, shelfEndX: number;
      if (gapOnRight) {
        shelfStartX = shelfLeft;
        shelfEndX = shelfRight - gapSize;
      } else {
        shelfStartX = shelfLeft + gapSize;
        shelfEndX = shelfRight;
      }
      const shelfLen = Math.abs(shelfEndX - shelfStartX);
      const yDrop = Math.tan(tiltAngle) * shelfLen;

      if (gapOnRight) {
        // Shelf from left wall, gap on right — tilts down toward the gap (right)
        dividers.push([
          { x: shelfStartX, y: shelfY },
          { x: shelfEndX, y: shelfY + yDrop },
        ]);
      } else {
        // Shelf from right wall, gap on left — tilts down toward the gap (left)
        dividers.push([
          { x: shelfStartX, y: shelfY + yDrop },
          { x: shelfEndX, y: shelfY },
        ]);
      }

      shelfY += turnH;
    }
  }

  return {
    type: 'maze',
    points: leftPts,
    rightPoints: rightPts,
    dividers,
  };
}

function createSegment(
  type: SegmentType,
  prev: SegmentEnd,
  width: number,
  rng: () => number,
): TrackSegment {
  const hw = width / 2;
  const x = prev.x;
  const y = prev.y;
  const lx = prev.leftX;
  const ly = prev.leftY;
  const rx = prev.rightX;
  const ry = prev.rightY;

  switch (type) {
    case 'slope': {
      const h = rngRange(rng, 400, 700);
      const drift = rngRange(rng, -60, 60);
      const midDrift = drift * 0.5;
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: lx + midDrift * 0.3, y: y + h * 0.25 },
          { x: lx + midDrift, y: y + h * 0.5 },
          { x: lx + midDrift + (drift - midDrift) * 0.5, y: y + h * 0.75 },
          { x: x - hw + drift, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: rx + midDrift * 0.3, y: y + h * 0.25 },
          { x: rx + midDrift, y: y + h * 0.5 },
          { x: rx + midDrift + (drift - midDrift) * 0.5, y: y + h * 0.75 },
          { x: x + hw + drift, y: y + h },
        ]),
      };
    }

    case 'steep_slope': {
      const h = rngRange(rng, 500, 800);
      const drift = rngRange(rng, -30, 30);
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: lx + drift * 0.2, y: y + h * 0.25 },
          { x: lx + drift * 0.3, y: y + h * 0.5 },
          { x: x - hw * 0.9 + drift, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: rx + drift * 0.2, y: y + h * 0.25 },
          { x: rx + drift * 0.3, y: y + h * 0.5 },
          { x: x + hw * 0.9 + drift, y: y + h },
        ]),
      };
    }

    case 'flat': {
      const drift = rngRange(rng, -80, 80);
      const drop = rngRange(rng, 60, 140);
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: lx + drift * 0.3, y: y + drop * 0.3 },
          { x: lx + drift * 0.5, y: y + drop * 0.5 },
          { x: lx + drift, y: y + drop },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: rx + drift * 0.3, y: y + drop * 0.3 },
          { x: rx + drift * 0.5, y: y + drop * 0.5 },
          { x: rx + drift, y: y + drop },
        ]),
      };
    }

    case 'funnel': {
      const h = rngRange(rng, 400, 600);
      const narrowFactor = rngRange(rng, 0.6, 0.8);
      const drift = rngRange(rng, -40, 40);
      const funnelHW = Math.max(MIN_PASSAGE_WIDTH / 2, hw * narrowFactor);
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: (lx * 2 + x - funnelHW + drift) / 3, y: y + h * 0.33 },
          { x: (lx + x - funnelHW + drift) / 2, y: y + h * 0.66 },
          { x: x - funnelHW + drift, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: (rx * 2 + x + funnelHW + drift) / 3, y: y + h * 0.33 },
          { x: (rx + x + funnelHW + drift) / 2, y: y + h * 0.66 },
          { x: x + funnelHW + drift, y: y + h },
        ]),
      };
    }

    case 'wide_curve': {
      const h = rngRange(rng, 450, 700);
      const curveDir = rng() > 0.5 ? 1 : -1;
      const curveAmount = rngRange(rng, 60, 100) * curveDir;
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: lx + curveAmount * 0.2, y: y + h * 0.2 },
          { x: lx + curveAmount * 0.6, y: y + h * 0.4 },
          { x: lx + curveAmount, y: y + h * 0.5 },
          { x: lx + curveAmount * 0.8, y: y + h * 0.65 },
          { x: lx + curveAmount * 0.4, y: y + h * 0.85 },
          { x: lx + curveAmount * 0.2, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: rx + curveAmount * 0.2, y: y + h * 0.2 },
          { x: rx + curveAmount * 0.6, y: y + h * 0.4 },
          { x: rx + curveAmount, y: y + h * 0.5 },
          { x: rx + curveAmount * 0.8, y: y + h * 0.65 },
          { x: rx + curveAmount * 0.4, y: y + h * 0.85 },
          { x: rx + curveAmount * 0.2, y: y + h },
        ]),
      };
    }

    case 'zigzag': {
      const h = rngRange(rng, 600, 900);
      const zigs = rngInt(rng, 2, 3);
      const leftPoints: TrackPoint[] = [{ x: lx, y: ly }];
      const rightPoints: TrackPoint[] = [{ x: rx, y: ry }];
      const segH = h / zigs;

      for (let i = 0; i < zigs; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        // Gentler offset — no sharp turns
        const offset = dir * rngRange(rng, 40, 80);
        const py = y + segH * (i + 0.5);
        const endPy = y + segH * (i + 1);
        // Add midpoint for smooth curve
        leftPoints.push({ x: x - hw + offset, y: py });
        leftPoints.push({ x: x - hw + offset * 0.3, y: endPy });
        rightPoints.push({ x: x + hw + offset, y: py });
        rightPoints.push({ x: x + hw + offset * 0.3, y: endPy });
      }

      return {
        type,
        points: smoothPoints(leftPoints),
        rightPoints: smoothPoints(rightPoints),
      };
    }

    case 'drop': {
      const h = rngRange(rng, 400, 600);
      const drift = rngRange(rng, -25, 25);
      const dropNarrow = Math.max(MIN_PASSAGE_WIDTH / 2, hw * 0.5);
      // Smooth transition into narrow drop and back out
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: (lx * 2 + x - dropNarrow + drift) / 3, y: y + h * 0.15 },
          { x: x - dropNarrow + drift, y: y + h * 0.3 },
          { x: x - dropNarrow + drift, y: y + h * 0.7 },
          { x: (x - hw + drift + x - dropNarrow + drift) / 2, y: y + h * 0.85 },
          { x: x - hw + drift, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: (rx * 2 + x + dropNarrow + drift) / 3, y: y + h * 0.15 },
          { x: x + dropNarrow + drift, y: y + h * 0.3 },
          { x: x + dropNarrow + drift, y: y + h * 0.7 },
          { x: (x + hw + drift + x + dropNarrow + drift) / 2, y: y + h * 0.85 },
          { x: x + hw + drift, y: y + h },
        ]),
      };
    }

    case 'narrow': {
      const h = rngRange(rng, 400, 600);
      const narrowW = Math.max(MIN_PASSAGE_WIDTH, rngRange(rng, 140, 200));
      const drift = rngRange(rng, -30, 30);
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: (lx * 2 + x - narrowW / 2 + drift) / 3, y: y + h * 0.2 },
          { x: x - narrowW / 2 + drift, y: y + h * 0.35 },
          { x: x - narrowW / 2 + drift, y: y + h * 0.65 },
          { x: (x - hw + drift + x - narrowW / 2 + drift) / 2, y: y + h * 0.8 },
          { x: x - hw + drift, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: (rx * 2 + x + narrowW / 2 + drift) / 3, y: y + h * 0.2 },
          { x: x + narrowW / 2 + drift, y: y + h * 0.35 },
          { x: x + narrowW / 2 + drift, y: y + h * 0.65 },
          { x: (x + hw + drift + x + narrowW / 2 + drift) / 2, y: y + h * 0.8 },
          { x: x + hw + drift, y: y + h },
        ]),
      };
    }

    case 'gentle_bend': {
      const h = rngRange(rng, 400, 600);
      const bendDir = rng() > 0.5 ? 1 : -1;
      const bendAmount = rngRange(rng, 40, 70) * bendDir;
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: lx + bendAmount * 0.3, y: y + h * 0.25 },
          { x: lx + bendAmount * 0.5, y: y + h * 0.33 },
          { x: lx + bendAmount, y: y + h * 0.55 },
          { x: lx + bendAmount * 0.8, y: y + h * 0.75 },
          { x: lx + bendAmount * 0.5, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: rx + bendAmount * 0.3, y: y + h * 0.25 },
          { x: rx + bendAmount * 0.5, y: y + h * 0.33 },
          { x: rx + bendAmount, y: y + h * 0.55 },
          { x: rx + bendAmount * 0.8, y: y + h * 0.75 },
          { x: rx + bendAmount * 0.5, y: y + h },
        ]),
      };
    }

    case 'split': {
      // Split the track into multiple parallel channels (2-4) with curving dividers
      const numDividers = rngInt(rng, 1, 3); // 1-3 dividers = 2-4 channels
      const h = rngRange(rng, 700, 1000);
      const drift = rngRange(rng, -25, 25);
      // Widen the track proportionally to the number of channels
      const widthMult = 1.3 + numDividers * 0.25; // 1.55 for 1 div, 1.8 for 2, 2.05 for 3
      const splitWidth = width * rngRange(rng, widthMult - 0.1, widthMult + 0.1);
      const splitHW = splitWidth / 2;
      // Dividers start/end with gaps for entry/exit
      const dividerStartFrac = 0.12;
      const dividerEndFrac = 0.88;

      const centerX = x + drift;

      // Random curve parameters — entire split section curves together
      const curveDir = rng() > 0.5 ? 1 : -1;
      const curveAmount = rngRange(rng, 30, 90) * curveDir;
      // Sine-based lateral offset at each vertical fraction
      const curveAt = (frac: number) => curveAmount * Math.sin(frac * Math.PI);

      // Number of control points along the split for smooth curves
      const fracs = [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1.0];

      // Left wall: expand out, curve through the split, merge back
      const leftRaw: TrackPoint[] = fracs.map((f, i) => {
        if (i === 0) return { x: lx, y: ly };
        if (i === fracs.length - 1) return { x: x - hw + drift, y: y + h };
        const lateral = curveAt(f);
        return { x: centerX - splitHW + lateral, y: y + h * f };
      });

      // Right wall
      const rightRaw: TrackPoint[] = fracs.map((f, i) => {
        if (i === 0) return { x: rx, y: ry };
        if (i === fracs.length - 1) return { x: x + hw + drift, y: y + h };
        const lateral = curveAt(f);
        return { x: centerX + splitHW + lateral, y: y + h * f };
      });

      // Build divider paths — evenly spaced across the split width
      const dividers: TrackPoint[][] = [];
      for (let d = 0; d < numDividers; d++) {
        // Position divider at equal fractions across the width
        // e.g. 1 divider: 0.5 (center), 2 dividers: 0.333/0.667, 3: 0.25/0.5/0.75
        const divFrac = (d + 1) / (numDividers + 1);
        const divBaseX = centerX - splitHW + splitWidth * divFrac;

        // Each divider can have its own slight wobble on top of the main curve
        const wobbleAmount = rngRange(rng, -15, 15);

        // Build control points — only between dividerStartFrac and dividerEndFrac
        const divFracs = [dividerStartFrac, 0.25, 0.4, 0.5, 0.6, 0.75, dividerEndFrac];
        const divRaw: TrackPoint[] = divFracs.map(f => {
          const lateral = curveAt(f);
          const wobble = wobbleAmount * Math.sin(f * Math.PI * 2);
          return { x: divBaseX + lateral + wobble, y: y + h * f };
        });

        dividers.push(smoothPoints(divRaw));
      }

      return {
        type,
        points: smoothPoints(leftRaw),
        rightPoints: smoothPoints(rightRaw),
        dividers,
      };
    }

    case 'quarter_pipe': {
      // Curves to one side in an arc — marbles ride up the wall and come back
      const h = rngRange(rng, 500, 750);
      const dir = rng() > 0.5 ? 1 : -1;
      const reach = rngRange(rng, 80, 140) * dir;
      // Generate arc points
      const steps = 8;
      const leftArc: TrackPoint[] = [];
      const rightArc: TrackPoint[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Sine-based arc: goes out, peaks at 0.5, comes back
        const lateral = reach * Math.sin(t * Math.PI);
        const py = y + h * t;
        leftArc.push({ x: lx + lateral, y: py });
        rightArc.push({ x: rx + lateral, y: py });
      }
      return {
        type,
        points: smoothPoints(leftArc),
        rightPoints: smoothPoints(rightArc),
      };
    }

    case 'mini_ramp': {
      // Valley shape: track dips down then rises, then continues dropping
      const h = rngRange(rng, 500, 700);
      const drift = rngRange(rng, -30, 30);
      const dip = rngRange(rng, 40, 80); // how much the ramp dips sideways
      const rampDir = rng() > 0.5 ? 1 : -1;
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: lx + drift * 0.2 + rampDir * dip * 0.3, y: y + h * 0.15 },
          { x: lx + drift * 0.3 + rampDir * dip, y: y + h * 0.3 },
          { x: lx + drift * 0.4 + rampDir * dip * 0.8, y: y + h * 0.45 },
          { x: lx + drift * 0.5, y: y + h * 0.55 },
          { x: lx + drift * 0.6 - rampDir * dip * 0.3, y: y + h * 0.7 },
          { x: lx + drift * 0.8, y: y + h * 0.85 },
          { x: x - hw + drift, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: rx + drift * 0.2 + rampDir * dip * 0.3, y: y + h * 0.15 },
          { x: rx + drift * 0.3 + rampDir * dip, y: y + h * 0.3 },
          { x: rx + drift * 0.4 + rampDir * dip * 0.8, y: y + h * 0.45 },
          { x: rx + drift * 0.5, y: y + h * 0.55 },
          { x: rx + drift * 0.6 - rampDir * dip * 0.3, y: y + h * 0.7 },
          { x: rx + drift * 0.8, y: y + h * 0.85 },
          { x: x + hw + drift, y: y + h },
        ]),
      };
    }

    case 'lattice': {
      // Diamond lattice: staggered rows of short angled divider walls
      // Marbles weave through gaps, deflecting left/right at each row — like a Galton board
      // Wide gaps between walls so marbles can fall through easily
      const numRows = rngInt(rng, 3, 5);
      const h = rngRange(rng, 1000, 1500);
      const drift = rngRange(rng, -20, 20);
      // Widen track generously so there's lots of room between walls
      const latticeWidth = width * rngRange(rng, 1.6, 2.0);
      const latticeHW = latticeWidth / 2;

      const centerX = x + drift;

      // Generous vertical spacing between rows — big gaps for marbles to fall through
      const entryZone = h * 0.10;
      const exitZone = h * 0.10;
      const latticeH = h - entryZone - exitZone;
      const rowSpacing = latticeH / (numRows + 1);

      // Fewer, shorter walls per row — big gaps between them
      const wallsPerRow = rngInt(rng, 2, 4);
      // Shorter walls = wider gaps
      const wallLen = rngRange(rng, 40, 65);
      // Wall angle from horizontal (30-45 degrees) — steep enough to deflect
      const wallAngle = rngRange(rng, 30, 45) * Math.PI / 180;
      const wallDx = Math.cos(wallAngle) * wallLen / 2;
      const wallDy = Math.sin(wallAngle) * wallLen / 2;

      // Outer walls: expand to lattice width then contract back
      const leftPts: TrackPoint[] = [
        { x: lx, y: ly },
        { x: centerX - latticeHW, y: y + entryZone * 0.5 },
        { x: centerX - latticeHW, y: y + h - exitZone * 0.5 },
        { x: x - hw + drift, y: y + h },
      ];
      const rightPts: TrackPoint[] = [
        { x: rx, y: ry },
        { x: centerX + latticeHW, y: y + entryZone * 0.5 },
        { x: centerX + latticeHW, y: y + h - exitZone * 0.5 },
        { x: x + hw + drift, y: y + h },
      ];

      // Build diamond lattice divider walls — widely spaced
      const dividers: TrackPoint[][] = [];
      const inset = MARBLE_RADIUS * 4; // bigger inset from outer walls
      const usableWidth = latticeWidth - inset * 2;

      for (let row = 0; row < numRows; row++) {
        const rowY = y + entryZone + rowSpacing * (row + 1);
        const isOffset = row % 2 === 1;
        const nWalls = isOffset ? wallsPerRow - 1 : wallsPerRow;
        if (nWalls <= 0) continue;

        // Wide spacing between wall centers
        const spacing = usableWidth / (isOffset ? wallsPerRow : wallsPerRow + 1);
        const rowStartX = centerX - latticeHW + inset;

        for (let w = 0; w < nWalls; w++) {
          let wx: number;
          if (isOffset) {
            wx = rowStartX + spacing * (w + 1);
          } else {
            wx = rowStartX + spacing * (w + 0.5);
          }

          // Random jitter
          wx += rngRange(rng, -12, 12);
          const wy = rowY + rngRange(rng, -8, 8);

          // Alternate wall angle direction for diamond pattern
          const angleDir = (row + w) % 2 === 0 ? 1 : -1;

          dividers.push([
            { x: wx - wallDx, y: wy - wallDy * angleDir },
            { x: wx + wallDx, y: wy + wallDy * angleDir },
          ]);
        }
      }

      return {
        type,
        points: smoothPoints(leftPts),
        rightPoints: smoothPoints(rightPts),
        dividers,
      };
    }

    case 'half_pipe': {
      // U-shaped oscillation: track swings left then right (or vice versa)
      const h = rngRange(rng, 600, 900);
      const swingAmount = rngRange(rng, 80, 130);
      const dir = rng() > 0.5 ? 1 : -1;
      // Generate smooth S-curve oscillation
      return {
        type,
        points: smoothPoints([
          { x: lx, y: ly },
          { x: lx + dir * swingAmount * 0.4, y: y + h * 0.1 },
          { x: lx + dir * swingAmount, y: y + h * 0.2 },
          { x: lx + dir * swingAmount * 0.8, y: y + h * 0.3 },
          { x: lx, y: y + h * 0.4 },
          { x: lx - dir * swingAmount * 0.8, y: y + h * 0.5 },
          { x: lx - dir * swingAmount, y: y + h * 0.6 },
          { x: lx - dir * swingAmount * 0.8, y: y + h * 0.7 },
          { x: lx, y: y + h * 0.8 },
          { x: lx + dir * swingAmount * 0.3, y: y + h * 0.9 },
          { x: x - hw, y: y + h },
        ]),
        rightPoints: smoothPoints([
          { x: rx, y: ry },
          { x: rx + dir * swingAmount * 0.4, y: y + h * 0.1 },
          { x: rx + dir * swingAmount, y: y + h * 0.2 },
          { x: rx + dir * swingAmount * 0.8, y: y + h * 0.3 },
          { x: rx, y: y + h * 0.4 },
          { x: rx - dir * swingAmount * 0.8, y: y + h * 0.5 },
          { x: rx - dir * swingAmount, y: y + h * 0.6 },
          { x: rx - dir * swingAmount * 0.8, y: y + h * 0.7 },
          { x: rx, y: y + h * 0.8 },
          { x: rx + dir * swingAmount * 0.3, y: y + h * 0.9 },
          { x: x + hw, y: y + h },
        ]),
      };
    }

    default:
      return createSegment('slope', prev, width, rng);
  }
}

// Get the finish line Y position for detecting when marbles cross it
export function getFinishLineY(track: Track): number {
  const finishSeg = track.segments[track.segments.length - 1];
  return finishSeg.points[0].y;
}
