// Off Book: the countdown clock on the back wall of the hall.
// drawClock(ctx, w, h, { seconds, target, state }) for a 1024 x 320 canvas.
//
// The clock is 1.5 m wide and hangs 7 m away, so the whole canvas is about 12 degrees wide
// and 1 degree is about 85 px. Digits are 2.4 degrees tall. The target is set with a cap height
// of about 0.85 degrees.
//
//   seconds  normal / last30: seconds left (rounded up, as a countdown reads).
//            over: seconds past the target (the sign is ignored), counting up behind a minus.
//   target   target length in seconds, drawn as "/ 3:00".
//   state    'normal' | 'last30' | 'over'. If omitted it is derived from seconds
//            (negative = over, 30 or less = last30).
//
// Everything is geometry except the target, which is Atkinson Hyperlegible Mono.
// Fonts must already be loaded. Nothing is drawn outside w x h.

import { color, font } from '../tokens.js';

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd',
};
const SLANT = 0;                             // upright: with a slant the leading 1: read as !
const LAST30_TINT = 0.2;                    // how far the red moves toward white in the last 30 s

function mixToWhite(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * amount));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function fmt(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fillPoly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// A horizontal segment with mitred ends: x, y is its top-left, len its full length.
function hSeg(x, y, len, t, gap) {
  return [
    [x + t / 2 + gap, y + t / 2], [x + t + gap, y], [x + len - t - gap, y],
    [x + len - t / 2 - gap, y + t / 2], [x + len - t - gap, y + t], [x + t + gap, y + t],
  ];
}
// A vertical segment with mitred ends, running from y1 to y2.
function vSeg(x, y1, y2, t, gap) {
  return [
    [x + t / 2, y1 + gap], [x + t, y1 + t / 2 + gap], [x + t, y2 - t / 2 - gap],
    [x + t / 2, y2 - gap], [x, y2 - t / 2 - gap], [x, y1 + t / 2 + gap],
  ];
}

function drawDigit(ctx, digit, x, y, dw, dh, t, gap, on, ghost) {
  const segs = {
    a: hSeg(x, y, dw, t, gap),
    g: hSeg(x, y + (dh - t) / 2, dw, t, gap),
    d: hSeg(x, y + dh - t, dw, t, gap),
    f: vSeg(x, y + t / 2, y + dh / 2, t, gap),
    b: vSeg(x + dw - t, y + t / 2, y + dh / 2, t, gap),
    e: vSeg(x, y + dh / 2, y + dh - t / 2, t, gap),
    c: vSeg(x + dw - t, y + dh / 2, y + dh - t / 2, t, gap),
  };
  const lit = SEGMENTS[digit] || '';
  // unlit first, so a lit segment never sits under a ghost edge
  for (const k of Object.keys(segs)) if (lit.indexOf(k) < 0) fillPoly(ctx, segs[k], ghost);
  for (const k of Object.keys(segs)) if (lit.indexOf(k) >= 0) fillPoly(ctx, segs[k], on);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function drawClock(ctx, w, h, { seconds = 0, target = 180, state } = {}) {
  const u = h / 320; // every measure below is in px at 1024 x 320
  const st0 = state || (seconds < 0 ? 'over' : seconds <= 30 ? 'last30' : 'normal');
  const st = st0 === 'done' ? (seconds < 0 ? 'over' : 'normal') : st0;   // done: frozen final time
  const shown = Math.min(599, st === 'over' ? Math.floor(Math.abs(seconds)) : Math.ceil(Math.max(0, seconds)));
  const mins = Math.floor(shown / 60);
  const secs = shown % 60;

  const on = st === 'normal' ? color.clock : mixToWhite(color.clock, LAST30_TINT);
  const ghost = color.clockGhost;

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // housing: flat, with one thin neutral edge
  const edge = 2 * u;
  roundRect(ctx, edge, edge, w - edge * 2, h - edge * 2, 14 * u);
  ctx.fillStyle = color.n1;
  ctx.fill();
  ctx.lineWidth = edge;
  ctx.strokeStyle = color.n4;
  ctx.stroke();

  // layout, left to right: [minus slot] M : S S ........ / 3:00
  // the minus slot is always reserved so the digits do not jump when time runs out
  const pad = 40 * u;
  const mw = 56 * u;          // minus
  const dw = 116 * u;         // digit width
  const dh = 208 * u;         // digit height, 2.4 degrees
  const t = 22 * u;           // segment thickness
  const gap = 3 * u;          // air between segments
  const y0 = (h - dh) / 2;
  const yB = y0 + dh;
  const xMinus = pad;
  const xM = xMinus + mw + 16 * u;
  const xColon = xM + dw + 18 * u;
  const xS1 = xColon + t + 18 * u;
  const xS2 = xS1 + dw + 22 * u;
  const xEnd = xS2 + dw;

  // digits lean to the right about their baseline
  ctx.save();
  ctx.transform(1, 0, -SLANT, 1, SLANT * yB, 0);
  if (st === 'over') { ctx.fillStyle = on; ctx.fillRect(xMinus, y0 + (dh - t) / 2, mw, t); }   // a plain bar: the mitred segment read as a dot
  drawDigit(ctx, mins, xM, y0, dw, dh, t, gap, on, ghost);
  ctx.fillStyle = on;
  ctx.fillRect(xColon, y0 + dh * 0.32 - t / 2, t, t);
  ctx.fillRect(xColon, y0 + dh * 0.68 - t / 2, t, t);
  drawDigit(ctx, Math.floor(secs / 10), xS1, y0, dw, dh, t, gap, on, ghost);
  drawDigit(ctx, secs % 10, xS2, y0, dw, dh, t, gap, on, ghost);
  ctx.restore();

  // target, on the digits' baseline, right-aligned to the housing padding
  const label = `/ ${fmt(target)}`;
  let size = 108 * u;       // cap height about 72 px = 0.85 degrees
  ctx.font = `${font.weights.medium} ${size}px ${font.ui}`;
  const room = w - pad - (xEnd + 44 * u);
  const measured = ctx.measureText(label).width;
  if (measured > room && measured > 0) {
    size = Math.floor(size * (room / measured));
    ctx.font = `${font.weights.medium} ${size}px ${font.ui}`;
  }
  ctx.fillStyle = color.n7;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, w - pad, yB);

  ctx.restore();
}
