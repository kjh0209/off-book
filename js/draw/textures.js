// Off Book: three seamless, tileable textures for the hall. Canvas 2D only.
//
//   drawFloor(ctx, s)   worn floorboards, dark warm brown, boards running along y
//   drawWall(ctx, s)    painted plaster between n2 and n3, very low contrast
//   drawTable(ctx, s)   matte painted plywood, nearly plain, brushed along x
//
// s is the tile size in px (1024). ctx must belong to an untransformed canvas of at least s x s;
// each function fills exactly the square 0..s.
//
// Rules every function keeps:
//   one material per texture, seen from straight above, under flat even light: no shadows,
//   no highlights, no vignette.
//   deterministic: a seeded generator, so the same pixels every run.
//   seamless: every feature is either laid out on a grid that divides s exactly, or is drawn
//   again at +/- s so the part that leaves one edge enters at the opposite one.
//   structure, not noise: grain is straight lines along the board, plaster is broad soft patches.
//   Nothing here is meant to shimmer (the round-1 "water") or to speckle (the round-1 "granite").

import { color } from '../tokens.js';

function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const c = rgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}
function mix(hexA, hexB, t) {
  const a = rgb(hexA), b = rgb(hexB);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

const NINE = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

// Draw fn once, and again shifted by a tile in every direction, so anything that crosses an edge wraps.
function wrapped(ctx, s, fn) {
  for (const [ox, oy] of NINE) {
    ctx.save();
    ctx.translate(ox * s, oy * s);
    fn();
    ctx.restore();
  }
}

function begin(ctx, s, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, s, s);
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, s, s);
}

