// Off Book: the confidence monitor screen and the hand-status plate. Canvas 2D only.
import { color, font, levels } from '../tokens.js';

// Design space 2048 x 592 = a 0.90 x 0.26 m screen seen from 1.30 m.
// 0.90 m at 1.30 m spans about 38 degrees, so one degree of visual angle is about 52 px.
const W = 2048, H = 592, DEG = 52;
const PAD = 64;                    // 1.2 degrees of margin left and right
const MAXW = W - 2 * PAD;          // a row is at most 37 degrees wide
const CAP_PROMPT = 1.18 * DEG;     // prompt cap height: the 1.0 degree rule plus a small reserve
const CAP_SMALL = 0.90 * DEG;      // reveal, next line and footer: the 0.8 degree floor
// Fixed baselines, so nothing jumps when the reveal appears or a line wraps.
// Each zone holds two rows; a single row sits centred (prompt, next) or nearest the prompt (reveal).
const Y = { reveal: [70, 132], prompt: [212, 318], rule: 356, next: [426, 486], foot: 558 };

// ---- small helpers -------------------------------------------------------
// Font size whose capital H is `cap` px tall, measured from the loaded face (about 0.68 em).
function sizeFor(ctx, weight, cap) {
  ctx.font = `${weight} 100px ${font.ui}`;
  const a = ctx.measureText('H').actualBoundingBoxAscent;
  return Math.ceil(cap / ((a > 50 && a < 90 ? a : 68) / 100));
}
const setFont = (ctx, weight, px) => { ctx.font = `${weight} ${px}px ${font.ui}`; };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = (a) => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Focus mark: four accent bracket corners just outside the target.
function brackets(ctx, x, y, w, h, arm, lw) {
  ctx.strokeStyle = color.accent; ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  ctx.beginPath();
  [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]].forEach(([cx, cy, sx, sy]) => {
    ctx.moveTo(cx + sx * arm, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * arm);
  });
  ctx.stroke();
}

// One hand-drawn pencil stroke from x0 to x1. Same seed, same stroke, so an underline
// does not change shape when the level changes.
function pencil(ctx, x0, x1, y, seed, lw, col) {
  const r = rng(seed), j = (a) => (r() - 0.5) * 2 * a;
  const n = Math.max(2, Math.round((x1 - x0) / 90));   // one bend about every 1.7 degrees
  const slope = j(4), alpha = ctx.globalAlpha;
  ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {               // a firm stroke, then a lighter retrace
    let px = x0 - 6 + j(5), py = y + j(3);
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 1; i <= n; i++) {
      const x = i === n ? x1 + 4 + j(6) : x0 + (x1 - x0) * i / n + j(8);
      const yy = y + j(3) + slope * i / n;
      ctx.quadraticCurveTo((px + x) / 2 + j(6), (py + yy) / 2 + j(4), x, yy);
      px = x; py = yy;
    }
    ctx.lineWidth = pass ? lw * 0.45 : lw;
    ctx.globalAlpha = alpha * (pass ? 0.55 : 1);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}

