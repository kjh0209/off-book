// Off Book: everything that decides what happens, with no drawing and no browser APIs.
// It runs unchanged under Node, which is how test/logic.test.mjs checks it.

export const CFG = {
  maxWords: 14, minWords: 4, maxLines: 40, linkBudget: 2000,
  upDeg: -9, downDeg: -13,          // head pitch: above upDeg is "up", below downDeg is "down", between keeps the last state
  downHold: 0.3,                    // the head must stay below downDeg this long before it counts as down (a nod is not a look)
  zoneIn: 11, zoneOut: 8.5, zoneDwell: 0.2,          // head yaw: enter a side zone beyond zoneIn, leave it inside zoneOut, after zoneDwell seconds
  panelZoneIn: 7.5, panelZoneOut: 5.5,
  startUp: 0.3,                     // the clock starts when the head has been up this long on line 1, or on the first pinch
  debounce: 0.4,                    // a second "next" inside this many seconds is ignored
  holdMin: 0.35,                    // other hand: shorter is "back", longer is "see the line"
  pauseHold: 0.4,                   // both hands pinched together this long opens the pause menu
  dropout: 0.15,                    // a release followed by a press this soon is one pinch (tracking flickered)
  minUpBase: 1.0, minUpPerWord: 0.3,// head-up time a line needs before it can count
  lastLook: 1.5,                    // a look down that is still going on at the pinch and began this recently belongs to the next line
  breathe: 2.0, answer: 45,
};

// ---------- script ----------
const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its ' +
  'just like me more most my no not of on one or our ours out over she so some such than that the their theirs them then there these they this those ' +
  'to too up us very was we were what when where which while who whom why will with would you your yours about after again all also am any because ' +
  'before being below between both down during each few further here im ive off once only other own same should through under until upon ' +
  'every much many may might must shall still even ever get got go going make made take took put say said see let lets well now yet').split(' '));

const ALWAYS = new Set(('not no never none nothing nobody without cannot cant dont doesnt didnt wont isnt arent wasnt werent ' +
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty ' +
  'seventy eighty ninety hundred thousand million billion percent half double twice first second third').split(' '));
