// Off Book — curtain-call notes sheet (T5).
// drawNotes(ctx, w, h, d) for a 2048×1280 canvas: a sheet 1.25 m × 0.78 m seen at 1.9 m, 1 degree ≈ 56 px.
// d = { title, timeSec, targetSec, eyesUp, zones: [l, c, r], opening, closing, said, total, weak: [{ n, text, help? }] }
// weak[i].help is optional: a phrase inside text (or an array of word indexes) where help was needed.
// Those words get the pencil underline. Without it the whole line is underlined.
// Paper under low light, ink text, no text smaller than 60 px (0.8 degree and up). No buttons: they are on the monitor.
import { color, font } from '../tokens.js';

const W = 2048;          // layout width; everything scales with w / W
const M = 112;           // side margin
const F = 82;            // body size: 0.8 degree cap height when the sheet is 27 degrees wide
const LH = 94;           // body line height
const INDENT = 120;      // hanging line-number column for the quoted lines

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const INK = color.ink;
const INK2 = rgba(color.ink, 0.74);   // 5.5:1 on paper

function setFont(ctx, weight, size, mono) {
  ctx.font = `${weight} ${size}px ${mono ? font.mono : font.ui}`;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function timeSentence(timeSec, targetSec) {
  if (targetSec == null) return '';          // try-out and weak-lines runs are not timed against a target
  const diff = Math.round(timeSec - targetSec), a = Math.abs(diff), target = mmss(targetSec);
  if (a === 0) return `Right on ${target}`;
  const amount = a < 60 ? `${a} second${a === 1 ? '' : 's'}` : mmss(a);
  return `${amount} ${diff > 0 ? 'over' : 'under'} ${target}`;
}
function gazeSentence(z) {
  const min = Math.min(z[0], z[1], z[2]), max = Math.max(z[0], z[1], z[2]);
  if (max - min < 8) return 'All three sides saw you about the same';
  if (min === z[0]) return 'Left side saw you least';
  if (min === z[2]) return 'Right side saw you least';
  return 'The middle saw you least';
}
function closingSentence(count) {
  if (count <= 0) return 'Every line was said to the room';
  return `${['One line', 'Two lines', 'Three lines'][Math.min(count, 3) - 1]} to run again`;
}

function parseWeak(item) {
  const text = String(item.text || '');
  let from = -1, to = -1;
  if (typeof item.help === 'string' && item.help) {
    from = text.indexOf(item.help);
    if (from >= 0) to = from + item.help.length;
  }
  const words = [], re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    const a = m.index, b = a + m[0].length;
    let mark = true;
    if (Array.isArray(item.help)) mark = item.help.indexOf(words.length) >= 0;
    else if (from >= 0) mark = a < to && b > from;
    words.push({ t: m[0], mark });
  }
  return words;
}
function wrap(ctx, words, maxW) {
  const space = ctx.measureText(' ').width, rows = [[]];
  let x = 0;
  for (const word of words) {
    const ww = ctx.measureText(word.t).width;
    if (x > 0 && x + ww > maxW) { rows.push([]); x = 0; }
    rows[rows.length - 1].push({ t: word.t, mark: word.mark, x, w: ww });
    x += ww + space;
  }
  return rows;
}