// Measure words with the current font and place them on one row, or two balanced rows.
// A break prefers punctuation and never splits two neighbouring key words if it can help it.
function layout(ctx, words) {
  const sp = ctx.measureText(' ').width;
  const m = words.map((o, i) => {
    const core = /^(.*?)[.,;:!?'")\]]*$/.exec(o.t)[1] || o.t;
    return { o, i, w: ctx.measureText(o.t).width, cw: ctx.measureText(core).width, tail: core !== o.t, row: 0, x: 0 };
  });
  const span = (a, b) => m.slice(a, b).reduce((s, x) => s + x.w, 0) + sp * Math.max(0, b - a - 1);
  let cut = m.length, fits = span(0, m.length) <= MAXW;
  if (!fits) {
    let best = Infinity;
    for (let i = 1; i < m.length; i++) {
      const a = span(0, i), b = span(i, m.length), over = a > MAXW || b > MAXW;
      const cost = Math.abs(a - b) + (over ? 1e6 : 0)
        - (/[.,;:]$/.test(m[i - 1].o.t) ? MAXW * 0.12 : 0)
        + (m[i - 1].o.key && m[i].o.key ? MAXW * 0.2 : 0);
      if (cost < best) { best = cost; cut = i; fits = !over; }
    }
  }
  let x = PAD;
  m.forEach((it, i) => { if (i === cut) x = PAD; it.row = i < cut ? 0 : 1; it.x = x; x += it.w + sp; });
  return { items: m, rows: cut < m.length ? 2 : 1, fits };
}
// Lay out at `px`; only a line too long for two rows is set smaller, down to 86 percent.
function fit(ctx, words, weight, px) {
  let L, size = px;
  do { setFont(ctx, weight, size); L = layout(ctx, words); size -= 2; } while (!L.fits && size > px * 0.86);
  return L;
}
const rowsOf = (L, y) => (L.rows === 2 ? y : [(y[0] + y[1]) / 2, 0]);

// Which words stay at each level, and which of those carry the pencil underline.
const kept = (lv, peek) => (m) => peek || lv === 0 || (lv === 1 && !!m.o.key) || (lv === 2 && m.i === 0);
const marked = (lv, peek) => (m) => (peek || lv === 1 ? !!m.o.key : lv === 2 && m.i === 0);

// Draw one laid-out line: kept words as text, dropped words as a rule sitting on the baseline.
function drawRun(ctx, L, base, st) {
  const it = L.items;
  it.forEach((m) => {
    const y = base[m.row];
    if (st.show(m)) { ctx.fillStyle = st.ink; ctx.fillText(m.o.t, m.x, y); }
    else { ctx.fillStyle = st.rule; ctx.fillRect(m.x, y - st.ruleH, m.cw, st.ruleH); }
  });
  for (let a = 0; a < it.length; a++) {
    if (!st.under(it[a])) continue;
    let b = a;   // one stroke under a whole phrase: neighbouring kept words, same row, no punctuation between
    while (b + 1 < it.length && st.under(it[b + 1]) && it[b + 1].row === it[a].row && !it[b].tail) b++;
    pencil(ctx, it[a].x, it[b].x + it[b].cw, base[it[a].row] + st.dy, hash(it[a].o.t + ':' + a), st.penW, st.pen);
    a = b;
  }
}

// ---- monitor -------------------------------------------------------------
// s = { level 0..3, words [{t, key}], next [{t, key}] | null, index (1-based, as shown), total,
//       peek, reveal null | {text, alpha}, mode 'rehearse' | 'curtain', focus 0 | 1 }
// Optional: s.nextLevel (defaults to level), s.buttons [{label, sub}] for curtain mode.
export function drawMonitor(ctx, w, h, s) {
  ctx.save();
  ctx.scale(w / W, h / H);
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color.n1; ctx.fillRect(0, 0, W, H);
  const big = sizeFor(ctx, 500, CAP_PROMPT), small = sizeFor(ctx, 400, CAP_SMALL);

  if (s.mode === 'curtain' || s.mode === 'menu') {
    // Every choice is made on the monitor, where the hands already act: 2 buttons (curtain call, questions),
    // 3 across (pause) or 2 x 2 (scripts). Targets are at least 4.2 degrees tall and 1 degree apart.
    const B = s.buttons || [{ label: 'Run the weak lines', sub: '3 lines, about a minute' }, { label: 'Done for tonight' }];
    const cols = s.cols || 2, rows = Math.ceil(B.length / cols), focus = s.focus || 0;
    const mx = cols === 2 ? 80 : 56, gx = cols === 2 ? 80 : 64, gy = 56;
    const top = rows === 1 ? 96 : 40, bh = rows === 1 ? 400 : (H - 2 * top - (rows - 1) * gy) / rows;
    const bw = (W - 2 * mx - (cols - 1) * gx) / cols, padX = cols === 2 ? 56 : 40, inner = bw - 2 * padX;
    // one label size for the whole menu: the largest at which the longest label fits (shrink, never squeeze)
    let px = big; setFont(ctx, 500, px);
    while (px > small && B.some((b) => ctx.measureText(b.label).width > inner)) { px -= 2; setFont(ctx, 500, px); }
    B.forEach((b, i) => {
      const r = Math.floor(i / cols), inRow = Math.min(cols, B.length - r * cols), shift = (cols - inRow) * (bw + gx) / 2;   // a short last row is centred
      const bx = mx + shift + (i % cols) * (bw + gx), by = top + r * (bh + gy), cy = by + bh / 2, on = i === focus;
      roundRect(ctx, bx, by, bw, bh, 16);
      ctx.fillStyle = on ? color.n8 : color.n2; ctx.fill();
      if (!on) { ctx.strokeStyle = color.n4; ctx.lineWidth = 2; ctx.stroke(); }
      setFont(ctx, 500, px);
      const cap = CAP_PROMPT * px / big;
      ctx.fillStyle = on ? color.ink : color.n8;
      ctx.fillText(b.label, bx + padX, b.sub ? cy - 14 : cy + cap / 2);
      if (b.sub) { setFont(ctx, 400, small); ctx.fillStyle = on ? color.n4 : color.n7; ctx.fillText(b.sub, bx + padX, cy + (rows === 1 ? 70 : 62), inner); }
      if (on) { const o = rows === 1 ? 20 : 14; brackets(ctx, bx - o, by - o, bw + 2 * o, bh + 2 * o, rows === 1 ? 64 : 48, 8); }
    });
    ctx.restore();
    return;
  }

  // A short message with nothing to choose: "Look straight ahead and pinch to begin".
  if (s.mode === 'message') {
    setFont(ctx, 500, big); ctx.fillStyle = color.n8; ctx.fillText(s.title || '', PAD, Y.prompt[0] + 40, MAXW);
    if (s.sub) { setFont(ctx, 400, small); ctx.fillStyle = color.n7; ctx.fillText(s.sub, PAD, Y.prompt[1] + 60, MAXW); }
    ctx.restore();
    return;
  }

  // One sentence of help in the top zone: the first-run instruction, or which hand is not seen.
  // The top zone holds one thing at a time: an instruction, "hand not seen", or the line just passed ("Line 6 was: ...").
  // It is dimmer than the script and never the same weight, so nobody reads it aloud as their line. Up to two rows.
  if (s.hint) {
    setFont(ctx, 400, small); ctx.fillStyle = s.hintInk === 'faint' ? color.n6 : color.n7;
    const words = String(s.hint).split(/\s+/), rows = [[]]; let x = 0; const sp = ctx.measureText(' ').width;
    for (const w of words) { const ww = ctx.measureText(w).width; if (x > 0 && x + ww > MAXW) { rows.push([]); x = 0; } rows[rows.length - 1].push(w); x += ww + sp; }
    if (rows.length > 2) { rows.length = 2; rows[1].push('\u2026'); }
    const twoPrompt = s.words && s.words.length && fit(ctx, s.words, 500, big).rows === 2;
    setFont(ctx, 400, small);
    if (rows.length === 1) { ctx.fillText(rows[0].join(' '), PAD, twoPrompt ? 84 : 96, MAXW); ctx.fillStyle = color.n4; ctx.fillRect(PAD, twoPrompt ? 108 : 124, MAXW, 2); }
    else { ctx.fillText(rows[0].join(' '), PAD, 58, MAXW); ctx.fillText(rows[1].join(' '), PAD, 116, MAXW); }
  }

  // The prompt. Every level uses the same measured positions, so words stay where they were.
  if (s.words && s.words.length) {
    const L = fit(ctx, s.words, 500, big);
    drawRun(ctx, L, rowsOf(L, Y.prompt), {
      show: kept(s.level, s.peek), under: marked(s.level, s.peek),
      ink: s.peek ? color.n7 : color.n8, rule: color.n6, ruleH: 7,   // rule 5 px = 0.1 degrees
      pen: color.accent, penW: 6, dy: 16,
    });
  }

  // The next line, in the same reduced form, complete, on one or two rows.
  if (s.next && s.next.length) {
    const lv = s.nextLevel == null ? s.level : s.nextLevel;
    ctx.fillStyle = color.n3; ctx.fillRect(PAD, Y.rule, MAXW, 2);
    const L = fit(ctx, s.next, 400, small);
    drawRun(ctx, L, rowsOf(L, Y.next), {
      show: kept(lv, false), under: marked(lv, false),
      ink: color.n7, rule: color.n5, ruleH: 4, pen: color.accentDim, penW: 3.5, dy: 12,
    });
  }

  // Footer: where you are, and which level this line is at.
  setFont(ctx, 400, small);
  ctx.fillStyle = color.n7; ctx.fillText(`${s.index} of ${s.total}`, PAD, Y.foot);
  let x = W - PAD;
  for (let i = levels.length - 1; i >= 0; i--) {
    x -= ctx.measureText(levels[i]).width;
    ctx.fillStyle = i === s.level ? color.n8 : color.n6;
    ctx.fillText(levels[i], x, Y.foot);
    x -= 56;   // about 1 degree between names
  }
  ctx.restore();
}

// ---- hand status ---------------------------------------------------------
// 256 x 128 plate with two lamps and no text. The larger lamp is the free hand (the one that
// goes on), the smaller is the other hand. lost: dark lens, tracked: n7, pinch: accent.
// Optional st.freeSide 'left' | 'right' (default 'right').
export function drawHandStatus(ctx, w, h, st) {
  ctx.save();
  ctx.scale(w / 256, h / 128);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color.n2; ctx.fillRect(0, 0, 256, 128);
  const right = st.freeSide !== 'left';
  const lamp = (cx, r, state) => {
    ctx.beginPath(); ctx.arc(cx, 64, r, 0, Math.PI * 2);
    ctx.fillStyle = state === 'pinch' ? color.accent : state === 'tracked' ? color.n7 : color.n1; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = state === 'lost' ? color.n5 : color.n4; ctx.stroke();
  };
  lamp(right ? 168 : 88, 36, st.free);
  lamp(right ? 68 : 188, 22, st.other);
  ctx.restore();
}
