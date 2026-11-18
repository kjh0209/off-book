// Runs the rules with no browser: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Head, Pinches, Question, Run, SAMPLES, about, capFor, decodeState, encodeState, hiddenAt, packState, pickKeys, serialise, splitScript, spokenSeconds, unpackState } from '../js/logic.js';

const UP = -3, DOWN = -21;
// drives a run at 30 frames a second. steps: [seconds, pitch, yaw?]
function play(run, t, steps) { for (const [sec, pitch, yaw = 0] of steps) { const end = t + sec; while (t < end - 1e-9) { t += 1 / 30; run.tick(t, pitch, yaw); } } return t; }
const pitch = splitScript(SAMPLES.pitch.text).lines;
// read a line (down), look up and say it, pinch
function sayClean(run, t, upFor = 5) { t = play(run, t, [[0.8, DOWN], [upFor, UP]]); run.next(t); return t; }

test('script: the 18-line sample gives 18 lines, each with a key word', () => {
  assert.equal(pitch.length, 18);
  for (const l of pitch) assert.ok(l.words.some((w) => w.key), l.text);
});
test('script: a line over 14 words is cut into two or more, none under 4 words', () => {
  const { lines } = splitScript('We reach independent pharmacies through the three wholesalers they already buy from, and two of those wholesalers have already signed letters of intent with us this year.');
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(l.words.length <= 14 && l.words.length >= 4, l.text);
});
test('script: a pasted paragraph splits at sentence ends', () => {
  const { lines } = splitScript('I ran a pharmacy counter for six years. Every week we ran out of something people needed. Nobody could tell us what to order before it happened.');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].text.endsWith('six years.'));
});
test('script: figures and negations are always key words', () => {
  const t = 'We did not lose one of the twelve stores'.split(' ');
  const keys = pickKeys(t).map((i) => t[i]);
  for (const w of ['not', 'one', 'twelve']) assert.ok(keys.includes(w), w + ' in ' + keys);
});
test('script: more than 40 lines are cut off and counted; Q: lines become questions', () => {
  const text = Array.from({ length: 45 }, (_, i) => `This is line number ${i + 1} of the talk.`).join('\n') + '\nQ: What does it cost?';
  const r = splitScript(text);
  assert.equal(r.lines.length, 40); assert.equal(r.dropped, 5); assert.deepEqual(r.questions, ['What does it cost?']);
});
test('script: Korean text splits into lines and does not break', () => {
  const r = splitScript('두 사람을 처음 만난 날을 기억합니다.\n민아는 일곱 살에 가방을 싸서 옆집으로 이사 가겠다고 했습니다.');
  assert.equal(r.lines.length, 2);
  for (const l of r.lines) assert.ok(l.words.some((w) => w.key));
});
test('script: chosen key words survive a round trip through the link', () => {
  const lines = splitScript('Look *up when you *speak.\nThe room is listening.').lines;
  assert.deepEqual(lines[0].words.filter((w) => w.key).map((w) => w.t), ['up', 'speak.']);
  const state = { v: 1, title: 'Mine', target: 150, text: serialise(lines) };
  const back = decodeState(encodeState(state, (s) => Buffer.from(s, 'binary').toString('base64')), (s) => Buffer.from(s, 'base64').toString('binary'));
  assert.deepEqual(back, state);
  assert.equal(serialise(splitScript(back.text).lines), state.text);
});
test('link: a three-minute script is longer than the 2000 character budget, so the page must say so', () => {
  const long = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} says something about pharmacies and the shelves they keep full.`).join('\n');
  const enc = encodeState({ v: 1, text: long }, (s) => Buffer.from(s, 'binary').toString('base64'));
  assert.ok(enc.length > CFG.linkBudget);
  assert.ok(encodeState({ v: 1, text: serialise(splitScript(SAMPLES.interview.text).lines) }, (s) => Buffer.from(s, 'binary').toString('base64')).length < CFG.linkBudget);
});
test('levels: in outline mode only the first two lines and the last go past Key words', () => {
  assert.deepEqual([0, 1, 2, 16, 17].map((i) => capFor(i, 18, 'skeleton')), [3, 3, 1, 1, 3]);
  assert.equal(capFor(9, 18, 'full'), 3);
  assert.deepEqual(hiddenAt([{ key: true }, { key: false }, { key: true }], 1), [1]);
  assert.deepEqual(hiddenAt([{ key: true }, { key: false }], 2), [1]);
});

test('next: the free-hand pinch goes on, and a second pinch inside 0.4 s is ignored', () => {
  const run = new Run(pitch, {}); let t = play(run, 0, [[2, UP]]);
  assert.equal(run.next(t), true); assert.equal(run.index, 1);
  assert.equal(run.next(t + 0.2), false); assert.equal(run.index, 1);
  assert.equal(run.next(t + 0.5), true); assert.equal(run.index, 2);
});
test('back: one line back; nothing happens on the first line', () => {
  const run = new Run(pitch, {}); assert.equal(run.back(), false);
  let t = sayClean(run, 0); assert.equal(run.index, 1); assert.equal(run.back(), true); assert.equal(run.index, 0);
});
test('clean: read once, look up, say it -> the line is one step thinner next run', () => {
  const run = new Run(pitch, {}); let t = sayClean(run, 0);
  assert.equal(run.per[0].verdict, 'clean');
  assert.equal(run.newLevels({})[pitch[0].id], 1);
});
test('clean: head already up from the last line, one look down to read, up to say it', () => {
  const run = new Run(pitch, {}); let t = sayClean(run, 0);
  t = play(run, t, [[0.6, UP], [1.0, DOWN], [5, UP]]); run.next(t);
  assert.equal(run.per[1].verdict, 'clean');
});
test('clean: a glance at the monitor just before the pinch does not count against the line', () => {
  const run = new Run(pitch, {}); let t = play(run, 0, [[0.8, DOWN], [5, UP], [0.7, DOWN]]); run.next(t);
  assert.equal(run.per[0].verdict, 'clean');
  t = play(run, t, [[0.5, DOWN], [5, UP]]); run.next(t);          // that same look is the next line's one reading
  assert.equal(run.per[1].verdict, 'clean');
});
test('kept: looking down a second time in the middle of the line', () => {
  const run = new Run(pitch, {}); let t = play(run, 0, [[0.8, DOWN], [2, UP], [1, DOWN], [4, UP]]); run.next(t);
  assert.equal(run.per[0].verdict, 'kept'); assert.equal(run.per[0].looks, 2);
  assert.equal(run.newLevels({})[pitch[0].id], 0);
});
test('kept: passing a line faster than the minimum head-up time does not raise it', () => {
  const run = new Run(pitch, {}); let t = play(run, 0, [[0.8, DOWN], [0.9, UP]]); run.next(t);
  assert.equal(run.per[0].verdict, 'kept');
  assert.ok(run.minUp(2) > 3.5, 'a 13-word line needs about four seconds');
});
test('kept: head-up time before reading the line does not count as saying it', () => {
  const run = new Run(pitch, {}); let t = play(run, 0, [[6, UP], [1, DOWN], [0.5, UP]]); run.next(t);
  assert.equal(run.per[0].verdict, 'kept');
});
test('a nod shorter than 0.3 s is not a look down', () => {
  const run = new Run(pitch, {}); let t = play(run, 0, [[0.8, DOWN], [2, UP], [0.2, DOWN], [3, UP]]); run.next(t);
  assert.equal(run.per[0].looks, 1); assert.equal(run.per[0].verdict, 'clean');
});
test('looked: holding the other hand shows the line; the line goes one step fuller, never thinner', () => {
  const run = new Run(pitch, { [pitch[0].id]: 2 }); let t = play(run, 0, [[2, UP]]);
  run.peek(true); assert.equal(run.up, false, 'the house is out while the line is shown'); t = play(run, t, [[1, UP]]); run.peek(false); t = play(run, t, [[5, UP]]); run.next(t);
  assert.equal(run.per[0].verdict, 'looked');
  assert.equal(run.newLevels({ [pitch[0].id]: 2 })[pitch[0].id], 1);
});
test('redone: going back and saying a line again does not raise it, and it is listed', () => {
  const run = new Run(pitch, {}); let t = sayClean(run, 0); t = sayClean(run, t);
  run.back(); t = sayClean(run, t);
  assert.equal(run.per[1].verdict, 'redone'); assert.equal(run.newLevels({})[pitch[1].id], 0);
});
test('back by accident: coming straight on again keeps the earlier clean result', () => {
  const run = new Run(pitch, {}); let t = sayClean(run, 0); t = sayClean(run, t);
  run.back(); t = play(run, t, [[0.6, UP]]); run.next(t);
  assert.equal(run.per[1].verdict, 'clean');
});
test('going back never erases that a line was pulled out', () => {
  const run = new Run(pitch, {}); let t = sayClean(run, 0);
  run.peek(true); t = play(run, t, [[1, UP]]); run.peek(false); t = play(run, t, [[4, UP]]); run.next(t);
  run.back(); t = sayClean(run, t);
  assert.equal(run.per[1].verdict, 'looked');
});

test('clock: stands while you read line 1, runs from the moment you look up; goes negative past the target; stops at the end', () => {
  const four = splitScript(SAMPLES.try4.text).lines, run = new Run(four, {}, { target: 6 });
  let t = play(run, 0, [[1.5, UP]]); assert.equal(run.elapsed, 0, 'head up before reading line 1 (you have just centred yourself) is not timed');
  t = play(run, t, [[2, DOWN]]); assert.equal(run.elapsed, 0, 'reading line 1 is not timed');
  t = play(run, t, [[1, UP]]); assert.ok(run.started && run.elapsed > 0.9 && run.elapsed < 1.1, String(run.elapsed));
  for (let i = 0; i < 4; i++) { t = play(run, t, [[3, UP]]); run.next(t); }
  assert.ok(run.done); assert.ok(run.remaining < 0);
  const at = run.elapsed; t = play(run, t, [[2, UP]]); assert.equal(run.elapsed, at);
});
test('clock: if you never look down on line 1, the first pinch starts it and counts the time you spent saying the line', () => {
  const run = new Run(pitch, {}); let t = play(run, 0, [[4, UP]]); run.next(t);
  assert.ok(run.elapsed > 3.5 && run.elapsed <= 4.3, String(run.elapsed)); t = play(run, t, [[1, UP]]); assert.ok(run.elapsed > 4.5);
});
test('last line: a look down at the pinch counts, because there is no next line to read', () => {
  const four = splitScript(SAMPLES.try4.text).lines, run = new Run(four, {}); let t = 0;
  for (let i = 0; i < 3; i++) t = sayClean(run, t);
  t = play(run, t, [[0.8, DOWN], [4, UP], [0.8, DOWN]]); run.next(t);
  assert.equal(run.per[3].verdict, 'kept'); assert.equal(run.result().closing, 'again');
});
test('a hold that turns into a two-hand pause is not recorded as looking at the line', () => {
  const out = []; const p = new Pinches((e) => out.push(e));
  p.press('left', 0); p.tick(0.36); p.press('right', 0.4); p.tick(0.6); p.tick(0.85);
  assert.deepEqual(out, ['peekStart', 'peekCancel', 'pause']);
  const run = new Run(pitch, {}); let t = play(run, 0, [[1, UP]]); run.peek(true); run.unpeek(); t = play(run, t, [[0.8, DOWN], [5, UP]]); run.next(t);
  assert.equal(run.per[0].verdict, 'clean');
});
test('link: a compressed three-minute script survives the round trip and is much shorter', async () => {
  const text = serialise(splitScript(Array.from({ length: 3 }, () => SAMPLES.pitch.text).join('\n')).lines);
  const state = { v: 1, title: 'Shelf Life', target: 180, text };
  const packed = await packState(state), plain = encodeState(state, (x) => Buffer.from(x, 'binary').toString('base64'));
  assert.deepEqual(await unpackState(packed), state);
  assert.ok(packed.length < plain.length * 0.6, packed.length + ' vs ' + plain.length);
  assert.equal(await unpackState('zNOT-A-LINK'), null);
  const ko = { v: 1, text: '두 사람을 처음 만난 날을 기억합니다.\n민아는 일곱 살에 가방을 싸서 옆집으로 이사 가겠다고 했습니다.' };
  assert.deepEqual(await unpackState(await packState(ko)), ko);
});
test('pause: the clock and the totals stand still', () => {
  const run = new Run(pitch, {}); let t = sayClean(run, 0); const e = run.elapsed, u = run.upTime;
  run.pause(); t = play(run, t, [[5, UP]]); assert.equal(run.elapsed, e); assert.equal(run.upTime, u); assert.equal(run.next(t), false);
  run.resume(); t = play(run, t, [[1, UP]]); assert.ok(run.elapsed > e);
});

test('head: up above -9, down below -13 after 0.3 s, and the band between keeps the last state', () => {
  const h = new Head(); const step = (sec, p, y = 0) => { for (let i = 0; i < Math.round(sec * 30); i++) h.update(1 / 30, p, y); return h; };
  assert.equal(step(0.5, -11).state, 'up'); assert.equal(step(0.2, -20).state, 'up'); assert.equal(step(0.2, -20).state, 'down');
  assert.equal(step(0.5, -11).state, 'down'); assert.equal(step(0.1, -5).state, 'up');
});
test('zones: enter a side beyond 11 degrees after 0.2 s, come back inside 8.5; no flutter at the edge', () => {
  const h = new Head(); const step = (sec, y) => { for (let i = 0; i < Math.round(sec * 30); i++) h.update(1 / 30, UP, y); return h.zone; };
  assert.equal(step(1, -10), 1); assert.equal(step(0.1, -12), 1); assert.equal(step(0.2, -12), 0);
  assert.equal(step(1, -9.5), 0, 'still left: inside the dead band'); assert.equal(step(0.4, -8), 1); assert.equal(step(0.4, 14), 2);
  let flips = 0, z = h.zone; for (let i = 0; i < 300; i++) { h.update(1 / 30, UP, 9.75 + (i % 2 ? 0.6 : -0.6)); if (h.zone !== z) { flips++; z = h.zone; } }
  assert.ok(flips <= 1, 'flips ' + flips);
  const p = new Head({ panel: true }); for (let i = 0; i < 30; i++) p.update(1 / 30, UP, 8); assert.equal(p.zone, 2);
});
test('eyes up: looking left lights the left zone only in the totals; shares add up to 100', () => {
  const four = splitScript(SAMPLES.try4.text).lines, run = new Run(four, {}, { target: 20 });
  let t = play(run, 0, [[1, UP, 0]]);
  for (const yaw of [-18, -18, 0, 16]) { t = play(run, t, [[0.8, DOWN, yaw], [3, UP, yaw]]); run.next(t); }
  const r = run.result();
  assert.equal(r.zones[0] + r.zones[1] + r.zones[2], 100);
  assert.ok(r.zones[0] > r.zones[1] && r.zones[1] >= r.zones[2] - 5, String(r.zones));
  assert.equal(r.least, 2, 'right side saw you least');
  assert.ok(r.eyesUp > 60 && r.eyesUp < 95, String(r.eyesUp));
  assert.equal(r.said, 4); assert.equal(r.opening, 'clean'); assert.equal(r.closing, 'clean');
});
test('results: weak lines are the ones pulled out first, then redone, then looked at twice; at most three', () => {
  const run = new Run(pitch, {}); let t = 0;
  for (let i = 0; i < 18; i++) {
    if (i === 5) { run.peek(true); t = play(run, t, [[1, UP]]); run.peek(false); t = play(run, t, [[4, UP]]); run.next(t); }
    else if (i === 10 || i === 12 || i === 14) { t = play(run, t, [[0.8, DOWN], [2, UP], [1, DOWN], [4, UP]]); run.next(t); }
    else t = sayClean(run, t);
  }
  const r = run.result();
  assert.ok(run.done); assert.equal(r.said, 14); assert.equal(r.total, 18);
  assert.deepEqual(r.weak, [5, 10, 12]);
  assert.equal(r.targetSec, 180); assert.ok(r.weakSeconds > 5);
  const again = new Run(pitch, run.newLevels({}), { order: r.weak, timed: false });
  assert.deepEqual(again.order, [5, 10, 12]); assert.equal(again.index, 5);
  t = sayClean(again, 0); assert.equal(again.index, 10);
  const r2 = again.result(); assert.equal(r2.targetSec, null); assert.equal(r2.opening, null, 'a weak-lines run reports no opening line');
});
test('results: a run with no weak lines has an empty list', () => {
  const four = splitScript(SAMPLES.try4.text).lines, run = new Run(four, {}); let t = 0;
  for (let i = 0; i < 4; i++) t = sayClean(run, t);
  assert.deepEqual(run.result().weak, []);
});
test('try-out: a line lights its lamp once you have looked up, and the second pass is one step thinner', () => {
  const four = splitScript(SAMPLES.try4.text).lines, a = new Run(four, {}, { demo: true, timed: false }); let t = play(a, 0, [[1, DOWN]]);
  for (let i = 0; i < 3; i++) { t = play(a, t, [[0.6, DOWN], [0.8, UP]]); a.next(t); }
  t = play(a, t, [[1.0, DOWN]]); a.next(t);            // the last one read aloud with the head down
  assert.deepEqual([0, 1, 2, 3].map((i) => a.isClean(i)), [true, true, true, false]);
  assert.equal(a.result().said, 3);
  const b = new Run(four, {}, { demo: true, demoStep: 1, timed: false });
  assert.deepEqual(b.levels, [1, 1, 1, 1]);
});
test('saved levels: an edited line starts again, the others keep their level', () => {
  const a = splitScript('Good evening everyone here.\nThe room is listening.').lines, b = splitScript('Good evening everyone here.\nThe room is really listening.').lines;
  const stored = { [a[0].id]: 2, [a[1].id]: 1 };
  const run = new Run(b, stored, { mode: 'full' });
  assert.deepEqual(run.levels, [2, 0]);
});

function hands(opts) { const out = []; const p = new Pinches((e) => out.push(e), opts); return { p, out }; }
test('pinches: free hand = next at once; other hand short = back, held = see the line and never back', () => {
  const { p, out } = hands();
  p.press('right', 0); p.release('right', 0.1); p.tick(0.3);
  p.press('left', 1); p.release('left', 1.15); p.tick(1.4);
  p.press('left', 2); p.tick(2.2); p.tick(2.4); p.tick(3); p.release('left', 3); p.tick(3.2);
  assert.deepEqual(out, ['next', 'back', 'peekStart', 'peekEnd']);
});
test('pinches: tracking that flickers for under 0.15 s during a hold does not turn into "back"', () => {
  const { p, out } = hands();
  p.press('left', 0); p.tick(0.2); p.release('left', 0.25); p.tick(0.3); p.press('left', 0.33); p.tick(0.5); p.tick(1); p.release('left', 1); p.tick(1.2);
  assert.deepEqual(out, ['peekStart', 'peekEnd']);
});
test('pinches: both hands held 0.4 s = pause, and the advance the free hand already made is taken back', () => {
  const { p, out } = hands();
  p.press('right', 0); p.press('left', 0.1); p.tick(0.3); p.tick(0.55); p.release('right', 0.8); p.release('left', 0.85); p.tick(1.1);
  assert.deepEqual(out, ['next', 'undoNext', 'pause']);
  const run = new Run(pitch, {}); let t = sayClean(run, 0); const before = run.index, rec = { ...run.per };
  t = play(run, t, [[1, UP]]); run.next(t); run.undoNext(); run.pause();
  assert.equal(run.index, before); assert.deepEqual(Object.keys(run.per), Object.keys(rec));
});
test('pinches: left-handed and one-hand modes', () => {
  const l = hands({ free: 'left' }); l.p.press('left', 0); l.p.release('left', 0.1); l.p.tick(0.3); assert.deepEqual(l.out, ['next']);
  const o = hands({ oneHand: true });
  o.p.press('right', 0); o.p.release('right', 0.1); o.p.tick(0.3); o.p.press('right', 1); o.p.tick(1.4); o.p.release('right', 2); o.p.tick(2.2);
  assert.deepEqual(o.out, ['next', 'peekStart', 'peekEnd']);
});
test('question: the clock waits for Breathe; the three seconds run from the first look up', () => {
  const q = new Question('Why now?'); let t = 0; const step = (sec, up, zone) => { const end = t + sec; while (t < end - 1e-9) { t += 1 / 30; q.tick(t, up, zone); } };
  step(1.5, false, 1); assert.equal(q.phase, 'breathe'); step(0.7, false, 1); assert.equal(q.phase, 'answer');
  step(2, false, 1); step(2.5, true, 1); step(4, true, 2);
  const r = q.finish(); assert.equal(r.startedAtAsker, true); assert.equal(r.lookedAround, true); assert.ok(r.seconds >= 8 && r.seconds <= 9);
});
test('small things: spoken time and "about" wording', () => {
  assert.ok(Math.abs(spokenSeconds(pitch) - 67) < 12);
  assert.equal(about(20), 'about 20 seconds'); assert.equal(about(62), 'about a minute'); assert.equal(about(170), 'about 3 minutes');
});
