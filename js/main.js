// Off Book: the app. Ties the rules (logic.js) to the room (world.js) and to the hands, keys or touch.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { CFG, Pinches, QUESTIONS, Question, Run, SAMPLES, about, hiddenAt, isAnchor, splitScript, spokenSeconds } from './logic.js';
import * as sfx from './draw/sound.js';

const deg = Math.PI / 180;
const SIZE = { regular: 0.9, large: 1, largest: 1.12 };

// settings: { free: 'right'|'left', oneHand, textSize, room: 'full'|'panel', mode: 'skeleton'|'full', fade, sound }
// own: { title, text, target } or null. store: { get(), set(obj) } holding { levels, clean, seen }.
// sim: the view and hands are driven by a script (used to capture video); copy and behaviour are the headset's
export async function enterRoom({ canvas, settings, own, linkFailed = false, store, xr = false, onLeave, auto = false, sim = false, fov = 56 }) {
  const mr = settings.room === 'mine';        // "my room": passthrough, so the frame must be transparent where nothing is drawn
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: mr, powerPreference: 'high-performance', preserveDrawingBuffer: !!auto });   // preserveDrawingBuffer only so test screenshots show the frame
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x0a0908, mr && xr ? 0 : 1);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 40); camera.rotation.order = 'YXZ';
  const world = await buildWorld({ panel: settings.room === 'panel', mr, textScale: SIZE[settings.textSize] || 1 });
  world.scene.add(camera);
  const fixed = auto && auto.size;       // a capture asks for an exact frame size
  const resize = () => { if (fixed) { renderer.setPixelRatio(1); renderer.setSize(fixed[0], fixed[1], false); camera.aspect = fixed[0] / fixed[1]; camera.updateProjectionMatrix(); return; } const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); window.addEventListener('resize', resize);

  let ac = null; if (!auto && settings.sound) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } }
  const play = (name, delay = 0) => { if (auto && auto.onSound) auto.onSound(name, now + delay / 1000); if (!settings.sound || !ac) return; const go = () => { try { sfx[name](ac); } catch { /* sound is never worth a crash */ } }; delay ? setTimeout(go, delay) : go(); };

  const data = store.get(); data.levels ||= {}; data.clean ||= {}; data.seen ||= {}; data.history ||= {};
  const save = () => store.set(data);
  const driven = !xr, desktop = !xr && !sim, touch = desktop && matchMedia('(pointer: coarse)').matches;   // driven: the camera follows look angles, not a headset
  const free = settings.free === 'left' ? 'left' : 'right', other = free === 'right' ? 'left' : 'right';
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  // ---------- scripts ----------
  const scripts = ['try4', 'pitch', 'toast', 'interview'].map((k) => ({ key: k, title: SAMPLES[k].title, target: SAMPLES[k].target, ...splitScript(SAMPLES[k].text) }));
  if (own && own.text) { const parsed = splitScript(own.text); if (parsed.lines.length) scripts.push({ key: 'own', title: own.title || 'Your script', target: own.target || 180, ...parsed }); }
  const minutes = (sec) => (sec < 55 ? `${Math.round(sec / 5) * 5} seconds` : sec < 90 ? '1 minute' : `${Math.round(sec / 60)} minutes`);

  // ---------- state ----------
  const reach = { dwell: [], line: [], got: new Set(), at: -1 };       // one thought, one person: who the head has rested on
  const resetReach = () => { reach.dwell = world.people.map(() => 0); reach.line = world.people.map(() => 0); reach.got = new Set(); reach.at = -1; };
  const S = { kind: 'centre', menu: null, script: null, run: null, runOpts: null, pass: 0, q: null, qResult: null, was: null, pausedFrom: null, boardAt: null, result: null, lostSince: {}, upSince: null };
  const head = { pitch: -3, yaw: 0, pitch0: 0, rawPitch: -3 };
  const look = { pitch: -3, yaw: 0, hold: null };          // desktop view angles
  let now = 0, last = null, monitorKey = '', railKey = '', centred = false;
  const pinches = new Pinches((e) => act(e), { free, oneHand: !!settings.oneHand });

  // ---------- menus ----------
  function scriptMenu(focusKey) {
    const record = (s) => { const h = data.history[s.key]; if (!h || !h.length) return null; const l = h[h.length - 1], nights = new Set(h.map((x) => x.d)).size; return l.said === l.total ? `off book, night ${nights}` : `night ${nights}, ${l.said} of ${l.total}`; };
    const buttons = scripts.map((s) => ({ label: s.key === 'try4' ? 'Try four lines' : s.title, sub: (s.key !== 'try4' && record(s)) || (s.key === 'own' ? 'yours, ' : '') + minutes(s.key === 'try4' ? 20 : s.key === 'own' ? s.target : spokenSeconds(s.lines)), go: () => (s.key === 'try4' ? startTryout() : startRun(s)) }));
    if (!world.panel && !mr && buttons.length < 6) buttons.push({ label: 'Take a question', sub: '45 seconds', go: () => startQuestion() });
    const f = Math.max(0, scripts.findIndex((s) => s.key === (focusKey || (scripts.some((x) => x.key === 'own') ? 'own' : 'pitch'))));
    S.kind = 'menu'; S.menu = { buttons, cols: buttons.length <= 4 ? 2 : 3, focus: f, rail: true }; S.run = null; S.was = null; world.notes(null); world.question(null); world.askerHand(false);
  }
  function pauseMenu() {
    if (S.kind === 'pause' || S.kind === 'centre') return;
    S.pausedFrom = { kind: S.kind, menu: S.menu }; if (S.run) S.run.pause();
    const inRun = S.pausedFrom.kind === 'run';
    S.kind = 'pause'; S.menu = { buttons: [{ label: 'Keep going', go: resume }, ...(inRun ? [{ label: 'Start again', go: () => { S.pausedFrom = null; restart(); } }] : []), { label: 'Leave', go: leave }], cols: inRun ? 3 : 2, focus: 0 };
  }
  function resume() { const p = S.pausedFrom; S.pausedFrom = null; if (!p) return scriptMenu(); S.kind = p.kind; S.menu = p.menu; if (S.run) S.run.resume(); pinches.reset(); }

  // ---------- runs ----------
  function startRun(script, opts = {}) {
    S.script = script; S.runOpts = opts; S.pass = opts.pass || 0;
    S.run = new Run(script.lines, data.levels, { mode: settings.mode, target: script.target, panel: world.panel, ...opts });
    S.kind = 'run'; S.menu = null; S.was = null; S.result = null; world.notes(null); world.question(null); pinches.reset(); resetReach();
  }
  function startTryout(pass = 0) { startRun(scripts[0], { demo: true, demoStep: pass, timed: false, pass, mode: 'full' }); }
  function restart() { if (S.script) (S.runOpts && S.runOpts.demo ? startTryout(0) : startRun(S.script, S.runOpts || {})); else scriptMenu(); }
  function finishRun() {
    const run = S.run, script = S.script, demo = !!(S.runOpts && S.runOpts.demo);
    if (demo && S.pass === 0) { startTryout(1); return; }          // the same four lines again, one step thinner
    if (!demo) { data.levels = run.newLevels(data.levels); for (const i of run.order) data.clean[script.lines[i].id] = run.isClean(i) ? 1 : 0; }
    const r = run.result(); S.result = r;
    let last = null;
    if (!demo && run.whole) {            // the record that makes tomorrow's visit different from tonight's
      const h = (data.history[script.key] ||= []), prev = h[h.length - 1];
      if (prev) last = `${prev.said} of ${prev.total}, head up ${prev.up}%`;
      h.push({ d: new Date().toISOString().slice(0, 10), said: r.said, total: r.total, up: r.eyesUp, sec: r.timeSec }); if (h.length > 12) h.shift();
    }
    data.seen.try4 = 1; save();
    const gaze = r.least === 0 ? 'Left side saw you least' : r.least === 2 ? 'Right side saw you least' : '';
    const notes = { title: script.title, timeSec: r.timeSec, targetSec: r.targetSec, eyesUp: r.eyesUp, zones: r.zones, gaze, opening: r.opening, closing: r.closing, landed: !demo && run.whole ? !!S.landed : null, said: r.said, total: r.total, last, reached: world.people.map((_, i) => reach.got.has(i)),
      weak: r.weak.map((i) => ({ n: i + 1, text: script.lines[i].text, help: run.per[i].peeked ? hiddenAt(script.lines[i].words, run.levels[i]) : [] })) };
    const weakBtn = { label: 'Run weak lines', sub: `${r.weak.length} line${r.weak.length === 1 ? '' : 's'}`, go: () => startRun(script, { order: r.weak, timed: false }) };
    const again = { label: demo ? 'Try the four lines again' : 'Run it again', go: () => (demo ? startTryout(0) : startRun(script)) };
    const done = { label: demo ? 'Choose a script' : 'Done for tonight', go: () => scriptMenu(demo ? null : script.key) };
    S.kind = 'curtain'; S.boardAt = now + 1.2; S.pendingNotes = notes; S.was = null;
    const ask = { label: 'A question', sub: 'a hand is up', go: () => startQuestion() };
    const btns = demo ? [done, again] : r.weak.length ? [weakBtn, done] : [again, done]; if (!demo && run.whole && !world.panel && !mr) btns.push(ask);       // last, away from the default
    S.menu = { buttons: btns, cols: btns.length, focus: 0 };
    play('applause');
  }

  // ---------- one question ----------
  function startQuestion() {
    const kind = S.script && S.script.key === 'interview' ? 'interview' : S.script && S.script.key === 'toast' ? 'general' : 'pitch';
    const pool = (S.script && S.script.questions && S.script.questions.length ? S.script.questions : QUESTIONS[kind]);
    S.q = new Question(pool[Math.floor(Math.random() * pool.length)], { asker: 1 }); S.qResult = null; S.qHead = { state: 'up', zone: 1 };
    S.kind = 'qa'; S.menu = { buttons: [{ label: 'Done answering', sub: 'pinch when you finish', go: endQuestion }, { label: 'End questions', go: () => scriptMenu() }], cols: 2, focus: 0 };
    world.notes(null); world.askerHand(true);
  }
  function endQuestion() {
    const r = S.q.finish(); S.qResult = r; world.askerHand(false);
    const mm = `${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}`;
    S.menu = { buttons: [{ label: 'Another question', sub: `${mm} · ${r.startedAtAsker ? 'you began with the person who asked' : 'you began away from the person who asked'}`, go: startQuestion }, { label: 'End questions', go: () => scriptMenu() }], cols: 2, focus: 0 };
  }

  // ---------- intents ----------
  function act(name) {
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    if (name === 'pause') return pauseMenu();
    if (S.kind === 'centre') { if (name === 'next' || name === 'back') { centreNow(); play('click'); begin(); } return; }
    if (S.kind === 'land') return;                      // the two seconds after the last word: pinches wait   // either hand may begin
    if (S.menu && S.kind !== 'run') {
      if (S.kind === 'curtain' && now < S.boardAt) return;
      if (name === 'next') { play('click'); const b = S.menu.buttons[S.menu.focus]; if (b) b.go(); }
      else if (name === 'back' || name === 'right') S.menu.focus = (S.menu.focus + 1) % S.menu.buttons.length;
      else if (name === 'left') S.menu.focus = (S.menu.focus + S.menu.buttons.length - 1) % S.menu.buttons.length;
      return;
    }
    const run = S.run; if (S.kind !== 'run' || !run) return;
    if (name === 'next') {
      const i = run.index, lvl = run.level;
      if (!run.next(now)) return;
      play('click'); if (run.isClean(i)) play('chime', 90);
      if (reach.at >= 0 && reach.line[reach.at] >= 1.5) { world.nodPerson(reach.at); reach.got.add(reach.at); }        // you gave that line to one person: they sit forward, and their seat is inked on the sheet
      reach.line = reach.line.map(() => 0);
      S.was = lvl >= 1 && !run.demo ? { n: i + 1, text: S.script.lines[i].text, down: false } : null;
      if (run.done) { if (run.whole && !run.demo) { S.kind = 'land'; S.land = { until: now + 2.0, up: 0, who: reach.at, held: 0 }; S.was = null; } else finishRun(); }
    } else if (name === 'back' || name === 'left') { if (run.back()) S.was = null; }
    else if (name === 'undoNext') { run.undoNext(); S.was = null; }
    else if (name === 'peekStart') run.peek(true);
    else if (name === 'peekEnd') run.peek(false);
    else if (name === 'peekCancel') run.unpeek();
  }
  function begin() {
    S.kind = 'menu';
    if (!data.seen.try4 && !scripts.some((s) => s.key === 'own')) startTryout(0); else scriptMenu();
  }
  function leave() { stop(); onLeave && onLeave(); }

  // ---------- head ----------
  const fwd = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion();
  function readHead() {
    if (driven) { camera.position.set(look.x || 0, 1.2 + (look.y || 0), look.z || 0); camera.rotation.set(look.pitch * deg, -look.yaw * deg, (look.roll || 0) * deg); camera.updateMatrixWorld(); }
    camera.getWorldQuaternion(q); camera.getWorldPosition(pos); fwd.set(0, 0, -1).applyQuaternion(q);
    const ry = world.room.rotation.y, lx = fwd.x * Math.cos(-ry) + fwd.z * Math.sin(-ry), lz = -fwd.x * Math.sin(-ry) + fwd.z * Math.cos(-ry);
    head.rawPitch = Math.asin(Math.max(-1, Math.min(1, fwd.y))) / deg; head.pitch = head.rawPitch - head.pitch0; head.yaw = Math.atan2(lx, -lz) / deg;
  }
  function centreNow() {
    if (driven) { head.pitch0 = 0; centred = true; return; }
    camera.getWorldQuaternion(q); camera.getWorldPosition(pos); fwd.set(0, 0, -1).applyQuaternion(q);
    const p0 = Math.asin(Math.max(-1, Math.min(1, fwd.y))) / deg;
    world.centre(pos, Math.atan2(-fwd.x, -fwd.z)); head.pitch0 = p0 < -6 || p0 > 12 ? 0 : p0; centred = true;   // pinched while looking at the monitor: assume the head is level when up
  }

  // ---------- what the monitor says ----------
  const HINTS = settings.oneHand ? ['Say the line out loud, then pinch', 'Look up and say it. The words fade while you do', 'Hold the pinch to see the whole line', null]
    : desktop ? (touch ? ['Say the line out loud, then tap', 'Drag down to read, drag up to look at the room', 'Press and hold to see the whole line', 'Tap with two fingers to pause']
      : ['Say the line out loud, then press Space', 'Hold S to read. Let go to look up: the words fade', 'Left arrow goes back. Hold Down to see the whole line', 'P pauses'])
      : [`Say the line out loud, then pinch your ${free} hand`, 'Look up and say it. The words fade while you do', `${cap(other)} hand: pinch to go back, hold to see the line`, 'Pinch both hands and hold to pause'];
  function topRow() {
    const run = S.run;
    if ((xr || sim) && !settings.oneHand && S.lostSince[free] != null && now - S.lostSince[free] > 2) return { hint: `${cap(free)} hand not seen. Hold it up in front of you` };
    if (S.was) return { hint: `Line ${S.was.n} was: ${S.was.text}`, hintInk: 'faint' };
    if (run && !run.whole && run.index > 0) return { hint: `After line ${run.index}: ${S.script.lines[run.index - 1].text}`, hintInk: 'faint' };
    if (run && run.demo && S.pass === 0 && HINTS[run.pos]) return { hint: HINTS[run.pos] };
    if (run && run.demo && S.pass === 1 && run.pos === 0) return { hint: 'Once more. Some of the words have gone' };
    if (run && run.whole && !run.demo && run.pos === run.order.length - 1 && run.order.length > 3) return { hint: 'Last line. Give it to the back row', hintInk: 'faint' };
    return {};
  }
  function monitorState() {
    if (S.kind === 'land') return { mode: 'message', title: 'Keep looking at them', sub: 'Two seconds. Then the room answers' };
    if (S.kind === 'centre') return { mode: 'message', title: desktop ? (touch ? 'Tap to begin' : 'Press Space to begin') : 'Look up at the room, then pinch to begin',
      sub: linkFailed ? 'Your script didn’t arrive. Open the link again, or paste it on the web page in this browser' : desktop ? 'This is a preview. Off Book is made for a headset and your hands' : world.panel ? 'Three people are waiting for you' : mr ? 'Seven people are waiting in your room' : 'Twenty-one people are waiting for you' };
    if (S.menu && S.kind !== 'run') return { mode: 'menu', buttons: S.menu.buttons.map((b) => ({ label: b.label, sub: b.sub })), cols: S.menu.cols, focus: S.kind === 'curtain' && now < S.boardAt ? -1 : S.menu.focus,
      menuHint: desktop ? null : settings.oneHand ? 'Look at a button, then pinch' : `${cap(other)} pinch moves, ${free} pinch chooses` };
    const run = S.run, i = run.index, nxt = run.pos < run.order.length - 1 ? run.order[run.pos + 1] : -1;
    return { mode: 'rehearse', level: run.level, words: run.line.words, next: nxt >= 0 ? S.script.lines[nxt].words : null, nextLevel: nxt >= 0 ? run.levels[nxt] : 0, index: i + 1, total: S.script.lines.length, peek: run.peeking, ...topRow() };
  }
  function railState() {
    const sc = S.kind === 'menu' ? scripts[Math.min(S.menu.focus, scripts.length - 1)] : S.script, run = S.run;
    if (!sc || S.kind === 'centre' || S.kind === 'qa') return { total: 0 };
    const n = sc.lines.length, lit = [], anchors = [];
    for (let i = 0; i < n; i++) {
      if (isAnchor(i, n)) anchors.push(i);
      const on = run && S.kind !== 'menu' && run.per[i] ? run.isClean(i) : (run && run.demo && S.kind !== 'menu' ? false : sc.key !== 'try4' && !!data.clean[sc.lines[i].id]);
      if (on) lit.push(i);
    }
    return { total: n, lit, anchors, current: S.kind === 'run' ? run.index : -1 };
  }

  // ---------- one frame ----------
  function step(t) {
    now = t; const dt = last === null ? 0 : Math.max(0, Math.min(0.1, t - last)); last = t;
    if (xr && !centred) { camera.getWorldPosition(pos); if (pos.lengthSq() > 0 || t > 0.5) centreNow(), (centred = true); }
    readHead(); pinches.tick(t);
    const run = S.run;
    if (S.kind === 'land') {         // no penalty for looking down here; staying with one person is simply noticed
      const L = S.land, up = head.pitch > CFG.upDeg;
      world.light(up ? 'zone' : 'out', run.zone); world.veil(0);
      if (up) { L.up += dt; let best = -1, bd = 1e9; world.people.forEach((p, i) => { const d = Math.hypot(p.yaw - head.yaw, (p.pitch - head.pitch) * 0.6); if (d < bd) { bd = d; best = i; } }); if (best === L.who) L.held += dt; else { L.who = best; L.held = 0; } world.focus(world.people.map((_, i) => (i === best ? 1 : 0))); }
      else { L.held = 0; world.focus(null); }
      if (t >= L.until) { S.landed = L.held >= 1.6; if (S.landed && L.who >= 0) { world.nodPerson(L.who); reach.got.add(L.who); } finishRun(); }
    } else if (S.kind === 'run' && run) {
      run.tick(t, head.pitch, head.yaw);
      if (S.was) { if (run.head === 'down') S.was.down = true; else if (S.was.down) S.was = null; }
      world.light(run.up ? 'zone' : 'out', run.zone);
      if (run.up) {                 // the person the head points at, held with a little stickiness so a moving head does not flicker between neighbours
        let best = -1, bd = 1e9; const dist = (p) => Math.hypot(p.yaw - head.yaw, (p.pitch - head.pitch) * 0.6);
        world.people.forEach((p, i) => { if (p.block !== run.zone) return; const d = dist(p); if (d < bd) { bd = d; best = i; } });
        if (reach.at >= 0 && world.people[reach.at].block === run.zone && dist(world.people[reach.at]) < bd + 2.5) best = reach.at;
        reach.at = best;
        if (best >= 0) { reach.dwell[best] += dt; reach.line[best] += dt; }
        world.focus(world.people.map((_, i) => (i === best ? 1 : 0)));
      } else { reach.at = -1; world.focus(null); }
      const rawDown = head.pitch < CFG.downDeg;
      if (run.head === 'up' && !rawDown) { if (S.upSince === null) S.upSince = t; } else S.upSince = null;
      world.veil(settings.fade && !run.peeking && !rawDown && S.upSince !== null && t - S.upSince > 0.4 ? 1 : 0);
      const rem = run.remaining;
      world.clock(!run.timed || !run.whole ? { seconds: run.target, target: run.target, state: 'done' } : !run.started ? { seconds: run.target, target: run.target, state: 'normal' }
        : { seconds: Math.abs(rem), target: run.target, state: rem < 0 ? 'over' : rem <= 30 ? 'last30' : 'normal' });
    } else {
      world.veil(0); S.upSince = null;
      if (S.kind === 'curtain') {
        // after the applause the room itself is the result for a few seconds: the people you turned to stay bright, the others soften. Then everyone is lit again.
        if (!S.pendingNotes && t >= S.boardAt + 0.4 && t < S.boardAt + 6.4 && S.runOpts && !S.runOpts.demo && S.run.whole) { world.reached(reach.got); world.light('reached'); } else world.light('full');
        if (S.pendingNotes && t >= S.boardAt) { world.notes(S.pendingNotes); S.pendingNotes = null; }
        const r = S.result; if (r) world.clock(r.targetSec == null ? { seconds: S.script.target, target: S.script.target, state: 'done' } : { seconds: Math.abs(r.targetSec - r.timeSec), target: r.targetSec, state: r.timeSec > r.targetSec ? 'over' : 'done' });
      } else if (S.kind === 'qa' && S.q) {
        const hs = S.qHead; hs.state = head.pitch > CFG.upDeg ? 'up' : head.pitch < CFG.downDeg ? 'down' : hs.state; hs.zone = head.yaw < -CFG.zoneIn ? 0 : head.yaw > CFG.zoneIn ? 2 : Math.abs(head.yaw) < CFG.zoneOut ? 1 : hs.zone;
        const was = S.q.phase; if (!S.qResult) S.q.tick(t, hs.state === 'up', hs.zone);
        if (was === 'breathe' && S.q.phase === 'answer') world.askerHand(false);
        world.light('ask');
        const key = S.q.phase + '|' + Math.round(S.q.breatheShare * 12);
        if (key !== S.qKey) { S.qKey = key; world.question({ text: S.q.text, phase: S.q.phase === 'breathe' ? 'breathe' : 'answer', t: S.q.breatheShare }); }
        const rem = S.q.remaining; world.clock({ seconds: Math.abs(S.q.phase === 'breathe' ? CFG.answer : rem), target: CFG.answer, state: S.qResult ? 'done' : rem < 0 ? 'over' : 'normal' });
      } else {
        world.light('half');
        const sc = S.kind === 'menu' && S.menu ? scripts[Math.min(S.menu.focus, scripts.length - 1)] : S.script;
        const tg = sc ? sc.target : 180; world.clock({ seconds: tg, target: tg, state: 'normal' });
      }
      // menus: when the head moves to another column the focus follows; a pinch of the other hand always works too.
      // The column is not applied while the head stays where it was, or it would fight the pinch.
      if (xr && S.menu && S.kind !== 'run') {
        const cols = S.menu.cols, half = 19 * (SIZE[settings.textSize] || 1), u = (head.yaw + half) / (2 * half) * cols;
        const col = head.pitch < -6 && u >= 0 && u < cols && Math.abs(u - Math.floor(u) - 0.5) < 0.5 - 1.5 / (2 * half / cols) ? Math.floor(u) : null;
        if (S.menuSeen !== S.menu) { S.menuSeen = S.menu; S.headCol = col; }
        else if (col !== null && col !== S.headCol) { S.headCol = col; const row = Math.floor(S.menu.focus / cols), f = row * cols + col; if (f < S.menu.buttons.length) S.menu.focus = f; }
      }
    }
    const ms = monitorState(), mk = JSON.stringify(ms); if (mk !== monitorKey) { monitorKey = mk; world.monitor(ms); }
    const rs = railState(), rk = JSON.stringify(rs); if (rk !== railKey) { railKey = rk; world.rail({ ...rs, lit: new Set(rs.lit || []), anchors: new Set(rs.anchors || []) }); }
    world.update(dt);
  }

  // ---------- hands (headset) ----------
  const xrHands = [], sides = {};
  function setupXR(session) {
    renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local'); renderer.xr.setSession(session);
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const sideOf = (e) => (e.data && (e.data.handedness === 'left' || e.data.handedness === 'right') ? e.data.handedness : free);   // a source that does not say which hand is the free hand
      c.addEventListener('selectstart', (e) => { world.flash(sideOf(e)); pinches.press(sideOf(e), now); });
      c.addEventListener('selectend', (e) => pinches.release(sideOf(e), now));
      const h = renderer.xr.getHand(i); xrHands.push(h);
      h.addEventListener('connected', (e) => { sides[i] = e.data && e.data.handedness; });
      h.addEventListener('disconnected', () => { delete sides[i]; });
    }
    session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') pauseMenu(); });
    session.addEventListener('end', () => leave());
  }
  function readHands() {
    const seen = { left: false, right: false };
    xrHands.forEach((h, i) => {
      const side = sides[i]; if (side !== 'left' && side !== 'right') return;
      const js = h.joints ? Object.values(h.joints).map((j) => (j.visible === false ? null : { position: j.position, radius: j.jointRadius })) : [];
      if (h.visible !== false && js.some(Boolean)) { seen[side] = true; world.hand(side, js); }
    });
    for (const side of ['left', 'right']) { if (!seen[side]) { world.hand(side, null); if (S.lostSince[side] == null) S.lostSince[side] = now; } else S.lostSince[side] = null; }
  }

  // ---------- keys, mouse and touch (preview without a headset) ----------
  const off = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); off.push(() => el.removeEventListener(ev, fn, opt)); };
  if (desktop) {
    on(window, 'keydown', (e) => {
      if (e.repeat) return; const k = e.key;
      if (k === ' ' || k === 'Enter') { e.preventDefault(); act('next'); }
      else if (k === 'ArrowLeft') act('left');
      else if (k === 'ArrowRight') act('right');
      else if (k === 'ArrowDown') { e.preventDefault(); look.hold = look.hold || { pitch: look.pitch }; look.pitch = -21; look.yaw = 0; act('peekStart'); }
      else if (k === 's' || k === 'S' || k === 'Shift') { look.hold = look.hold || { pitch: look.pitch }; look.pitch = -21; }
      else if (k === 'p' || k === 'P' || k === 'Escape') act('pause');
    });
    on(window, 'keyup', (e) => {
      const k = e.key;
      if (k === 'ArrowDown') { act('peekEnd'); if (look.hold) { look.pitch = look.hold.pitch; look.hold = null; } }
      else if (k === 's' || k === 'S' || k === 'Shift') { if (look.hold) { look.pitch = look.hold.pitch; look.hold = null; } }
    });
    let drag = null, longT = null, peeking = false;
    const ray = new THREE.Raycaster();
    const pick = (x, y) => {       // which monitor button is under the pointer
      if (!S.menu || S.kind === 'run') return -1;
      const r = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObject(world.screen)[0]; if (!hit || !hit.uv) return -1;
      const n = S.menu.buttons.length, cols = S.menu.cols, rows = Math.ceil(n / cols), row = Math.min(rows - 1, Math.floor((1 - hit.uv.y) * rows));
      const inRow = Math.min(cols, n - row * cols), shift = (cols - inRow) / 2, col = Math.floor(hit.uv.x * cols - shift);
      return col >= 0 && col < inRow ? row * cols + col : -1;
    };
    on(canvas, 'pointerdown', (e) => {
      if (drag && e.pointerType === 'touch') { act('pause'); drag = null; clearTimeout(longT); return; }       // second finger
      drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, yaw: look.yaw, pitch: look.pitch };
      try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
      if (e.pointerType === 'touch') longT = setTimeout(() => { if (drag && !drag.moved) { peeking = true; look.hold = { pitch: look.pitch }; look.pitch = -21; act('peekStart'); } }, 450);
    });
    on(canvas, 'pointermove', (e) => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved && !peeking) { look.yaw = Math.max(-60, Math.min(60, drag.yaw - dx * 0.12)); look.pitch = Math.max(-40, Math.min(25, drag.pitch + dy * 0.12)); }
    });
    on(canvas, 'pointerup', (e) => {
      clearTimeout(longT); const d = drag; drag = null; if (!d) return;
      if (peeking) { peeking = false; act('peekEnd'); if (look.hold) { look.pitch = look.hold.pitch; look.hold = null; } return; }
      if (!d.moved && performance.now() - d.t < 400) { const b = pick(e.clientX, e.clientY); if (b >= 0) { S.menu.focus = b; act('next'); } else if (S.kind === 'run' || S.kind === 'centre') act('next'); }
    });
    on(document, 'visibilitychange', () => { if (document.hidden) pauseMenu(); });
  }

  // ---------- loop ----------
  let running = true;
  function stop() { running = false; renderer.setAnimationLoop(null); off.forEach((f) => f()); window.removeEventListener('resize', resize); if (ac) ac.close().catch(() => {}); renderer.dispose(); }
  const api = { S, world, renderer, camera, act, step, look, head, data, scripts, reach, stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }), render: () => renderer.render(world.scene, camera), stop, pinches };
  if (auto) return api;                              // the test drives step() itself
  if (xr) { setupXR(xr); }
  const t0 = performance.now();
  renderer.setAnimationLoop(() => { if (!running) return; if (xr) readHands(); step((performance.now() - t0) / 1000); renderer.render(world.scene, camera); });
  return api;
}