// A one-level dither. It is not a texture: it only stops the very soft gradients on these dark
// surfaces from showing as contour bands. Each pixel is independent, so it has no seam.
function dither(ctx, s, seed) {
  let img;
  try { img = ctx.getImageData(0, 0, s, s); } catch (e) { return; }
  const d = img.data;
  const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const v = r();
    const n = v < 0.25 ? -1 : v > 0.75 ? 1 : 0;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------------------
// Floor: eight boards across the tile, each column cut into two boards by staggered butt joints.
// A board has its own stain value, straight grain along its length, a few pores, sometimes a
// worn band down the middle. Joints are thin dark gaps with two nail heads at each board end.

const FLOOR = {
  columns: 8,            // must divide the tile: 8 boards of 128 px at 1024
  base: [46, 36, 26],    // dark warm brown
  gap: '#120d09',        // the joint between boards
  nail: '#0e0a07',
  seed: 0x0FB0A2D5,
};

function drawBoard(ctx, b, bw, k) {
  const r = rng(b.seed);
  const { x, y, len } = b;

  const m = 0.84 + r() * 0.3;
  const warm = (r() - 0.5) * 5;
  ctx.fillStyle = `rgb(${Math.round(FLOOR.base[0] * m + warm)},${Math.round(FLOOR.base[1] * m)},${Math.round(FLOOR.base[2] * m - warm * 0.6)})`;
  ctx.fillRect(x, y, bw, len);

  // wear: where feet have taken the stain off, a slightly paler band along the board
  if (r() < 0.55) {
    const a = 0.02 + r() * 0.03;
    const mid = 0.3 + r() * 0.4;
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    g.addColorStop(0, 'rgba(255,226,188,0)');
    g.addColorStop(mid, `rgba(255,226,188,${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,226,188,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw, len);
  }

  // grain: long, nearly straight lines running the whole length of the board
  const lines = 18 + Math.floor(r() * 10);
  for (let i = 0; i < lines; i++) {
    let gx = x + 6 * k + r() * (bw - 12 * k);
    const dark = r() < 0.72;
    const a = 0.05 + r() * 0.09;
    ctx.strokeStyle = dark ? `rgba(12,8,5,${a.toFixed(3)})` : `rgba(255,224,186,${(a * 0.45).toFixed(3)})`;
    ctx.lineWidth = (0.8 + r() * 1.4) * k;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    for (let j = 1; j <= 4; j++) {
      gx += (r() - 0.5) * 2.4 * k;
      ctx.lineTo(gx, y + (len * j) / 4);
    }
    ctx.stroke();
  }

  // pores: short dashes, strictly along the grain
  ctx.lineWidth = k;
  for (let i = 0; i < 46; i++) {
    const px = x + 5 * k + r() * (bw - 10 * k);
    const py = y + r() * len;
    const pl = (6 + r() * 16) * k;
    ctx.strokeStyle = `rgba(12,8,5,${(0.05 + r() * 0.05).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, Math.min(py + pl, y + len));
    ctx.stroke();
  }

  // an occasional small knot
  if (b.knot) {
    const kx = x + bw * (0.25 + r() * 0.5);
    const ky = y + len * (0.2 + r() * 0.6);
    const rx = (5 + r() * 3) * k;
    const ry = rx * (1.6 + r() * 0.5);
    ctx.fillStyle = 'rgba(18,12,8,0.75)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,8,5,0.14)';
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    ctx.ellipse(kx, ky, rx * 1.8, ry * 1.9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawFloorRaw(ctx, s = 1024) {
  const k = s / 1024;
  const r = rng(FLOOR.seed);
  const bw = s / FLOOR.columns;
  begin(ctx, s, `rgb(${FLOOR.base[0]},${FLOOR.base[1]},${FLOOR.base[2]})`);

  // lay out two boards per column; the joints are staggered by the golden ratio so no two line up
  const boards = [];
  for (let c = 0; c < FLOOR.columns; c++) {
    const y1 = (((c * 0.381966) % 1) + r() * 0.12) % 1 * s;
    const len1 = (0.38 + r() * 0.24) * s;
    boards.push({ x: c * bw, y: y1, len: len1, seed: Math.floor(r() * 1e9), knot: false });
    boards.push({ x: c * bw, y: y1 + len1, len: s - len1, seed: Math.floor(r() * 1e9), knot: false });
  }
  boards[3].knot = true;
  boards[8].knot = true;
  boards[13].knot = true;

  // a board that runs off the bottom edge comes back in at the top
  for (const b of boards) {
    for (const dy of [0, -s]) {
      ctx.save();
      ctx.translate(0, dy);
      drawBoard(ctx, b, bw, k);
      ctx.restore();
    }
  }

  // light scratches from chair legs, in any direction but mostly along the boards
  const scratches = [];
  for (let i = 0; i < 36; i++) {
    const ang = Math.PI / 2 + (r() - 0.5) * 1.1;
    const len = (20 + r() * 90) * k;
    scratches.push({ x: r() * s, y: r() * s, dx: Math.cos(ang) * len, dy: Math.sin(ang) * len, a: 0.03 + r() * 0.04, w: (1 + r() * 0.6) * k });
  }
  wrapped(ctx, s, () => {
    for (const q of scratches) {
      ctx.strokeStyle = `rgba(255,228,195,${q.a.toFixed(3)})`;
      ctx.lineWidth = q.w;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x + q.dx, q.y + q.dy);
      ctx.stroke();
    }
  });

  // joints between columns. The one on x = 0 is half here and half at x = s
  ctx.fillStyle = FLOOR.gap;
  for (let c = 0; c <= FLOOR.columns; c++) ctx.fillRect(c * bw - k, 0, 2 * k, s);

  // butt joints and nail heads at the start of every board
  for (const b of boards) {
    for (const dy of [0, -s]) {
      const y = b.y + dy;
      ctx.fillStyle = FLOOR.gap;
      ctx.fillRect(b.x, y - k, bw, 2 * k);
      ctx.fillStyle = FLOOR.nail;
      for (const side of [-1, 1]) {
        for (const fx of [0.18, 0.82]) {
          ctx.beginPath();
          ctx.arc(b.x + bw * fx, y + side * 11 * k, 2 * k, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  // a nail row within 11 px of the top or bottom edge needs its other half on the far side
  for (const b of boards) {
    const y = b.y % s;
    if (y < 14 * k || y > s - 14 * k) {
      const shift = y < 14 * k ? s : -s;
      ctx.fillStyle = FLOOR.gap;
      ctx.fillRect(b.x, y + shift - k, bw, 2 * k);
      ctx.fillStyle = FLOOR.nail;
      for (const side of [-1, 1]) {
        for (const fx of [0.18, 0.82]) {
          ctx.beginPath();
          ctx.arc(b.x + bw * fx, y + shift + side * 11 * k, 2 * k, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------------------
// Wall: painted plaster. A base halfway between n2 and n3, broad soft patches where the float
// left the plaster a little proud or a little hollow, wide roller passes, and the nap marks of
// the roller. Nothing leaves the n2..n3 range.

const WALL = { seed: 0x00A11E55, patches: 28, passes: 10, nap: 240 };

function drawWallRaw(ctx, s = 1024) {
  const k = s / 1024;
  const r = rng(WALL.seed);
  begin(ctx, s, mix(color.n2, color.n3, 0.5));

  // patches: soft discs toward n3 or n2
  const patches = [];
  for (let i = 0; i < WALL.patches; i++) {
    patches.push({ x: r() * s, y: r() * s, rad: (110 + r() * 190) * k, tone: r() < 0.5 ? color.n3 : color.n2, a: 0.25 + r() * 0.3 });
  }
  wrapped(ctx, s, () => {
    for (const p of patches) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rad);
      g.addColorStop(0, rgba(p.tone, p.a));
      g.addColorStop(0.5, rgba(p.tone, p.a * 0.55));
      g.addColorStop(1, rgba(p.tone, 0));
      ctx.fillStyle = g;
      ctx.fillRect(p.x - p.rad, p.y - p.rad, p.rad * 2, p.rad * 2);
    }
  });

  // roller passes: full-height bands (so they wrap in y by construction), repeated at +/- s in x
  for (let i = 0; i < WALL.passes; i++) {
    const x = r() * s;
    const wd = (70 + r() * 110) * k;
    const tone = r() < 0.5 ? color.n3 : color.n2;
    const a = 0.1 + r() * 0.12;
    for (const ox of [-s, 0, s]) {
      const g = ctx.createLinearGradient(x + ox, 0, x + ox + wd, 0);
      g.addColorStop(0, rgba(tone, 0));
      g.addColorStop(0.5, rgba(tone, a));
      g.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x + ox, 0, wd, s);
    }
  }

  // nap marks: short, soft, vertical
  const marks = [];
  for (let i = 0; i < WALL.nap; i++) {
    marks.push({ x: r() * s, y: r() * s, len: (60 + r() * 180) * k, w: (2 + r() * 3) * k, tone: r() < 0.5 ? color.n3 : color.n2, a: 0.05 + r() * 0.06 });
  }
  ctx.lineCap = 'round';
  wrapped(ctx, s, () => {
    for (const m of marks) {
      ctx.strokeStyle = rgba(m.tone, m.a);
      ctx.lineWidth = m.w;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x, m.y + m.len);
      ctx.stroke();
    }
  });

  ctx.restore();
  dither(ctx, s, WALL.seed + 1);
}

// ---------------------------------------------------------------------------------------
// Table: plywood under matte dark paint. Nearly plain: faint brush lines the full width of the
// tile (so they wrap in x by construction) and a handful of dull scuffs.

const TABLE = { seed: 0x007AB1E5, strokes: 220, scuffs: 10 };

function drawTableRaw(ctx, s = 1024) {
  const k = s / 1024;
  const r = rng(TABLE.seed);
  begin(ctx, s, mix(color.n2, color.n3, 0.3));

  // brush lines
  for (let i = 0; i < TABLE.strokes; i++) {
    const y = r() * s;
    const wd = (1 + r() * 2) * k;
    const tone = r() < 0.5 ? color.n1 : color.n3;
    ctx.fillStyle = rgba(tone, 0.04 + r() * 0.07);
    for (const oy of [-s, 0, s]) ctx.fillRect(0, y + oy - wd / 2, s, wd);
  }

  // scuffs
  const scuffs = [];
  for (let i = 0; i < TABLE.scuffs; i++) {
    const ang = (r() - 0.5) * 1.6;
    const len = (30 + r() * 110) * k;
    scuffs.push({ x: r() * s, y: r() * s, dx: Math.cos(ang) * len, dy: Math.sin(ang) * len, w: (1.5 + r() * 2.5) * k, a: 0.05 + r() * 0.06 });
  }
  ctx.lineCap = 'round';
  wrapped(ctx, s, () => {
    for (const q of scuffs) {
      ctx.strokeStyle = rgba(color.n4, q.a);
      ctx.lineWidth = q.w;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x + q.dx, q.y + q.dy);
      ctx.stroke();
    }
  });

  ctx.restore();
  dither(ctx, s, TABLE.seed + 1);
}

// The drawings above wrap by construction, but anti-aliased strokes that cross the tile edge leave a faint line
// (about 1.4 grey levels on the floor's horizontal wrap). heal() pulls the few rows and columns on either side of
// each wrap toward their shared average, so the first and last lines match exactly and the seam ratio drops below 1.
function heal(ctx, s, band = 6) {
  const im = ctx.getImageData(0, 0, s, s), d = im.data;
  for (let k = 0; k < band; k++) {
    const w = (1 - k / band) * 0.5;
    for (let x = 0; x < s; x++) {            // rows k and s-1-k face each other across the horizontal wrap
      const a = (k * s + x) * 4, b = ((s - 1 - k) * s + x) * 4;
      for (let c = 0; c < 3; c++) { const m = (d[a + c] + d[b + c]) / 2; d[a + c] += (m - d[a + c]) * 2 * w; d[b + c] += (m - d[b + c]) * 2 * w; }
    }
    for (let y = 0; y < s; y++) {            // columns k and s-1-k across the vertical wrap
      const a = (y * s + k) * 4, b = (y * s + s - 1 - k) * 4;
      for (let c = 0; c < 3; c++) { const m = (d[a + c] + d[b + c]) / 2; d[a + c] += (m - d[a + c]) * 2 * w; d[b + c] += (m - d[b + c]) * 2 * w; }
    }
  }
  ctx.putImageData(im, 0, 0);
}
export function drawFloor(ctx, s = 1024) { drawFloorRaw(ctx, s); heal(ctx, s); }
export function drawWall(ctx, s = 1024) { drawWallRaw(ctx, s); heal(ctx, s); }
export function drawTable(ctx, s = 1024) { drawTableRaw(ctx, s); heal(ctx, s); }
