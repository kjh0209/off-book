// Off Book — question card (T5). Stands where the notes sheet stood, on the same paper.
// drawQuestion(ctx, w, h, { text, phase: 'breathe' | 'answer' | 'check', t, focus? }) for a 1536×640 canvas.
// breathe: the question, and a ring that fills as t goes 0..1 (two seconds) around the word "Breathe".
// answer:  the question stays exactly where it was; a thin bar along the bottom runs down as t goes 0..1.
// check:   one sentence and two targets. focus (optional) is 0 for "Yes", 1 for "Not yet".
// 1 degree ≈ 56 px. No text under 60 px. Targets are 7.5 × 3.3 degrees, 1.1 degrees apart.
import { color, font, radius } from '../tokens.js';

const W = 1536;
const M = 96;

// hit areas of the two targets in 1536×640 texture pixels, for the scene's ray test
export const questionTargets = [
  { id: 'yes', x: 96, y: 360, w: 420, h: 184 },
  { id: 'not-yet', x: 580, y: 360, w: 420, h: 184 },
];

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${font.ui}`;
}
function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}
function wrapText(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean), rows = [];
  let row = '';
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (row && ctx.measureText(next).width > maxW) { rows.push(row); row = word; } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The question keeps one size and one position through breathe and answer, so nothing jumps between phases.
function question(ctx, text, top, height, maxW) {
  const sizes = [84, 76, 68, 60];
  let size = 60, lh = 72, rows = [];
  for (const s of sizes) {
    size = s;
    lh = Math.round(s * 1.2 / 4) * 4;
    setFont(ctx, 500, s);
    rows = wrapText(ctx, text, maxW);
    if (rows.length * lh <= height) break;
  }
  const y0 = top + Math.max(0, (height - rows.length * lh) / 2);
  ctx.fillStyle = color.ink;
  rows.forEach((row, i) => ctx.fillText(row, M, y0 + i * lh + Math.round(size * 0.92)));
}

export function drawQuestion(ctx, w, h, s) {
  const k = w / W, H = h / k;
  const phase = s.phase === 'answer' || s.phase === 'check' ? s.phase : 'breathe';
  const t = clamp01(s.t);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.scale(k, k);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#b5a893';
  ctx.fillRect(0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, rgba(color.ink, 0));
  shade.addColorStop(1, rgba(color.ink, 0.1));
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  if (phase === 'check') {
    setFont(ctx, 500, 64);
    ctx.fillStyle = color.ink;
    const rows = wrapText(ctx, 'Did your first sentence answer the question?', W - 2 * M);
    const blockTop = 96 + Math.max(0, (208 - rows.length * 80) / 2);
    rows.forEach((row, i) => ctx.fillText(row, M, blockTop + 60 + i * 80));

    ['Yes', 'Not yet'].forEach((label, i) => {
      const b = questionTargets[i], on = s.focus === i;
      roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, radius.card);
      if (on) { ctx.fillStyle = color.ink; ctx.fill(); }
      ctx.strokeStyle = color.ink;
      ctx.lineWidth = 4;
      ctx.stroke();
      setFont(ctx, 500, 72);
      ctx.fillStyle = on ? '#b5a893' : color.ink;
      ctx.textAlign = 'center';
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 26);
      ctx.textAlign = 'left';
    });
    ctx.restore();
    return;
  }

  // question on the left, in the same place for both phases
  const RING = 340, TOP = 80, AREA = H - 2 * TOP - 56;
  question(ctx, s.text, TOP, AREA, W - 2 * M - RING - 64);

  if (phase === 'breathe') {
    const cx = W - M - RING / 2, cy = TOP + AREA / 2, r = 156;
    ctx.lineWidth = 16;
    ctx.strokeStyle = rgba(color.ink, 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (t > 0) {
      ctx.strokeStyle = color.ink;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    setFont(ctx, 500, 64);
    ctx.fillStyle = color.ink;
    ctx.textAlign = 'center';
    ctx.fillText('Breathe', cx, cy + 26);
    ctx.textAlign = 'left';
  } else {
    // time left to answer: a thin bar that empties toward the left
    const x = M, y = H - TOP - 12, full = W - 2 * M, left = full * (1 - t);
    ctx.fillStyle = rgba(color.ink, 0.16);
    roundRect(ctx, x, y, full, 12, 6);
    ctx.fill();
    if (left >= 12) {
      ctx.fillStyle = color.ink;
      roundRect(ctx, x, y, left, 12, 6);
      ctx.fill();
    }
  }
  ctx.restore();
}