const isAlways = (b) => /\d/.test(b) || b.split('-').some((x) => ALWAYS.has(x.replace(/['’]/g, '')));
export const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const bare = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

// Key words: anything with a digit, then the longest non-stop words, until 40 to 60 percent of the line is marked.
export function pickKeys(tokens) {
  const n = tokens.length; if (!n) return [];
  const want = Math.max(1, Math.round(n * 0.5)), most = Math.max(1, Math.floor(n * 0.6));
  const all = tokens.map((t, i) => ({ i, b: bare(t) })).filter((c) => c.b);
  const keys = new Set(all.filter((c) => isAlways(c.b)).map((c) => c.i));          // figures and negations carry the meaning
  const cand = all.filter((c) => !STOP.has(c.b.replace(/['’](s|d|ll|re|ve|m|t)$/, '')));
  for (const c of cand.slice().sort((a, b) => b.b.length - a.b.length || a.i - b.i)) { if (keys.size >= want) break; keys.add(c.i); }
  if (!keys.size && all.length) keys.add(all.reduce((best, c) => (c.b.length > bare(tokens[best]).length ? c.i : best), all[0].i));   // a line of stop words still keeps one
  const out = [...keys].sort((a, b) => a - b);
  if (out.length <= most || n <= 2) return out;
  const must = out.filter((i) => isAlways(bare(tokens[i]))), rest = out.filter((i) => !must.includes(i));
  return [...must, ...rest.slice(0, Math.max(0, most - must.length))].sort((a, b) => a - b);
}

// A written line of up to maxWords stays as the writer broke it. A longer one (a pasted paragraph) is split at
// sentence ends; sentences under minWords join a neighbour; a sentence still too long is cut at the punctuation
// nearest its middle, or at the middle word.
function halve(tokens, max, min) {
  if (tokens.length <= max) return [tokens];
  const mid = tokens.length / 2; let cut = -1, best = 1e9;
  for (let i = min - 1; i < tokens.length - min; i++) if (/[,;:\u2014-]["')\]]?$/.test(tokens[i]) && Math.abs(i + 1 - mid) < best) { best = Math.abs(i + 1 - mid); cut = i + 1; }
  if (cut < 0) cut = Math.ceil(mid);
  return [...halve(tokens.slice(0, cut), max, min), ...halve(tokens.slice(cut), max, min)];
}
function chunk(tokens, max, min = 4) {
  if (tokens.length <= max) return [tokens];
  const sents = []; let cur = [];
  for (const w of tokens) { cur.push(w); if (/[.!?]["')\]]?$/.test(w)) { sents.push(cur); cur = []; } }
  if (cur.length) sents.push(cur);
  const merged = [];
  for (const sn of sents) {
    const last = merged[merged.length - 1];
    if (last && (sn.length < min || last.length < min) && last.length + sn.length <= max) merged[merged.length - 1] = last.concat(sn); else merged.push(sn);
  }
  return merged.flatMap((sn) => halve(sn, max, min));
}

// text -> lines. A token starting with * is a key word the writer chose; if a line has any, the automatic pick is not used.
export function splitScript(text, cfg = CFG) {
  const lines = [], questions = []; let dropped = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const t = raw.trim(); if (!t) continue;
    if (/^q\s*[:.]/i.test(t)) { questions.push(t.replace(/^q\s*[:.]\s*/i, '')); continue; }
    for (const part of chunk(t.split(/\s+/), cfg.maxWords, cfg.minWords)) {
      if (lines.length >= cfg.maxLines) { dropped++; continue; }
      const chosen = part.some((w) => w.startsWith('*') && w.length > 1);
      const tokens = part.map((w) => (w.startsWith('*') && w.length > 1 ? w.slice(1) : w));
      const keys = new Set(chosen ? part.map((w, i) => (w.startsWith('*') && w.length > 1 ? i : -1)).filter((i) => i >= 0) : pickKeys(tokens));
      const plain = tokens.join(' ');
      lines.push({ text: plain, id: hash(norm(plain)), words: tokens.map((w, i) => ({ t: w, key: keys.has(i) })) });
    }
  }
  return { lines, questions, dropped };
}
export const serialise = (lines) => lines.map((l) => l.words.map((w) => (w.key ? '*' : '') + w.t).join(' ')).join('\n');
export const spokenSeconds = (lines) => Math.round(lines.reduce((s, l) => s + l.words.length, 0) / 2.5);   // about 150 words a minute

// ---------- levels ----------
export const isAnchor = (i, n) => i < 2 || i === n - 1;
export const capFor = (i, n, mode) => (mode === 'full' || isAnchor(i, n) ? 3 : 1);
// clean: one step thinner. looked (the line was pulled out with the other hand): one step fuller, as help.
// kept (looked down again) and redone (went back and said it again): unchanged.
export function nextLevel(level, verdict, cap) {
  if (verdict === 'looked') return Math.max(0, level - 1);
  if (verdict === 'clean') return Math.min(cap, level + 1);
  return Math.min(cap, level);
}

// ---------- head ----------
// Pitch and yaw in degrees -> 'up' or 'down', and a zone 0 left, 1 centre, 2 right. Both have a dead band and a dwell so nothing flutters.
export class Head {
  constructor({ panel = false, cfg = CFG } = {}) { this.cfg = cfg; this.zin = panel ? cfg.panelZoneIn : cfg.zoneIn; this.zout = panel ? cfg.panelZoneOut : cfg.zoneOut; this.state = 'up'; this.zone = 1; this.below = 0; this.cand = 1; this.candT = 0; }
  update(dt, pitchDeg, yawDeg) {
    const c = this.cfg;
    if (!this.seen) { this.seen = true; if (pitchDeg < c.downDeg) this.state = 'down'; }   // the first sample decides where the head starts
    if (pitchDeg > c.upDeg) { this.state = 'up'; this.below = 0; }
    else if (pitchDeg < c.downDeg) { this.below += dt; if (this.below >= c.downHold) this.state = 'down'; }
    else this.below = 0;
    let want = this.zone;
    if (this.zone === 1) want = yawDeg < -this.zin ? 0 : yawDeg > this.zin ? 2 : 1;
    else if (this.zone === 0) want = yawDeg > this.zin ? 2 : yawDeg > -this.zout ? 1 : 0;
    else want = yawDeg < -this.zin ? 0 : yawDeg < this.zout ? 1 : 2;
    if (want === this.zone) { this.cand = want; this.candT = 0; }
    else { if (want !== this.cand) { this.cand = want; this.candT = 0; } this.candT += dt; if (this.candT >= c.zoneDwell) { this.zone = want; this.candT = 0; } }
    return this;
  }
}

// ---------- one run through a set of lines ----------
// order: indices into `lines` to rehearse (all of them, or only the weak ones).
export class Run {
  constructor(lines, levels, { mode = 'skeleton', target = 180, order = null, demoStep = 0, demo = false, panel = false, timed = true, cfg = CFG } = {}) {   // demo: the try-out, where every line you pass lights its lamp
    this.cfg = cfg; this.lines = lines; this.mode = mode; this.target = target; this.timed = timed; this.demo = demo;
    this.order = order || lines.map((_, i) => i); this.whole = this.order.length === lines.length;
    // demoStep: the try-out shows every line this many steps thinner than stored, so the change is visible on the second pass
    this.levels = lines.map((l, i) => Math.min(capFor(i, lines.length, mode), (levels[l.id] || 0) + demoStep));
    this.pos = 0; this.started = false; this.done = false; this.paused = false;
    this.t = null; this.elapsed = 0; this.upTime = 0; this.zoneTime = [0, 0, 0]; this.headTracker = new Head({ panel, cfg }); this.peeking = false; this.lastNext = -1e9;
    this.per = {}; this.redo = new Set(); this._fresh();
  }
  get head() { return this.headTracker.state; }
  get zone() { return this.headTracker.zone; }
  get up() { return this.head === 'up' && !this.peeking; }
  get index() { return this.order[this.pos]; }
  get line() { return this.lines[this.index]; }
  get level() { return this.levels[this.index]; }
  get remaining() { return this.target - this.elapsed; }
  _fresh() { this.cur = { up: 0, run: 0, prevRun: 0, dur: 0, looks: [], inLook: false, peeked: false }; }
  minUp(i) { return Math.max(this.cfg.minUpBase, this.lines[i].words.length * this.cfg.minUpPerWord); }

  // call every frame with the time in seconds and the head angles in degrees
  tick(t, pitchDeg, yawDeg) {
    const dt = this.t === null ? 0 : Math.max(0, Math.min(0.25, t - this.t)); this.t = t;
    this.headTracker.update(dt, pitchDeg, yawDeg);
    if (this.done || this.paused) return;
    const up = this.up, c = this.cur;
    c.dur += dt;
    if (up) { c.up += dt; c.run += dt; c.inLook = false; }
    else if (!c.inLook) { c.inLook = true; c.looks.push(c.dur); c.prevRun = c.run; c.run = 0; }   // a look down begins (the tracker has already filtered nods)
    if (!this.started && this.pos === 0 && c.looks.length > 0 && up && c.run >= this.cfg.startUp) { this.started = true; this.elapsed = c.run; this.upTime = c.run; this.zoneTime[this.zone] += c.run; return; }   // you read line 1 and looked up: the clock runs from that moment
    if (!this.started) return;
    this.elapsed += dt;
    if (up) { this.upTime += dt; this.zoneTime[this.zone] += dt; }
  }
  // Looks down that count against a line: every one except a look still going on at the pinch that began in the last
  // lastLook seconds (you glanced at the monitor to press on; that look is the next line's reading).
  // not on the last line: there is no next line to read, and the closing words belong to the room
  lastLookFree(c) { return this.pos < this.order.length - 1 && c.inLook && c.looks.length > 0 && c.dur - c.looks[c.looks.length - 1] <= this.cfg.lastLook; }
  looksOf(c) { return c.looks.length - (this.lastLookFree(c) ? 1 : 0); }
  // Head-up time that counts: the stretch since the head last came up (so a line is said to the room, not before reading it).
  saidUp(c) { return this.lastLookFree(c) ? c.prevRun : c.run; }
  verdictOf(c, i, prior) {
    if (c.peeked || (prior && prior.peeked)) return 'looked';        // pulling a line out is never erased by going back
    if (this.redo.has(i)) return 'redone';
    return this.looksOf(c) <= 1 && this.saidUp(c) >= this.minUp(i) ? 'clean' : 'kept';     // read it once, look up, say it
  }
  // free hand: the clicker. Returns false when ignored.
  next(t = this.t ?? 0) {
    if (this.done || this.paused || t - this.lastNext < this.cfg.debounce) return false;
    this.lastNext = t;
    const i = this.index, c = this.cur, kept = this._prior && this._prior.i === i ? this._prior : null;
    // went back by accident and came straight on again: the earlier result stands
    if (kept && c.dur < this.minUp(i) && !c.peeked) { this.per[i] = kept.rec; this.redo.delete(i); }
    else this.per[i] = { up: c.up, dur: c.dur, looks: this.looksOf(c), peeked: c.peeked || !!(kept && kept.rec.peeked), verdict: this.demo ? (c.up >= 0.6 ? 'clean' : 'kept') : this.verdictOf(c, i, kept && kept.rec), fast: this.looksOf(c) <= 1 };   // even the try-out wants one look up
    this._prior = null;
    this._undo = { pos: this.pos, started: this.started, cur: c, elapsed: this.elapsed, upTime: this.upTime, zoneTime: this.zoneTime.slice() };
    if (!this.started) {   // never looked down on line 1 (you knew it): count the time you spent saying it, up to a speaking pace
      const said = Math.min(c.run, this.lines[i].words.length * 0.4 + 1); this.elapsed += said; this.upTime += said; this.zoneTime[this.zone] += said;
    }
    this.started = true; this.peeking = false;
    // a look still going on at the pinch carries into the next line as its first look
    const carry = c.inLook;
    if (this.pos >= this.order.length - 1) { this.done = true; return true; }
    this.pos++; this._fresh(); if (carry) { this.cur.inLook = true; this.cur.looks.push(0); }
    return true;
  }
  // takes back the last next(): used when that pinch turned out to be the start of a two-hand pause
  undoNext() {
    const u = this._undo; if (!u) return false;
    delete this.per[this.order[u.pos]]; this.pos = u.pos; this.started = u.started; this.cur = u.cur; this.elapsed = u.elapsed; this.upTime = u.upTime; this.zoneTime = u.zoneTime; this.done = false; this._undo = null; this.lastNext = -1e9; return true;
  }
  back() {
    if (this.done || this.paused || this.pos === 0) return false;
    this.pos--; const i = this.index;
    this._prior = this.per[i] ? { i, rec: this.per[i] } : null; this.redo.add(i);
    this._fresh(); this._undo = null; return true;
  }
  peek(on) { if (this.done || this.paused) return; this.peeking = !!on; if (on) { this._wasPeeked = this.cur.peeked; this.cur.peeked = true; } }
  // the hold turned out to be the start of a two-hand pause: it was not a look at the line
  unpeek() { this.peeking = false; this.cur.peeked = !!this._wasPeeked; }
  pause() { this.paused = true; this.peeking = false; }
  resume() { this.paused = false; }

  // ---------- lamps and results ----------
  isClean(i) { return !!this.per[i] && this.per[i].verdict === 'clean'; }
  newLevels(stored = {}) {
    const out = { ...stored }, n = this.lines.length;
    for (const i of this.order) { const p = this.per[i]; if (p) out[this.lines[i].id] = nextLevel(this.levels[i], p.verdict, capFor(i, n, this.mode)); }
    return out;
  }
  weak() {
    const tier = (p) => (p.verdict === 'looked' ? 0 : p.verdict === 'redone' ? 1 : p.looks >= 2 ? 2 : 3);
    return this.order.filter((i) => this.per[i] && this.per[i].verdict !== 'clean')
      .sort((a, b) => tier(this.per[a]) - tier(this.per[b]) || this.per[b].looks - this.per[a].looks || a - b).slice(0, 3).sort((a, b) => a - b);
  }
  result() {
    const n = this.order.length, said = this.order.filter((i) => this.isClean(i)).length;
    const zt = this.zoneTime, zs = zt[0] + zt[1] + zt[2];
    const zones = zs > 0 ? zt.map((z) => Math.round(100 * z / zs)) : [0, 0, 0];
    if (zs > 0) { const d = 100 - (zones[0] + zones[1] + zones[2]); zones[zones.indexOf(Math.max(...zones))] += d; }   // shares of head-up time, adding up to exactly 100
    const side = zs > 0 && Math.abs(zones[0] - zones[2]) > 5 ? (zones[0] < zones[2] ? 0 : 2) : -1;   // left against right only; no sentence when they are close
    const edge = (i) => { const p = this.per[i]; return !this.whole || !p ? null : p.verdict === 'clean' ? 'clean' : p.verdict === 'looked' ? 'looked' : p.verdict === 'redone' ? 'twice' : p.fast ? 'fast' : 'again'; };
    const weak = this.weak();
    return {
      timeSec: Math.round(this.elapsed), targetSec: this.timed && this.whole ? this.target : null,
      eyesUp: this.elapsed > 0 ? Math.round(100 * this.upTime / this.elapsed) : 0, zones, least: side,
      opening: edge(this.order[0]), closing: edge(this.order[n - 1]), said, total: n, weak,
      weakSeconds: Math.round(weak.reduce((s, i) => s + this.lines[i].words.length, 0) * 0.4),
    };
  }
}
// words hidden at a level: what the pencil underlines on the notes sheet for a line that was pulled out
export function hiddenAt(words, level) { return words.map((w, i) => i).filter((i) => (level === 1 ? !words[i].key : level === 2 ? i > 0 : level >= 3)); }
export const about = (sec) => (sec < 50 ? `about ${Math.max(5, Math.round(sec / 5) * 5)} seconds` : sec < 90 ? 'about a minute' : `about ${Math.round(sec / 60)} minutes`);

// ---------- pinches ----------
// Turns raw pinch-down and pinch-up from two hands into intents. emit(name) receives:
// 'next' | 'back' | 'peekStart' | 'peekEnd' | 'pause' | 'undoNext'
export class Pinches {
  constructor(emit, { free = 'right', oneHand = false, cfg = CFG } = {}) { this.emit = emit; this.free = free; this.oneHand = oneHand; this.cfg = cfg; this.reset(); }
  reset() { this.down = {}; this.gone = {}; this.peeking = false; this.pausedBy = false; }
  _other() { return this.free === 'right' ? 'left' : 'right'; }
  press(hand, t) {
    if (this.gone[hand]) { this.down[hand] = this.gone[hand].d; delete this.gone[hand]; return; }   // tracking flickered: same pinch
    this.down[hand] = { t, nexted: false };
    if (!this.oneHand && hand === this.free && !this.down[this._other()]) { this.down[hand].nexted = true; this.emit('next'); }
  }
  release(hand, t) { const d = this.down[hand]; if (!d) return; delete this.down[hand]; this.gone[hand] = { d, t }; }
  _released(hand, d, t) {
    if (this.pausedBy) { if (!Object.keys(this.down).length) this.pausedBy = false; return; }
    const held = t - d.t, holder = this.oneHand || hand !== this.free;
    if (!holder) return;
    if (this.peeking) { this.peeking = false; this.emit('peekEnd'); }              // once a hold is a hold, letting go never means "back"
    else if (held < this.cfg.holdMin) this.emit(this.oneHand ? 'next' : 'back');
  }
  tick(t) {
    for (const hand of Object.keys(this.gone)) if (t - this.gone[hand].t >= this.cfg.dropout) { const g = this.gone[hand]; delete this.gone[hand]; this._released(hand, g.d, g.t); }
    const f = this.down[this.free], o = this.down[this._other()];
    if (!this.oneHand && f && o && !this.pausedBy && t - Math.max(f.t, o.t) >= this.cfg.pauseHold) {
      this.pausedBy = true;
      if (this.peeking) { this.peeking = false; this.emit('peekCancel'); }
      if (f.nexted) this.emit('undoNext');
      this.emit('pause'); return;
    }
    const h = this.oneHand ? (this.down.right || this.down.left) : (!f && o);
    if (h && !this.peeking && !this.pausedBy && t - h.t >= this.cfg.holdMin) { this.peeking = true; this.emit('peekStart'); }
  }
}

// ---------- one question ----------
export const QUESTIONS = {
  pitch: ['Does that number include the customers who left?', 'Why would a larger company not build this?', 'What happens to the plan if growth is half of that?', 'Who pays for this today, and how much?', 'What is the one thing most likely to stop you?'],
  interview: ['What would your last manager say you need to work on?', 'Tell me about a time you were wrong.', 'Why this role, and why now?', 'What did you do when a plan fell apart?', 'What will you have done here in ninety days?'],
  general: ['Can you say that more simply?', 'What is the one thing we should remember?', 'What made you change your mind about this?', 'Who disagrees with you, and why?', 'What would you do differently next time?'],
};
export class Question {
  constructor(text, { asker = 1, cfg = CFG } = {}) { this.text = text; this.asker = asker; this.cfg = cfg; this.phase = 'breathe'; this.t0 = null; this.t = 0; this.answered = 0; this.since = null; this.atAsker = 0; this.elsewhere = 0; }
  tick(t, up, zone) {
    if (this.t0 === null) { this.t0 = t; this.t = t; } const dt = Math.max(0, Math.min(0.25, t - this.t)); this.t = t;
    if (this.phase === 'breathe') { if (t - this.t0 >= this.cfg.breathe) { this.phase = 'answer'; this.answered = 0; } return; }
    if (this.phase !== 'answer') return;
    this.answered += dt;
    if (up && this.since === null) this.since = 0;            // you finished reading the card and looked up
    if (this.since === null) return;
    if (this.since < 3 && up && zone === this.asker) this.atAsker += dt;
    if (this.since >= 3 && up && zone !== this.asker) this.elsewhere += dt;
    this.since += dt;
  }
  get breatheShare() { return this.t0 === null ? 0 : Math.min(1, (this.t - this.t0) / this.cfg.breathe); }
  get remaining() { return this.cfg.answer - this.answered; }
  finish() { this.phase = 'done'; return { seconds: Math.round(this.answered), startedAtAsker: this.atAsker >= 2, lookedAround: this.elsewhere >= 2 }; }
}

// ---------- link ----------
// The script travels in the address after '#', so there is no server. Base64url of UTF-8.
export function encodeState(state, btoa_ = (s) => btoa(s)) {
  const bytes = new TextEncoder().encode(JSON.stringify(state)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa_(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeState(s, atob_ = (x) => atob(x)) {
  try { const bin = atob_(s.replace(/-/g, '+').replace(/_/g, '/')); return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))); } catch { return null; }
}

// Compressed form for the address: deflate, then base64url, prefixed with 'z'. A three-minute script fits in about half the length.
export async function packState(state) {
  const json = JSON.stringify(state);
  try {
    const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(json)); w.close();
    const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer()); let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
    return 'z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch { return 'p' + encodeState(state); }
}
export async function unpackState(s) {
  if (!s) return null;
  if (s[0] === 'p') return decodeState(s.slice(1));
  if (s[0] !== 'z') return decodeState(s);
  try {
    const bin = atob(s.slice(1).replace(/-/g, '+').replace(/_/g, '/')); const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter();
    w.write(Uint8Array.from(bin, (c) => c.charCodeAt(0))).catch(() => {}); w.close().catch(() => {});   // a damaged link rejects here as well as on read
    return JSON.parse(await new Response(ds.readable).text());
  } catch { return null; }
}

export const SAMPLES = {
  try4: { title: 'Try four lines', target: 20, text: 'Thank you all for *coming *tonight.\nI have *one *thing to *ask of you.\n*Look *up when you *speak.\nThe *room is *listening.' },
  pitch: { title: 'One-minute pitch', target: 60, text: `One in five prescriptions leaves the pharmacy unfilled.
The medicine was out of stock.
I ran a pharmacy counter for six years and watched it happen every week.
Shelf Life tells a pharmacy what to order before it runs out.
It reads the last ninety days of sales and the supplier's delivery times.
Each morning the pharmacist sees one short list.
They check once and order to the number.
In our pilot, twelve pharmacies cut stock-outs by thirty-one percent in eight weeks.
And every one of them renewed after ninety days.
It costs two hundred dollars a month for each store.
It pays for itself in the first quarter.
There are nineteen thousand independent pharmacies in this country.
We reach them through the three wholesalers they already buy from.
Two of those wholesalers have signed letters of intent.
We open forty more stores by spring.
We are raising six hundred thousand dollars to get to four hundred stores.
That is four hundred counters where the medicine is there.
I would like you to help us fill the shelf.` },
  toast: { title: 'Wedding toast', target: 90, text: `Good evening, everyone. For those I have not met, I am Mina's older sister.
When Mina was seven she packed a suitcase and told us she was moving next door.
The neighbours had a dog. That was her whole reason.
She has always known exactly what she wanted and walked straight toward it.
So when she called me about Daniel, I listened carefully.
She did not say he was handsome, although he is.
She said, he makes the room quieter.
I did not understand that until I watched them cook together.
Nobody gives orders. Nobody keeps score. Things simply get done.
Daniel, you are patient where our family is loud.
You remember the names of everyone's children.
You let Mina win at cards, and you think she has not noticed.
Mina, you are braver than you know.
Keep walking straight toward what you want. Now you have company.
Please raise a glass. To Mina and Daniel.` },
  interview: { title: 'Interview answer', target: 45, text: `Thank you for having me today.
I am a product analyst with four years in online retail.
In my current role I look after checkout for a marketplace with two million monthly buyers.
Last year our payment failures rose and nobody owned the problem.
I pulled three months of logs and found one bank causing a third of the failures.
I wrote up the pattern and took it to the payments team.
We added a retry for that bank and failures fell by twenty-two percent.
What I enjoyed most was turning a vague complaint into one clear fix.
I am looking for a team where that kind of work is the main job.
From what I have read, that is how your analytics group works.
I would bring careful analysis and plain writing.
And I would like to learn how you run experiments at your scale.` },
};

// values the owner can tune on the device without touching code: ?up=-9&down=-13&debounce=0.4&hold=0.35&pause=0.4&word=0.3
export function tune(params, cfg = CFG) {
  const map = { look: 'lastLook', up: 'upDeg', down: 'downDeg', debounce: 'debounce', hold: 'holdMin', pause: 'pauseHold', word: 'minUpPerWord', zin: 'zoneIn', zout: 'zoneOut', nod: 'downHold' };
  for (const [k, key] of Object.entries(map)) { const v = parseFloat(params.get(k)); if (Number.isFinite(v)) cfg[key] = v; }
  return cfg;
}
