import Matter from 'matter-js';
import { MARBLE_RADIUS, COUNTDOWN_SECONDS, TICK_RATE, TRACK_WIDTH, } from '../../shared/types.js';
const { Engine, World, Bodies, Body, Composite } = Matter;
// ============================================================
// Seeded PRNG (mirrors client exactly)
// ============================================================
function createRNG(seed) {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function rngRange(rng, min, max) {
    return min + rng() * (max - min);
}
function rngInt(rng, min, max) {
    return Math.floor(rngRange(rng, min, max + 1));
}
function rngPick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
}
// ============================================================
// Track generation (mirrors client exactly)
// ============================================================
const MIN_PASSAGE_WIDTH = MARBLE_RADIUS * 2 * 3 + 20;
const SEGMENT_TYPES = [
    'slope', 'steep_slope', 'flat', 'funnel',
    'wide_curve', 'zigzag', 'drop', 'narrow', 'gentle_bend', 'split',
    'quarter_pipe', 'mini_ramp', 'half_pipe', 'lattice', 'lattice',
];
function getSegmentEnd(segment) {
    const leftEnd = segment.points[segment.points.length - 1];
    const rightEnd = segment.rightPoints[segment.rightPoints.length - 1];
    return {
        x: (leftEnd.x + rightEnd.x) / 2,
        y: Math.max(leftEnd.y, rightEnd.y),
        leftX: leftEnd.x, leftY: leftEnd.y,
        rightX: rightEnd.x, rightY: rightEnd.y,
    };
}
const MIN_ANGLE_DEG = 130;
function enforceMinAngle(points) {
    if (points.length < 3)
        return points;
    const minAngleRad = MIN_ANGLE_DEG * Math.PI / 180;
    let result = [...points];
    let changed = true;
    let passes = 0;
    while (changed && passes < 5) {
        changed = false;
        passes++;
        const next = [result[0]];
        for (let i = 1; i < result.length - 1; i++) {
            const a = result[i - 1];
            const b = result[i];
            const c = result[i + 1];
            const abx = a.x - b.x, aby = a.y - b.y;
            const cbx = c.x - b.x, cby = c.y - b.y;
            const dot = abx * cbx + aby * cby;
            const magA = Math.sqrt(abx * abx + aby * aby);
            const magC = Math.sqrt(cbx * cbx + cby * cby);
            if (magA < 1 || magC < 1) {
                next.push(b);
                continue;
            }
            const cosAngle = dot / (magA * magC);
            const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
            if (angle < minAngleRad) {
                next.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                next.push(b);
                next.push({ x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 });
                changed = true;
            }
            else {
                next.push(b);
            }
        }
        next.push(result[result.length - 1]);
        result = next;
    }
    return result;
}
function smoothPoints(points, subdivisions = 3) {
    if (points.length < 3)
        return enforceMinAngle(points);
    const result = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        for (let s = 1; s <= subdivisions; s++) {
            const t = s / (subdivisions + 1);
            const tt = t * t;
            const ttt = tt * t;
            const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt);
            const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt);
            result.push({ x, y });
        }
        result.push(p2);
    }
    return enforceMinAngle(result);
}
export function generateTrackServer(seed) {
    const rng = createRNG(seed);
    const segments = [];
    let trackWidth = TRACK_WIDTH;
    // Start funnel
    const funnelWidth = trackWidth * 1.5;
    const h = 250;
    segments.push({
        type: 'funnel',
        points: smoothPoints([
            { x: -funnelWidth / 2, y: 0 },
            { x: -funnelWidth / 2 + 20, y: h * 0.3 },
            { x: -trackWidth / 2 - 15, y: h * 0.7 },
            { x: -trackWidth / 2, y: h },
        ]),
        rightPoints: smoothPoints([
            { x: funnelWidth / 2, y: 0 },
            { x: funnelWidth / 2 - 20, y: h * 0.3 },
            { x: trackWidth / 2 + 15, y: h * 0.7 },
            { x: trackWidth / 2, y: h },
        ]),
    });
    let prevEnd = getSegmentEnd(segments[0]);
    // Opening maze — back-to-back 90-degree switchback turns
    const mazeSeg = createMazeSegmentServer(prevEnd, trackWidth, rng);
    segments.push(mazeSeg);
    prevEnd = getSegmentEnd(mazeSeg);
    const numSegs = rngInt(rng, 12, 18);
    for (let i = 0; i < numSegs; i++) {
        const segType = rngPick(rng, SEGMENT_TYPES);
        const seg = createServerSegment(segType, prevEnd, trackWidth, rng);
        segments.push(seg);
        prevEnd = getSegmentEnd(seg);
        trackWidth = Math.max(250, Math.min(450, trackWidth + rngRange(rng, -20, 20)));
    }
    // Finish
    const fx = prevEnd.x;
    const fy = prevEnd.y;
    const fw = trackWidth;
    segments.push({
        type: 'finish',
        points: smoothPoints([
            { x: prevEnd.leftX, y: prevEnd.leftY },
            { x: fx - fw / 2, y: fy + 140 },
            { x: fx - fw / 2, y: fy + 350 },
            { x: fx - fw * 0.7, y: fy + 500 },
        ]),
        rightPoints: smoothPoints([
            { x: prevEnd.rightX, y: prevEnd.rightY },
            { x: fx + fw / 2, y: fy + 140 },
            { x: fx + fw / 2, y: fy + 350 },
            { x: fx + fw * 0.7, y: fy + 500 },
        ]),
    });
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
    return {
        seed, segments,
        startX: (topLeft.x + topRight.x) / 2,
        startY: topLeft.y + 20,
        width: maxX - minX + 200, height: maxY - minY + 200,
        funnelLeft: topLeft.x,
        funnelRight: topRight.x,
        boundsMinX: minX, boundsMaxX: maxX,
        boundsMinY: minY, boundsMaxY: maxY,
    };
}
function createMazeSegmentServer(prev, width, rng) {
    const numCorridors = rngInt(rng, 3, 5);
    const corridorH = rngRange(rng, 120, 180);
    const turnH = rngRange(rng, 100, 140);
    const mazeWidth = width * 1.4;
    const corridorWidth = width * 0.6;
    const mazeHW = mazeWidth / 2;
    const tiltAngle = 21 * Math.PI / 180;
    const x = prev.x;
    const y = prev.y;
    const leftPts = [{ x: prev.leftX, y: prev.leftY }];
    const rightPts = [{ x: prev.rightX, y: prev.rightY }];
    leftPts.push({ x: x - mazeHW, y: y + 30 });
    rightPts.push({ x: x + mazeHW, y: y + 30 });
    let curY = y + 30;
    const mazeBodyH = numCorridors * corridorH + (numCorridors - 1) * turnH;
    leftPts.push({ x: x - mazeHW, y: curY + mazeBodyH });
    rightPts.push({ x: x + mazeHW, y: curY + mazeBodyH });
    const exitY = curY + mazeBodyH + turnH;
    leftPts.push({ x: x - width / 2, y: exitY });
    rightPts.push({ x: x + width / 2, y: exitY });
    const dividers = [];
    let shelfY = curY;
    for (let i = 0; i < numCorridors; i++) {
        shelfY += corridorH;
        if (i < numCorridors - 1) {
            const gapOnRight = i % 2 === 0;
            const shelfLeft = x - mazeHW + 10;
            const shelfRight = x + mazeHW - 10;
            const gapSize = corridorWidth;
            let shelfStartX, shelfEndX;
            if (gapOnRight) {
                shelfStartX = shelfLeft;
                shelfEndX = shelfRight - gapSize;
            }
            else {
                shelfStartX = shelfLeft + gapSize;
                shelfEndX = shelfRight;
            }
            const shelfLen = Math.abs(shelfEndX - shelfStartX);
            const yDrop = Math.tan(tiltAngle) * shelfLen;
            if (gapOnRight) {
                dividers.push([
                    { x: shelfStartX, y: shelfY },
                    { x: shelfEndX, y: shelfY + yDrop },
                ]);
            }
            else {
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
function createServerSegment(type, prev, width, rng) {
    const hw = width / 2;
    const x = prev.x, y = prev.y;
    const lx = prev.leftX, ly = prev.leftY;
    const rx = prev.rightX, ry = prev.rightY;
    switch (type) {
        case 'slope': {
            const sh = rngRange(rng, 400, 700);
            const drift = rngRange(rng, -60, 60);
            const midDrift = drift * 0.5;
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: lx + midDrift * 0.3, y: y + sh * 0.25 },
                    { x: lx + midDrift, y: y + sh * 0.5 }, { x: lx + midDrift + (drift - midDrift) * 0.5, y: y + sh * 0.75 },
                    { x: x - hw + drift, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: rx + midDrift * 0.3, y: y + sh * 0.25 },
                    { x: rx + midDrift, y: y + sh * 0.5 }, { x: rx + midDrift + (drift - midDrift) * 0.5, y: y + sh * 0.75 },
                    { x: x + hw + drift, y: y + sh },
                ]),
            };
        }
        case 'steep_slope': {
            const sh = rngRange(rng, 500, 800);
            const drift = rngRange(rng, -30, 30);
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: lx + drift * 0.2, y: y + sh * 0.25 },
                    { x: lx + drift * 0.3, y: y + sh * 0.5 }, { x: x - hw * 0.9 + drift, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: rx + drift * 0.2, y: y + sh * 0.25 },
                    { x: rx + drift * 0.3, y: y + sh * 0.5 }, { x: x + hw * 0.9 + drift, y: y + sh },
                ]),
            };
        }
        case 'flat': {
            const drift = rngRange(rng, -80, 80);
            const drop = rngRange(rng, 60, 140);
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: lx + drift * 0.3, y: y + drop * 0.3 },
                    { x: lx + drift * 0.5, y: y + drop * 0.5 }, { x: lx + drift, y: y + drop },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: rx + drift * 0.3, y: y + drop * 0.3 },
                    { x: rx + drift * 0.5, y: y + drop * 0.5 }, { x: rx + drift, y: y + drop },
                ]),
            };
        }
        case 'funnel': {
            const sh = rngRange(rng, 400, 600);
            const narrowFactor = rngRange(rng, 0.6, 0.8);
            const drift = rngRange(rng, -40, 40);
            const funnelHW = Math.max(MIN_PASSAGE_WIDTH / 2, hw * narrowFactor);
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: (lx * 2 + x - funnelHW + drift) / 3, y: y + sh * 0.33 },
                    { x: (lx + x - funnelHW + drift) / 2, y: y + sh * 0.66 }, { x: x - funnelHW + drift, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: (rx * 2 + x + funnelHW + drift) / 3, y: y + sh * 0.33 },
                    { x: (rx + x + funnelHW + drift) / 2, y: y + sh * 0.66 }, { x: x + funnelHW + drift, y: y + sh },
                ]),
            };
        }
        case 'wide_curve': {
            const sh = rngRange(rng, 450, 700);
            const curveDir = rng() > 0.5 ? 1 : -1;
            const curveAmount = rngRange(rng, 60, 100) * curveDir;
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: lx + curveAmount * 0.2, y: y + sh * 0.2 },
                    { x: lx + curveAmount * 0.6, y: y + sh * 0.4 }, { x: lx + curveAmount, y: y + sh * 0.5 },
                    { x: lx + curveAmount * 0.8, y: y + sh * 0.65 }, { x: lx + curveAmount * 0.4, y: y + sh * 0.85 },
                    { x: lx + curveAmount * 0.2, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: rx + curveAmount * 0.2, y: y + sh * 0.2 },
                    { x: rx + curveAmount * 0.6, y: y + sh * 0.4 }, { x: rx + curveAmount, y: y + sh * 0.5 },
                    { x: rx + curveAmount * 0.8, y: y + sh * 0.65 }, { x: rx + curveAmount * 0.4, y: y + sh * 0.85 },
                    { x: rx + curveAmount * 0.2, y: y + sh },
                ]),
            };
        }
        case 'zigzag': {
            const sh = rngRange(rng, 600, 900);
            const zigs = rngInt(rng, 2, 3);
            const leftPts = [{ x: lx, y: ly }];
            const rightPts = [{ x: rx, y: ry }];
            const segH = sh / zigs;
            for (let j = 0; j < zigs; j++) {
                const dir = j % 2 === 0 ? 1 : -1;
                const offset = dir * rngRange(rng, 40, 80);
                leftPts.push({ x: x - hw + offset, y: y + segH * (j + 0.5) });
                leftPts.push({ x: x - hw + offset * 0.3, y: y + segH * (j + 1) });
                rightPts.push({ x: x + hw + offset, y: y + segH * (j + 0.5) });
                rightPts.push({ x: x + hw + offset * 0.3, y: y + segH * (j + 1) });
            }
            return { type, points: smoothPoints(leftPts), rightPoints: smoothPoints(rightPts) };
        }
        case 'drop': {
            const sh = rngRange(rng, 400, 600);
            const drift = rngRange(rng, -25, 25);
            const dropNarrow = Math.max(MIN_PASSAGE_WIDTH / 2, hw * 0.5);
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: (lx * 2 + x - dropNarrow + drift) / 3, y: y + sh * 0.15 },
                    { x: x - dropNarrow + drift, y: y + sh * 0.3 }, { x: x - dropNarrow + drift, y: y + sh * 0.7 },
                    { x: (x - hw + drift + x - dropNarrow + drift) / 2, y: y + sh * 0.85 }, { x: x - hw + drift, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: (rx * 2 + x + dropNarrow + drift) / 3, y: y + sh * 0.15 },
                    { x: x + dropNarrow + drift, y: y + sh * 0.3 }, { x: x + dropNarrow + drift, y: y + sh * 0.7 },
                    { x: (x + hw + drift + x + dropNarrow + drift) / 2, y: y + sh * 0.85 }, { x: x + hw + drift, y: y + sh },
                ]),
            };
        }
        case 'narrow': {
            const sh = rngRange(rng, 400, 600);
            const narrowW = Math.max(MIN_PASSAGE_WIDTH, rngRange(rng, 140, 200));
            const drift = rngRange(rng, -30, 30);
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: (lx * 2 + x - narrowW / 2 + drift) / 3, y: y + sh * 0.2 },
                    { x: x - narrowW / 2 + drift, y: y + sh * 0.35 }, { x: x - narrowW / 2 + drift, y: y + sh * 0.65 },
                    { x: (x - hw + drift + x - narrowW / 2 + drift) / 2, y: y + sh * 0.8 }, { x: x - hw + drift, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: (rx * 2 + x + narrowW / 2 + drift) / 3, y: y + sh * 0.2 },
                    { x: x + narrowW / 2 + drift, y: y + sh * 0.35 }, { x: x + narrowW / 2 + drift, y: y + sh * 0.65 },
                    { x: (x + hw + drift + x + narrowW / 2 + drift) / 2, y: y + sh * 0.8 }, { x: x + hw + drift, y: y + sh },
                ]),
            };
        }
        case 'gentle_bend': {
            const sh = rngRange(rng, 400, 600);
            const bendDir = rng() > 0.5 ? 1 : -1;
            const bendAmount = rngRange(rng, 40, 70) * bendDir;
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly }, { x: lx + bendAmount * 0.3, y: y + sh * 0.25 },
                    { x: lx + bendAmount * 0.5, y: y + sh * 0.33 }, { x: lx + bendAmount, y: y + sh * 0.55 },
                    { x: lx + bendAmount * 0.8, y: y + sh * 0.75 }, { x: lx + bendAmount * 0.5, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry }, { x: rx + bendAmount * 0.3, y: y + sh * 0.25 },
                    { x: rx + bendAmount * 0.5, y: y + sh * 0.33 }, { x: rx + bendAmount, y: y + sh * 0.55 },
                    { x: rx + bendAmount * 0.8, y: y + sh * 0.75 }, { x: rx + bendAmount * 0.5, y: y + sh },
                ]),
            };
        }
        case 'split': {
            const numDividers = rngInt(rng, 1, 3);
            const sh = rngRange(rng, 700, 1000);
            const drift = rngRange(rng, -25, 25);
            const widthMult = 1.3 + numDividers * 0.25;
            const splitWidth = width * rngRange(rng, widthMult - 0.1, widthMult + 0.1);
            const splitHW = splitWidth / 2;
            const dividerStartFrac = 0.12;
            const dividerEndFrac = 0.88;
            const centerX = x + drift;
            const curveDir = rng() > 0.5 ? 1 : -1;
            const curveAmount = rngRange(rng, 30, 90) * curveDir;
            const curveAt = (frac) => curveAmount * Math.sin(frac * Math.PI);
            const fracs = [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1.0];
            const leftRaw = fracs.map((f, i) => {
                if (i === 0)
                    return { x: lx, y: ly };
                if (i === fracs.length - 1)
                    return { x: x - hw + drift, y: y + sh };
                const lateral = curveAt(f);
                return { x: centerX - splitHW + lateral, y: y + sh * f };
            });
            const rightRaw = fracs.map((f, i) => {
                if (i === 0)
                    return { x: rx, y: ry };
                if (i === fracs.length - 1)
                    return { x: x + hw + drift, y: y + sh };
                const lateral = curveAt(f);
                return { x: centerX + splitHW + lateral, y: y + sh * f };
            });
            const dividers = [];
            for (let d = 0; d < numDividers; d++) {
                const divFrac = (d + 1) / (numDividers + 1);
                const divBaseX = centerX - splitHW + splitWidth * divFrac;
                const wobbleAmount = rngRange(rng, -15, 15);
                const divFracs = [dividerStartFrac, 0.25, 0.4, 0.5, 0.6, 0.75, dividerEndFrac];
                const divRaw = divFracs.map(f => {
                    const lateral = curveAt(f);
                    const wobble = wobbleAmount * Math.sin(f * Math.PI * 2);
                    return { x: divBaseX + lateral + wobble, y: y + sh * f };
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
            const sh = rngRange(rng, 500, 750);
            const dir = rng() > 0.5 ? 1 : -1;
            const reach = rngRange(rng, 80, 140) * dir;
            const steps = 8;
            const leftArc = [];
            const rightArc = [];
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const lateral = reach * Math.sin(t * Math.PI);
                const py = y + sh * t;
                leftArc.push({ x: lx + lateral, y: py });
                rightArc.push({ x: rx + lateral, y: py });
            }
            return { type, points: smoothPoints(leftArc), rightPoints: smoothPoints(rightArc) };
        }
        case 'mini_ramp': {
            const sh = rngRange(rng, 500, 700);
            const drift = rngRange(rng, -30, 30);
            const dip = rngRange(rng, 40, 80);
            const rampDir = rng() > 0.5 ? 1 : -1;
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly },
                    { x: lx + drift * 0.2 + rampDir * dip * 0.3, y: y + sh * 0.15 },
                    { x: lx + drift * 0.3 + rampDir * dip, y: y + sh * 0.3 },
                    { x: lx + drift * 0.4 + rampDir * dip * 0.8, y: y + sh * 0.45 },
                    { x: lx + drift * 0.5, y: y + sh * 0.55 },
                    { x: lx + drift * 0.6 - rampDir * dip * 0.3, y: y + sh * 0.7 },
                    { x: lx + drift * 0.8, y: y + sh * 0.85 },
                    { x: x - hw + drift, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry },
                    { x: rx + drift * 0.2 + rampDir * dip * 0.3, y: y + sh * 0.15 },
                    { x: rx + drift * 0.3 + rampDir * dip, y: y + sh * 0.3 },
                    { x: rx + drift * 0.4 + rampDir * dip * 0.8, y: y + sh * 0.45 },
                    { x: rx + drift * 0.5, y: y + sh * 0.55 },
                    { x: rx + drift * 0.6 - rampDir * dip * 0.3, y: y + sh * 0.7 },
                    { x: rx + drift * 0.8, y: y + sh * 0.85 },
                    { x: x + hw + drift, y: y + sh },
                ]),
            };
        }
        case 'lattice': {
            // Diamond lattice: staggered rows of short angled divider walls — wide gaps
            const numRows = rngInt(rng, 3, 5);
            const sh = rngRange(rng, 1000, 1500);
            const drift = rngRange(rng, -20, 20);
            const latticeWidth = width * rngRange(rng, 1.6, 2.0);
            const latticeHW = latticeWidth / 2;
            const centerX = x + drift;
            const entryZone = sh * 0.10;
            const exitZone = sh * 0.10;
            const latticeH = sh - entryZone - exitZone;
            const rowSpacing = latticeH / (numRows + 1);
            const wallsPerRow = rngInt(rng, 2, 4);
            const wallLen = rngRange(rng, 40, 65);
            const wallAngle = rngRange(rng, 30, 45) * Math.PI / 180;
            const wallDx = Math.cos(wallAngle) * wallLen / 2;
            const wallDy = Math.sin(wallAngle) * wallLen / 2;
            const leftPts = [
                { x: lx, y: ly },
                { x: centerX - latticeHW, y: y + entryZone * 0.5 },
                { x: centerX - latticeHW, y: y + sh - exitZone * 0.5 },
                { x: x - hw + drift, y: y + sh },
            ];
            const rightPts = [
                { x: rx, y: ry },
                { x: centerX + latticeHW, y: y + entryZone * 0.5 },
                { x: centerX + latticeHW, y: y + sh - exitZone * 0.5 },
                { x: x + hw + drift, y: y + sh },
            ];
            const dividers = [];
            const inset = MARBLE_RADIUS * 4;
            const usableWidth = latticeWidth - inset * 2;
            for (let row = 0; row < numRows; row++) {
                const rowY = y + entryZone + rowSpacing * (row + 1);
                const isOffset = row % 2 === 1;
                const nWalls = isOffset ? wallsPerRow - 1 : wallsPerRow;
                if (nWalls <= 0)
                    continue;
                const spacing = usableWidth / (isOffset ? wallsPerRow : wallsPerRow + 1);
                const rowStartX = centerX - latticeHW + inset;
                for (let w = 0; w < nWalls; w++) {
                    let wx;
                    if (isOffset) {
                        wx = rowStartX + spacing * (w + 1);
                    }
                    else {
                        wx = rowStartX + spacing * (w + 0.5);
                    }
                    wx += rngRange(rng, -12, 12);
                    const wy = rowY + rngRange(rng, -8, 8);
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
            const sh = rngRange(rng, 600, 900);
            const swingAmount = rngRange(rng, 80, 130);
            const dir = rng() > 0.5 ? 1 : -1;
            return {
                type,
                points: smoothPoints([
                    { x: lx, y: ly },
                    { x: lx + dir * swingAmount * 0.4, y: y + sh * 0.1 },
                    { x: lx + dir * swingAmount, y: y + sh * 0.2 },
                    { x: lx + dir * swingAmount * 0.8, y: y + sh * 0.3 },
                    { x: lx, y: y + sh * 0.4 },
                    { x: lx - dir * swingAmount * 0.8, y: y + sh * 0.5 },
                    { x: lx - dir * swingAmount, y: y + sh * 0.6 },
                    { x: lx - dir * swingAmount * 0.8, y: y + sh * 0.7 },
                    { x: lx, y: y + sh * 0.8 },
                    { x: lx + dir * swingAmount * 0.3, y: y + sh * 0.9 },
                    { x: x - hw, y: y + sh },
                ]),
                rightPoints: smoothPoints([
                    { x: rx, y: ry },
                    { x: rx + dir * swingAmount * 0.4, y: y + sh * 0.1 },
                    { x: rx + dir * swingAmount, y: y + sh * 0.2 },
                    { x: rx + dir * swingAmount * 0.8, y: y + sh * 0.3 },
                    { x: rx, y: y + sh * 0.4 },
                    { x: rx - dir * swingAmount * 0.8, y: y + sh * 0.5 },
                    { x: rx - dir * swingAmount, y: y + sh * 0.6 },
                    { x: rx - dir * swingAmount * 0.8, y: y + sh * 0.7 },
                    { x: rx, y: y + sh * 0.8 },
                    { x: rx + dir * swingAmount * 0.3, y: y + sh * 0.9 },
                    { x: x + hw, y: y + sh },
                ]),
            };
        }
        default:
            return createServerSegment('slope', prev, width, rng);
    }
}
export function createServerRace(lobby, track, gravityScale = 0.0004) {
    const engine = Engine.create({
        gravity: { x: 0, y: 1, scale: gravityScale },
    });
    // Build track walls
    for (const segment of track.segments) {
        for (let i = 0; i < segment.points.length - 1; i++) {
            const p1 = segment.points[i];
            const p2 = segment.points[i + 1];
            Composite.add(engine.world, createWall(p1.x, p1.y, p2.x, p2.y));
        }
        for (let i = 0; i < segment.rightPoints.length - 1; i++) {
            const p1 = segment.rightPoints[i];
            const p2 = segment.rightPoints[i + 1];
            Composite.add(engine.world, createWall(p1.x, p1.y, p2.x, p2.y));
        }
        // Divider walls (for split segments — multiple dividers)
        if (segment.dividers) {
            for (const divider of segment.dividers) {
                for (let i = 0; i < divider.length - 1; i++) {
                    const p1 = divider[i];
                    const p2 = divider[i + 1];
                    Composite.add(engine.world, createWall(p1.x, p1.y, p2.x, p2.y));
                }
            }
        }
    }
    const finishSeg = track.segments[track.segments.length - 1];
    const finishY = finishSeg.points[0].y;
    const marbleBodies = new Map();
    const marbleConfigs = lobby.players.map(p => ({
        id: p.id, name: p.marbleName, color: p.marbleColor,
        isBot: p.isBot, ownerId: p.isBot ? undefined : p.id,
    }));
    const funnelLeft = track.funnelLeft + MARBLE_RADIUS + 5;
    const funnelRight = track.funnelRight - MARBLE_RADIUS - 5;
    const availableWidth = funnelRight - funnelLeft;
    const maxCols = Math.max(1, Math.floor(availableWidth / (MARBLE_RADIUS * 2 + 8)));
    const cols = Math.min(marbleConfigs.length, maxCols);
    marbleConfigs.forEach((mc, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const spacing = Math.min(MARBLE_RADIUS * 2 + 10, availableWidth / cols);
        const rowCols = Math.min(cols, marbleConfigs.length - row * cols);
        const offsetX = (col - (rowCols - 1) / 2) * spacing;
        const offsetY = row * (MARBLE_RADIUS * 2 + 6);
        const body = Bodies.circle(track.startX + offsetX, track.startY + offsetY, MARBLE_RADIUS, {
            restitution: 0.4, friction: 0.03, frictionAir: 0.005, density: 0.002,
        });
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 0.3, y: 0 });
        marbleBodies.set(mc.id, body);
        Composite.add(engine.world, body);
    });
    let status = 'countdown';
    let countdown = COUNTDOWN_SECONDS;
    let elapsedTime = 0;
    const finishedMarbles = new Set();
    const finishTimes = new Map();
    const disqualifiedMarbles = new Set();
    const dqPositions = new Map();
    let finishOrder = 0;
    const tickMs = 1000 / TICK_RATE;
    const OOB_MARGIN = 500;
    const stuckTracking = new Map();
    const STUCK_CHECK_INTERVAL = 800;
    const STUCK_THRESHOLD = 6;
    function isOutOfBounds(body) {
        const { x, y } = body.position;
        return (x < track.boundsMinX - OOB_MARGIN ||
            x > track.boundsMaxX + OOB_MARGIN ||
            y < track.boundsMinY - OOB_MARGIN ||
            y > track.boundsMaxY + OOB_MARGIN);
    }
    function tick() {
        if (status === 'countdown') {
            countdown -= tickMs / 1000;
            if (countdown <= 0) {
                status = 'racing';
                countdown = 0;
            }
            return;
        }
        if (status === 'racing') {
            Engine.update(engine, tickMs);
            elapsedTime += tickMs;
            for (const [id, body] of marbleBodies) {
                if (finishedMarbles.has(id) || disqualifiedMarbles.has(id))
                    continue;
                if (body.position.y >= finishY) {
                    finishedMarbles.add(id);
                    finishOrder++;
                    finishTimes.set(id, elapsedTime);
                }
                else if (isOutOfBounds(body)) {
                    disqualifiedMarbles.add(id);
                    dqPositions.set(id, { x: body.position.x, y: body.position.y, angle: body.angle });
                    Composite.remove(engine.world, body);
                }
            }
            for (const [id, body] of marbleBodies) {
                if (finishedMarbles.has(id) || disqualifiedMarbles.has(id))
                    continue;
                const tracking = stuckTracking.get(id);
                if (!tracking || elapsedTime - tracking.time >= STUCK_CHECK_INTERVAL) {
                    if (tracking) {
                        const dy = body.position.y - tracking.y;
                        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
                        if (dy < STUCK_THRESHOLD && speed < 2) {
                            const stuckCount = tracking.stuckCount + 1;
                            const force = Math.min(stuckCount, 8);
                            if (stuckCount >= 5) {
                                Body.setPosition(body, { x: body.position.x + (Math.random() - 0.5) * 40, y: body.position.y + 25 + stuckCount * 5 });
                                Body.setVelocity(body, { x: (Math.random() - 0.5) * 12, y: 8 + Math.random() * 6 + stuckCount * 2 });
                            }
                            else if (stuckCount >= 3) {
                                Body.setPosition(body, { x: body.position.x + (Math.random() - 0.5) * 25, y: body.position.y + 15 });
                                Body.setVelocity(body, { x: (Math.random() - 0.5) * 8, y: 6 + Math.random() * 4 });
                            }
                            else {
                                Body.setVelocity(body, {
                                    x: body.velocity.x + (Math.random() - 0.5) * 6 * force,
                                    y: body.velocity.y + (3 + Math.random() * 3) * force,
                                });
                            }
                            stuckTracking.set(id, { x: body.position.x, y: body.position.y, time: elapsedTime, stuckCount });
                        }
                        else {
                            stuckTracking.set(id, { x: body.position.x, y: body.position.y, time: elapsedTime, stuckCount: 0 });
                        }
                    }
                    else {
                        stuckTracking.set(id, { x: body.position.x, y: body.position.y, time: elapsedTime, stuckCount: 0 });
                    }
                }
            }
            // Race ends when all marbles are either finished or disqualified
            if (finishedMarbles.size + disqualifiedMarbles.size >= marbleConfigs.length) {
                status = 'finished';
            }
        }
    }
    function getState() {
        const marbleStates = [];
        for (const [id, body] of marbleBodies) {
            const isDQ = disqualifiedMarbles.has(id);
            const dqPos = dqPositions.get(id);
            marbleStates.push({
                id,
                x: isDQ && dqPos ? dqPos.x : body.position.x,
                y: isDQ && dqPos ? dqPos.y : body.position.y,
                angle: isDQ && dqPos ? dqPos.angle : body.angle,
                vx: isDQ ? 0 : body.velocity.x,
                vy: isDQ ? 0 : body.velocity.y,
                finished: finishedMarbles.has(id), finishTime: finishTimes.get(id),
                disqualified: isDQ,
            });
        }
        // Sort: finished first (by time), active by progress, DQ'd last
        marbleStates.sort((a, b) => {
            if (a.disqualified && !b.disqualified)
                return 1;
            if (!a.disqualified && b.disqualified)
                return -1;
            if (a.disqualified && b.disqualified)
                return 0;
            if (a.finished && b.finished)
                return (a.finishTime || 0) - (b.finishTime || 0);
            if (a.finished)
                return -1;
            if (b.finished)
                return 1;
            return b.y - a.y;
        });
        marbleStates.forEach((s, i) => { s.position = i + 1; });
        // Build results: finished sorted by time, then DQ'd
        const finished = marbleStates.filter(m => m.finished);
        const dqd = marbleStates.filter(m => m.disqualified);
        let pos = 0;
        const results = [
            ...finished.map(m => {
                pos++;
                const config = marbleConfigs.find(c => c.id === m.id);
                return { marbleId: m.id, marbleName: config.name, marbleColor: config.color, position: pos, finishTime: m.finishTime || 0 };
            }),
            ...dqd.map(m => {
                pos++;
                const config = marbleConfigs.find(c => c.id === m.id);
                return { marbleId: m.id, marbleName: config.name, marbleColor: config.color, position: pos, finishTime: -1 };
            }),
        ];
        return { status, countdown, elapsedTime, marbles: marbleStates, results };
    }
    return {
        tick, getState,
        isFinished: () => status === 'finished',
        destroy: () => { World.clear(engine.world, false); Engine.clear(engine); },
    };
}
function createWall(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    return Bodies.rectangle(cx, cy, length + 2, 10, {
        isStatic: true, angle, friction: 0.15, restitution: 0.4,
    });
}
//# sourceMappingURL=race.js.map