// The signature: one pencil stroke, drawn twice the way a hand goes back over a line.
function pencil(ctx, x0, x1, y, seed) {
  const r = rng(seed);
  ctx.save();
  ctx.strokeStyle = color.accentDim;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.5 : 0.92;
    ctx.lineWidth = pass ? 3 : 6;
    const a = x0 - 8 + r() * 10, b = x1 + 2 + r() * 12;
    const tilt = (r() - 0.5) * 6, drop = pass * 4;
    const steps = Math.max(2, Math.round((b - a) / 90));
    ctx.beginPath();
    ctx.moveTo(a, y + drop + (r() - 0.5) * 4);
    for (let i = 1; i <= steps; i++) {
      const px = a + (b - a) * i / steps, py = y + drop + tilt * i / steps + (r() - 0.5) * 5;
      const cx = a + (b - a) * (i - 0.5) / steps, cy = y + drop + tilt * (i - 0.5) / steps + (r() - 0.5) * 6;
      ctx.quadraticCurveTo(cx, cy, px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function seat(ctx, x, y, s, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + s, y, x + s, y + s, r);
  ctx.arcTo(x + s, y + s, x, y + s, r);
  ctx.arcTo(x, y + s, x, y, r);
  ctx.arcTo(x, y, x + s, y, r);
  ctx.closePath();
  ctx.fill();
}
// Seating plan as seen from the table: the seats you turned to are inked, the rest are left pale.
// 21 seats are drawn as the room is set (three blocks, rows of 2, 3 and 2, front row at the bottom); any other number as one row.
function seatingPlan(ctx, left, top, reached) {
  const S = 74, P = 84, GAP = 40, n = reached.length;
  const dot = (x, y, on) => { if (on) { ctx.fillStyle = INK; seat(ctx, x, y, S, 8); } else { ctx.strokeStyle = rgba(color.ink, 0.45); ctx.lineWidth = 5; ctx.strokeRect(x + 3, y + 3, S - 6, S - 6); } };   // given a line: inked; not yet: an empty chair
  if (n === 21) {
    const bw = 3 * P - (P - S); let i = 0;
    for (let b = 0; b < 3; b++) for (let r = 0; r < 3; r++) { const m = [2, 3, 2][r]; for (let k = 0; k < m; k++) dot(left + b * (bw + GAP) + (3 - m) * P / 2 + k * P, top + (2 - r) * P, reached[i++]); }
    return 3 * bw + 2 * GAP;
  }
  for (let k = 0; k < n; k++) dot(left + k * P, top + P, reached[k]);
  return n * P - (P - S);
}

function labelled(ctx, label, value, x, y, valueWeight) {
  setFont(ctx, 500, F);
  ctx.fillStyle = INK2;
  ctx.fillText(label, x, y);
  const lw = ctx.measureText(label + ' ').width;
  setFont(ctx, valueWeight, F);
  ctx.fillStyle = INK;
  ctx.fillText(value, x + lw, y);
}

export function drawNotes(ctx, w, h, d) {
  const k = w / W, H = h / k;
  const zones = Array.isArray(d.zones) && d.zones.length === 3 ? d.zones : [0, 0, 0];
  const weakIn = Array.isArray(d.weak) ? d.weak.slice(0, 3) : [];

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.scale(k, k);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // paper under one lamp: flat, a little darker toward the bottom edge
  ctx.fillStyle = '#b5a893';   // the paper token one step dimmer, so the sheet does not glare in a dark room
  ctx.fillRect(0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, rgba(color.ink, 0));
  shade.addColorStop(1, rgba(color.ink, 0.1));
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // measure the quoted lines first; they decide how much air the sheet has
  setFont(ctx, 500, F);
  const textW = W - 2 * M - INDENT;
  // one row per quoted line: a long line is cut at a word boundary, never wrapped and never given an ellipsis
  // If the phrase that needed help would fall off the end, words are dropped from the front instead, so the underline stays in view.
  const oneRow = (it) => {
    const words = parseWeak(it), last = words.map((w) => !!w.mark).lastIndexOf(true), first = words.findIndex((w) => w.mark);
    let start = 0, rows = wrap(ctx, words, textW);
    while (last >= 0 && rows[0].length < last - start + 1 && start < first) { start++; rows = wrap(ctx, words.slice(start), textW); }
    if (start > 0) {   // words were dropped from the front: say so with a leading ellipsis
      const dots = '\u2026 ', dw = ctx.measureText(dots).width;
      rows = wrap(ctx, words.slice(start), textW - dw);
      rows[0].forEach((w) => { w.x += dw; }); rows[0].unshift({ t: '\u2026', x: 0, w: dw, mark: false });
    }
    if (rows.length > 1) {              // the line runs on: end the row with an ellipsis so it reads as shortened, not cropped
      const dots = '\u2026', dw = ctx.measureText(' ' + dots).width, row = rows[0];
      while (row.length > 1 && row[row.length - 1].x + row[row.length - 1].w + dw > textW) row.pop();
      const lastW = row[row.length - 1]; row.push({ t: dots, x: lastW.x + lastW.w + ctx.measureText(' ').width * 0.4, w: dw, mark: false });
    }
    return rows.slice(0, 1);
  };
  const weak = weakIn.map((it) => ({ n: it.n, rows: oneRow(it) }));
  const ITEM_GAP = 10, TOP = 52, BOTTOM = 44;
  // first and last lines: one of five plain outcomes each; a weak-lines run has neither; a one-line script has one row
  const SAY = { clean: 'said to the room', looked: 'needed the full line', again: 'looked down again', fast: 'went past it quickly', twice: 'said it twice' };
  const say = (v) => (v === true ? SAY.clean : v === false ? SAY.looked : SAY[v] || null);
  const rows3 = [];
  if (say(d.opening)) rows3.push(['Opening line:', say(d.opening), 500]);
  if (say(d.closing) && d.total > 1) rows3.push(['Closing line:', say(d.closing) + (d.landed && d.closing === 'clean' ? ', and held' : ''), 500]);
  const plan = Array.isArray(d.reached) && d.reached.length ? d.reached : null, given = plan ? plan.filter(Boolean).length : 0;
  const hA = 150, hB = 2 * LH, hP = plan ? 268 : 0, hC = rows3.length * LH;
  const hD = LH + 8 + weak.length * LH + Math.max(0, weak.length - 1) * ITEM_GAP;
  const parts = [hA, hB, hP, hC, hD].filter((x) => x > 0);
  const free = H - TOP - BOTTOM - parts.reduce((a, b) => a + b, 0);
  const gap = Math.max(6, Math.min(64, free / (parts.length - 1)));
  let y = TOP;

  // 1. time
  if (d.title) { setFont(ctx, 400, F); ctx.fillStyle = INK2; ctx.textAlign = 'right'; ctx.fillText(String(d.title), W - M, y + 60, 1100); ctx.textAlign = 'left'; }
  setFont(ctx, 500, 132, true); ctx.fillStyle = INK;
  const stamp = mmss(d.timeSec); ctx.fillText(stamp, M - 6, y + 122);
  const stampW = ctx.measureText(stamp).width;
  setFont(ctx, 500, F); ctx.fillText(timeSentence(d.timeSec, d.targetSec), M + stampW + 40, y + 122);
  y += hA + gap;

  // 2. how long the head was up, and where it pointed
  setFont(ctx, 500, F); ctx.fillStyle = INK;
  ctx.fillText(`Head up ${Math.round(d.eyesUp)}% of the time`, M, y + 68);
  let zx = M;
  ['Left', 'Centre', 'Right'].forEach((name, i) => {
    setFont(ctx, 400, F); ctx.fillStyle = INK2; ctx.fillText(name, zx, y + 68 + LH); zx += ctx.measureText(name + ' ').width;
    setFont(ctx, 600, F); ctx.fillStyle = INK; const v = `${Math.round(zones[i])}%`; ctx.fillText(v, zx, y + 68 + LH); zx += ctx.measureText(v).width + 56;
  });
  y += hB + gap;

  // 3. the room as you left it: each inked seat is a person you gave a whole sentence to. No total: it is not a score.
  if (plan) {
    const pw = seatingPlan(ctx, M, y + 8, plan), tx = M + pw + 72;
    setFont(ctx, 500, F); ctx.fillStyle = INK;
    ctx.fillText(given ? 'You gave a full sentence' : 'Pick one person for', tx, y + 104);
    ctx.fillText(given ? `to ${given === 1 ? 'one person' : given + ' people'}` : 'each sentence', tx, y + 104 + LH);
    y += hP + gap;
  }

  // 4. first and last lines
  rows3.forEach(([label, value, weight], k) => labelled(ctx, label, value, M, y + 68 + k * LH, weight));
  if (hC) y += hC + gap;

  // 5. the count, and under it the lines to run again
  setFont(ctx, 500, F); ctx.fillStyle = INK;
  const head = `Said to the room: ${d.said} of ${d.total}` + (weak.length ? `. ${['One', 'Two', 'Three'][Math.min(weak.length, 3) - 1]} to run again` : '');
  ctx.fillText(head, M, y + 68);
  y += LH + 8;
  weak.forEach((item, wi) => {
    setFont(ctx, 400, F, true); ctx.fillStyle = INK2; ctx.textAlign = 'right'; ctx.fillText(String(item.n), M + 76, y + 68); ctx.textAlign = 'left';
    setFont(ctx, 500, F); ctx.fillStyle = INK;
    item.rows.forEach((row, ri) => {
      const base = y + 68 + ri * LH; let run = null;
      row.forEach((word, i) => {
        ctx.fillText(word.t, M + INDENT + word.x, base);
        if (word.mark) run = run ? { x0: run.x0, x1: word.x + word.w } : { x0: word.x, x1: word.x + word.w };
        if (run && (!word.mark || i === row.length - 1)) { pencil(ctx, M + INDENT + run.x0, M + INDENT + run.x1, base + 15, (Number(item.n) || wi + 1) * 131 + ri * 17 + i); run = null; }
      });
    });
    y += LH + ITEM_GAP;
  });

  ctx.restore();
}
