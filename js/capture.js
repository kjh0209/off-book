// Off Book: scripted performances of the real app, rendered frame by frame for the video.
// index.html?capture=<scene>  ->  frames are POSTed to the capture server (submission/capture_server.py).
// The view and the two hands are driven by a script; everything else is the app's own code path
// (pinches go through Pinches, lines through Run, light and monitor through the world).
// This is a simulator capture, not headset footage, and must be described that way.
import * as THREE from 'three';
import * as sfx from './draw/sound.js';

const SERVER = 'http://127.0.0.1:8767';
const FPS = 30, deg = Math.PI / 180;

// ---------- a hand: 25 joints in WebXR order, built from a wrist pose, a curl and a pinch amount ----------
const FINGERS = [   // base on the palm (x toward the little finger for a right hand, z forward is negative), and three bone lengths plus tip
  // the proportions of the hand mesh the app draws (models/hand_*.glb), so the scripted joints do not stretch it
  { base: [-0.0236, -0.0073, -0.0886], len: [0.0453, 0.0243, 0.0116] },   // index
  { base: [-0.0018, -0.0025, -0.0917], len: [0.0468, 0.0276, 0.0122] },   // middle
  { base: [0.0174, -0.0065, -0.0847], len: [0.0429, 0.0266, 0.0120] },    // ring
  { base: [0.0350, -0.0137, -0.0739], len: [0.0346, 0.0203, 0.0119] },    // little
];
const RAD = [0.021, 0.019, 0.013, 0.010, 0.008];
export function handJoints(side, wrist, quat, pinch = 0, curl = 0.35) {
  const mirror = side === 'left' ? -1 : 1, out = [], v = (x, y, z) => new THREE.Vector3(x * mirror, y, z);
  const local = [v(0, 0, 0)];
  // thumb: metacarpal, proximal, distal, tip. It swings toward the index tip as the pinch closes.
  const t0 = v(-0.0281, -0.0191, -0.0360), t1 = v(-0.0450, -0.0343, -0.0592), t2 = v(-0.0670, -0.0437, -0.0831), t3 = v(-0.0779, -0.0489, -0.0917);
  const fingerPts = FINGERS.map((f, fi) => {
    const pts = [v(f.base[0] * 0.45, f.base[1], -0.03), v(...f.base)];
    let a = (curl + (fi === 0 ? pinch * 0.12 : 0)) * 0.9, p = pts[1].clone();
    f.len.forEach((L, k) => { a += (curl + (fi === 0 ? pinch * 0.38 : 0)) * (k === 0 ? 0.6 : 0.9); p = p.clone().add(new THREE.Vector3(0, -Math.sin(a) * L, -Math.cos(a) * L)); pts.push(p); });
    return pts;
  });
  // the pinch: the thumb's base comes across the palm, and its two end bones reach the index tip at their own lengths (so the mesh keeps its shape)
  const meet = fingerPts[0][4].clone().add(new THREE.Vector3(-0.004 * mirror, -0.004, 0.004));
  const p1 = t1.clone().lerp(v(-0.040, -0.042, -0.062), pinch), L1 = 0.0338, L2 = 0.0131;
  const dir = meet.clone().sub(p1), d = Math.max(1e-4, dir.length()); dir.multiplyScalar(1 / d);
  const along = Math.min(L1, (L1 * L1 - L2 * L2 + d * d) / (2 * d)), out2 = v(-1, 0.35, 0); out2.addScaledVector(dir, -out2.dot(dir)).normalize();      // the knuckle bows outward, away from the palm
  const k2 = p1.clone().addScaledVector(dir, along).addScaledVector(out2, Math.sqrt(Math.max(0, L1 * L1 - along * along)));
  const k3 = d >= L1 + L2 ? p1.clone().addScaledVector(dir, L1 + L2) : meet;
  const thumb = [t0, p1, t2.clone().lerp(k2, pinch), t3.clone().lerp(k3, pinch)];
  local.push(...thumb); fingerPts.forEach((pts) => local.push(...pts));
  const radii = [0.022, 0.017, 0.013, 0.011, 0.009];
  local.forEach((p, i) => {
    const k = i === 0 ? 0 : i <= 4 ? i : ((i - 5) % 5);
    out.push({ position: p.applyQuaternion(quat).add(wrist), radius: i === 0 ? 0.019 : i <= 4 ? [0, 0.012, 0.0105, 0.0095, 0.0085][i] : [0.011, 0.0098, 0.0088, 0.008, 0.0072][k] });
  });
  return out;
}

// emu: run inside Meta's Immersive Web Emulation Runtime, so the app is in a real WebXR session with emulated head and hands
export async function runCapture(enter, params, emu = false) {
  const scene = params.get('capture') || params.get('emu'), W = +(params.get('w') || 1920), H = +(params.get('h') || 1080);
  const events = [];
  let clockNow = () => 0;          // film time: frames recorded so far, not simulated time (a scene may fast-forward without recording)
  let quiet = false;
  const opts = { size: [W, H], onSound: (name, at) => { if (!quiet) events.push({ name, t: +clockNow(at).toFixed(3) }); } };
  if (params.get('own')) { /* a script arrives through the link as usual */ }
  let dev = null, frameDone = null;
  if (emu) {
    const iwer = await import('../shots/iwer.module.js');
    dev = new iwer.XRDevice(iwer.metaQuest3, { stereoEnabled: false }); dev.installRuntime({ forceInstall: true }); dev.primaryInputMode = 'hand';
    dev.position.set(0, 1.2, 0); try { dev.fovy = +(params.get('fov') || 64) * Math.PI / 180; } catch (e) { console.log('CAPTURE fovy ' + e); }
    opts.clock = () => t; opts.onFrame = () => { if (frameDone) { const f = frameDone; frameDone = null; f(); } };
    const mode = params.get('room') === 'mine' ? 'immersive-ar' : 'immersive-vr';
    opts.session = await navigator.xr.requestSession(mode, { optionalFeatures: ['hand-tracking', 'local-floor'] });
    console.log('CAPTURE emulator session ' + mode);
  }
  const room = await enter(opts, emu ? { session: opts.session, fov: 64 } : { sim: true, fov: +(params.get('fov') || 64) }), S = room.S, c = room.renderer.domElement;
  await room.world.handsReady;       // film the hands the app draws once their mesh is in, not the fallback of the first frames
  if (room.world.mr) {       // no camera in a simulator: a photograph of a real room stands in for passthrough
    const tex = await new THREE.TextureLoader().loadAsync('./shots/room.jpg'); tex.colorSpace = THREE.SRGBColorSpace;
    room.world.backdrop(tex, +(params.get('turn') || 0));
    room.world.dropPeople(+(params.get('drop') || 0));      // the photograph was taken from standing height: put the people on its floor
  }
  const post = (path, body, type) => fetch(`${SERVER}/${scene}/${path}`, { method: 'POST', body, headers: type ? { 'Content-Type': type } : {} });

  // ---------- the performer ----------
  let t = 0, frame = 0;
  clockNow = (at) => frame / FPS + Math.max(0, (at ?? t) - t);
  const aim = { pitch: -3, yaw: 0 }, cur = { pitch: -3, yaw: 0 };
  const hand = { right: { lift: 0, liftTo: 0, pinch: 0, pinchTo: 0, down: false }, left: { lift: 0, liftTo: 0, pinch: 0, pinchTo: 0, down: false } };
  const REST = { right: new THREE.Vector3(0.3, 0.76, -0.33), left: new THREE.Vector3(-0.3, 0.76, -0.33) }, UP = { right: new THREE.Vector3(0.21, 1.0, -0.45), left: new THREE.Vector3(-0.21, 1.0, -0.45) };   // raised, but to the sides of the monitor so they never cover the line
  const eul = new THREE.Euler(), quat = new THREE.Quaternion(), wrist = new THREE.Vector3();
  const hq = new THREE.Quaternion(), he = new THREE.Euler();
  async function tick() {
    const dt = 1 / FPS; t += dt;
    const k = 1 - Math.exp(-dt * 6.5);                       // the head eases toward where it is aimed
    cur.pitch += (aim.pitch - cur.pitch) * k; cur.yaw += (aim.yaw - cur.yaw) * k;
    const pitch = cur.pitch + 0.35 * Math.sin(t * 1.7 + 2) + 0.15 * Math.sin(t * 3.7), yaw = cur.yaw + 0.4 * Math.sin(t * 1.3) + 0.2 * Math.sin(t * 2.9 + 1);      // nobody holds their head perfectly still
    const roll = 0.5 * Math.sin(t * 0.9 + 0.4), hx = 0.004 * Math.sin(t * 1.1), hy = 0.003 * Math.sin(t * 2.3);
    if (emu) { he.set(pitch * deg, -yaw * deg, roll * deg, 'YXZ'); hq.setFromEuler(he); dev.position.set(hx, 1.2 + hy, 0); dev.quaternion.set(hq.x, hq.y, hq.z, hq.w); }
    else { room.look.pitch = pitch; room.look.yaw = yaw; room.look.roll = roll; room.look.x = hx; room.look.y = hy; }
    for (const side of ['right', 'left']) {
      const h = hand[side], m = side === 'left' ? -1 : 1;
      h.lift += (h.liftTo - h.lift) * (1 - Math.exp(-dt * 9)); h.pinch += (h.pinchTo - h.pinch) * (1 - Math.exp(-dt * 26));
      wrist.copy(REST[side]).lerp(UP[side], h.lift); wrist.x += 0.004 * Math.sin(t * 1.9 + m); wrist.y += 0.003 * Math.sin(t * 2.4 + m * 2);
      eul.set((26 + 16 * h.lift) * deg, m * 20 * deg, -m * (38 - 10 * h.lift) * deg, 'YXZ'); quat.setFromEuler(eul);
      if (emu) {              // the emulated hand: the runtime owns the joints and fires the pinch as a real select event
        const eh = dev.hands[side]; eh.position.set(wrist.x, wrist.y, wrist.z); eh.quaternion.set(quat.x, quat.y, quat.z, quat.w); eh.updatePinchValue(Math.max(0, Math.min(1, h.pinch)));
      } else {
        if (!h.down && h.pinchTo === 1 && h.pinch > 0.86) { h.down = true; room.world.flash(side); room.pinches.press(side, t); }
        if (h.down && h.pinchTo === 0 && h.pinch < 0.5) { h.down = false; room.pinches.release(side, t); }
        room.world.hand(side, handJoints(side, wrist, quat, h.pinch, 0.42 + 0.12 * h.pinch)); S.lostSince[side] = null;
      }
    }
    if (emu) await new Promise((res) => { frameDone = res; });          // the app's own XR frame loop renders this frame
    else { room.step(t); room.render(); }
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93));
    await post(`f_${String(++frame).padStart(5, '0')}.jpg`, blob, 'image/jpeg');
  }
  const run = async (sec) => { const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) await tick(); };
  const look = (pitch, yaw = 0) => { aim.pitch = pitch; aim.yaw = yaw; };
  async function pinch(side = 'right', held = 0.14) { const h = hand[side]; h.liftTo = 1; await run(0.5); h.pinchTo = 1; await run(0.2 + held); h.pinchTo = 0; await run(0.35); h.liftTo = 0.45; }   // the hand comes up into the frame, pinches, and settles
  async function holdStart(side = 'left') { const h = hand[side]; h.liftTo = 0.5; await run(0.4); h.pinchTo = 1; }       // held low and to the side, clear of the line it brings back
  async function holdEnd(side = 'left') { const h = hand[side]; h.pinchTo = 0; await run(0.25); h.liftTo = 0; }
  const DOWN = -21, ROOM = -3;
  // read the line, look up at a part of the room, say it (secs of "speaking"), pinch on
  async function say(secs, yaw = 0, readFor = 1.0) { look(DOWN, 0); await run(readFor); look(ROOM, yaw); await run(secs); await pinch('right'); await run(0.25); }
  const mark = (name) => events.push({ name: 'mark:' + name, t: +(frame / FPS).toFixed(3) });
  const menuGo = async (index) => { look(-17, 0); await run(0.6); while (S.menu && S.menu.focus !== index) { await pinch('left'); await run(0.2); } await run(0.3); await pinch('right'); await run(0.4); };

  // lengths of the film's voice clips, so the performance waits exactly as long as each one lasts
  let D = {}; try { D = (await (await fetch('./shots/voice.json')).json()).durations; } catch (e) { console.log('CAPTURE no voice lengths'); }
  // ---------- the scenes ----------
  const SCENES = {
    // emulator smoke test: centre with a pinch, pass two try-out lines, pinch with the other hand
    async emutest() { look(ROOM, 0); await run(1.0); console.log('CAPTURE state ' + S.kind + ' canvas ' + c.width + 'x' + c.height); await pinch('right'); await run(0.6); console.log('CAPTURE state ' + S.kind + ' demo ' + !!(S.run && S.run.demo)); await say(2.5, 0, 1.2); console.log('CAPTURE line ' + (S.run ? S.run.index : -1) + ' head ' + (S.run ? S.run.head : '')); await pinch('left', 0.02); await run(0.6); console.log('CAPTURE after back ' + (S.run ? S.run.index : -1)); await run(0.5); },
    // a short look around, to check how the stand-in room sits behind the app
    async roomtest() { room.data.seen.try4 = 1; room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(ROOM, 0); await run(1.6); look(ROOM, -20); await run(1.2); look(DOWN, 0); await run(1.2); },
    // a few frames with the hands up, to check how they are drawn
    async hands() { look(-14, 0); hand.right.liftTo = 1; hand.left.liftTo = 1; await run(0.8); hand.right.pinchTo = 1; await run(0.5); },
    // the first seconds of the film: already seated, a line on the monitor, the head comes up, the room answers
    async open() {
      room.data.seen.try4 = 1; room.act('next'); cur.pitch = DOWN; look(DOWN, 0); for (let k = 0; k < 6; k++) { t += 1 / FPS; room.step(t); } S.menu.focus = 1; room.act('next'); frame = 0; hand.right.liftTo = 0.45;
      mark('read'); await run(2.4); mark('up'); look(ROOM, 4); await run(4.8); mark('pinch'); await pinch('right'); await run(0.9);
      mark('left'); await say(4.4, -19, 1.2); mark('right'); await say(5.4, 17, 1.2);
      mark('down'); look(DOWN, 0); await run(3.0); mark('upagain'); look(ROOM, -3); await run(4.6); await pinch('right'); await run(0.9);
    },
    // a short look around, to check how the stand-in room sits behind the app
    async roomtest() { room.data.seen.try4 = 1; room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(ROOM, 0); await run(1.6); look(ROOM, -20); await run(1.2); look(DOWN, 0); await run(1.2); },
    // a few frames with the hands up, to check how they are drawn
    async hands() { look(-14, 0); hand.right.liftTo = 1; hand.left.liftTo = 1; await run(0.8); hand.right.pinchTo = 1; await run(0.5); },
    // a short look around, to check how the stand-in room sits behind the app
    async roomtest() { room.data.seen.try4 = 1; room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(ROOM, 0); await run(1.6); look(ROOM, -20); await run(1.2); look(DOWN, 0); await run(1.2); },
    // a few frames with the hands up, to check how they are drawn
    async hands() { look(-14, 0); hand.right.liftTo = 1; hand.left.liftTo = 1; await run(0.8); hand.right.pinchTo = 1; await run(0.5); },
    // sitting down: centre, first hint, two lines of the try-out
    async begin() {
      look(-8, 0); await run(1.2); look(ROOM, 0); await run(1.3); mark('centre'); await pinch('right'); await run(0.6);
      mark('line1'); await say(2.6, 0, 1.6); mark('line2'); await say(2.8, -15, 1.2); await run(0.4);
    },
    // the heart of it: the pitch, a few lines to different parts of the room, one look down mid-line
    async rehearse() {
      room.data.seen.try4 = 1; room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(ROOM, 0); await run(1.0);
      mark('read'); await say(4.6, 0, 1.4); mark('left'); await say(3.2, -16, 1.0); mark('right'); await say(5.2, 16, 1.1);
      mark('down'); look(DOWN, 0); await run(1.3); look(ROOM, 0); await run(4.2); await pinch('right'); await run(0.6);
    },
    // the same script later: lines are thinner; one line pulled out with the other hand; one step back
    async thinner() {
      room.data.seen.try4 = 1; const lines = room.scripts[1].lines;
      lines.forEach((l, i) => { room.data.levels[l.id] = i < 2 || i === lines.length - 1 ? 2 : 1; room.data.clean[l.id] = i < 9 ? 1 : 0; });
      room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(DOWN, 0); await run(1.6);
      mark('firstword'); look(ROOM, 0); await run(3.4); await pinch('right'); await run(0.2);
      mark('keywords'); await say(3.4, 14, 1.3); mark('stuck'); look(DOWN, 0); await run(1.0); look(ROOM, -6); await run(1.6);
      await holdStart('left'); look(DOWN, 0); await run(2.4); mark('peek'); await holdEnd('left'); look(ROOM, -12); await run(4.4); await pinch('right'); await run(0.3);
      mark('back'); look(DOWN, 0); await run(0.9); await pinch('left', 0.02); await run(1.2); look(ROOM, 0); await run(0.8);
    },
    // the clock running out, the last lines, the house, the notes sheet, and choosing to run the weak lines
    async curtain() {
      room.data.seen.try4 = 1;
      room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(ROOM, 0); await run(0.3);
      const yaws = [0, -14, 14, 0, -13, 15, 0, 13, -15, 0, 14, 0, -13, 12, 0];
      quiet = true;
      for (let i = 0; i < 15; i++) {            // most of the run goes by off camera (the film cuts to its last minute); its sounds are not laid on the track
        const r = S.run; if (i === 4) { r.peek(true); for (let k = 0; k < 30; k++) { t += 1 / 30; room.look.pitch = ROOM; room.step(t); } r.peek(false); }
        const up = r.minUp(r.index) + 0.3, looks = i === 9 ? 2 : 1;
        for (let L = 0; L < looks; L++) { for (let k = 0; k < 24; k++) { t += 1 / 30; room.look.pitch = DOWN; room.look.yaw = 0; room.step(t); } for (let k = 0; k < Math.round((L === looks - 1 ? up : 1.2) * 30); k++) { t += 1 / 30; room.look.pitch = ROOM; room.look.yaw = yaws[i]; room.step(t); } }
        room.act('next');
      }
      quiet = false; cur.pitch = ROOM; cur.yaw = 0; look(ROOM, 0); mark('clock'); await run(1.2);
      await say(3.4, 14, 1.1); await say(3.6, 0, 1.0); mark('last'); look(DOWN, 0); await run(1.0); look(ROOM, 3); await run(3.6); await pinch('right');
      mark('land'); await run(2.1);                    // the last word: stay with one person
      mark('house'); look(ROOM, 12); await run(1.5); look(ROOM, -8); await run(1.6); mark('notes'); look(-2, -14); await run(4.6); mark('result'); look(ROOM, 8); await run(3.2);
      look(-17, -4); await run(1.2); mark('weak'); await pinch('right'); await run(1.6);
    },
    // ---- the narrated film: every wait is as long as the voice clip that plays over it (lengths in shots/voice.json) ----
    // 1. what it is, then the loop in three steps, then two lines at a natural pace, then looking down
    async tour() {
      room.data.seen.try4 = 1; room.act('next'); cur.pitch = DOWN; look(DOWN, 0); for (let k = 0; k < 6; k++) { t += 1 / FPS; room.step(t); } S.menu.focus = 1; room.act('next'); frame = 0; hand.right.liftTo = 0.45; hand.left.liftTo = 0.3;
      await run(0.4); mark('n_intro'); await run(2.2); look(ROOM, 0); await run(3.0); look(ROOM, -14); await run(2.3); look(ROOM, 12); await run(2.3); look(DOWN, 0); await run(Math.max(0.8, D.n_intro - 9.8 + 0.6));
      mark('n_step1'); await run(D.n_step1 + 0.4);
      mark('n_step2'); await run(1.3); mark('up'); look(ROOM, 2); await run(D.n_step2 - 1.3 + 0.3); mark('u_1'); await run(D.u_1 + 0.5);
      mark('n_step3'); await run(1.3); mark('pinch'); await pinch('right'); look(DOWN, 0); await run(Math.max(1.0, D.n_step3 - 2.5 + 0.6));
      mark('n_face'); await run(0.9); look(ROOM, -17); await run(D.n_face - 0.9 + 0.3); mark('u_2'); await run(D.u_2 + 0.5); await pinch('right'); await run(0.3);
      mark('loop');
      look(DOWN, 0); await run(1.3); look(ROOM, 0); await run(0.9); mark('n_down'); await run(1.7); mark('down'); look(DOWN, 0); await run(D.n_down - 1.7 + 0.9);
      mark('n_keep'); look(ROOM, 0); await run(D.n_keep + 0.5); mark('u_3'); await run(D.u_3 + 0.5); await pinch('right'); await run(1.0);
    },
    // 0. sitting down: the one pinch of setup, then choosing a script from the monitor
    async start() {
      room.data.seen.try4 = 1; cur.pitch = -6; look(ROOM, 0); hand.right.liftTo = 0.45; hand.left.liftTo = 0.3; await run(0.8);
      mark('n_centre'); await run(Math.max(1.5, D.n_centre - 1.6)); mark('centre'); await pinch('right'); await run(0.8);
      look(-17, 0); await run(0.5); mark('n_menu'); await run(0.8); await menuGo(1); mark('chosen'); look(DOWN, 0); await run(1.2);
    },
    // 2. a later night: one line down to its first word, one to key words, and one pulled back with the other hand
    async tour2() {
      room.data.seen.try4 = 1; const lines = room.scripts[1].lines;
      lines.forEach((l, i) => { room.data.levels[l.id] = i === 0 ? 2 : 1; room.data.clean[l.id] = i < 9 ? 1 : 0; });
      room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); cur.pitch = DOWN; look(DOWN, 0); hand.right.liftTo = 0.45; hand.left.liftTo = 0.3; await run(1.0);
      mark('n_thin_a'); await run(D.n_thin_a + 0.3); look(ROOM, 0); await run(0.6); mark('u_1'); await run(D.u_1 + 0.4); await pinch('right'); await run(0.2);
      look(DOWN, 0); await run(1.1); look(ROOM, -14); await run(0.6); mark('u_stall2'); await run(D.u_stall2 + 0.3);
      mark('n_stuck'); await run(1.3); await holdStart('left'); look(DOWN, 0); mark('peek'); await run(Math.max(2.4, D.n_stuck - 1.7 + 0.6)); await holdEnd('left'); look(ROOM, -14); await run(0.7); mark('u_2'); await run(D.u_2 + 0.5); await pinch('right'); await run(0.6);
    },
    // 3. the end of a run: the clock, the last line, two seconds with them, the notes, and the room again
    async tour3() {
      room.data.seen.try4 = 1;
      room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(ROOM, 0); await run(0.3);
      const yaws = [0, -14, 14, 0, -13, 15, 0, 13, -15, 0, 14, 0, -13, 12, 0, -14, 13];
      quiet = true;
      for (let i = 0; i < 17; i++) {            // the run up to its last line goes by off camera; its sounds are not laid on the track
        const r = S.run; if (i === 4) { r.peek(true); for (let k = 0; k < 30; k++) { t += 1 / 30; room.look.pitch = ROOM; room.step(t); } r.peek(false); }
        const up = r.minUp(r.index) + 0.3, looks = i === 9 ? 2 : 1;
        for (let L = 0; L < looks; L++) { for (let k = 0; k < 24; k++) { t += 1 / 30; room.look.pitch = DOWN; room.look.yaw = 0; room.step(t); } for (let k = 0; k < Math.round((L === looks - 1 ? up : 1.2) * 30); k++) { t += 1 / 30; room.look.pitch = ROOM; room.look.yaw = yaws[i]; room.step(t); } }
        room.act('next');
      }
      quiet = false; cur.pitch = ROOM; cur.yaw = 0; look(ROOM, 0); hand.right.liftTo = 0.45; hand.left.liftTo = 0.3; await run(1.0);
      mark('n_clock'); await run(D.n_clock + 0.3);
      mark('n_land'); await run(2.6); look(DOWN, 0); await run(D.n_land - 2.6 + 0.3); look(ROOM, 3); await run(0.7); mark('u_last'); await run(D.u_last + 0.5); await pinch('right');
      mark('land'); await run(2.1);
      mark('house'); look(ROOM, 12); await run(1.5); look(ROOM, -8); await run(1.6); look(-2, -14); await run(0.5); mark('n_notes'); await run(D.n_notes + 0.9);
      mark('result'); look(ROOM, 4); await run(1.6);
    },
    // one question from the room
    async question() {
      room.data.seen.try4 = 1; room.act('next'); await run(0.2); look(-17, 0); await run(0.5); S.menu.focus = S.menu.buttons.length - 1; await run(0.6); await pinch('right');
      mark('asked'); look(-2, -13); await run(2.3); look(ROOM, 3); await run(4.5); look(ROOM, 15); await run(2.2); look(ROOM, 2); await run(1.4); mark('done'); look(-17, -5); await run(0.9); await pinch('right'); await run(2.2);
    },
    // pause with both hands, and leave
    async pause() {
      room.data.seen.try4 = 1; room.act('next'); await run(0.2); S.menu.focus = 1; room.act('next'); look(ROOM, 0); await run(0.6); await say(3.0, 0, 1.0); look(ROOM, -8); await run(1.2);
      mark('both'); hand.right.liftTo = 1; hand.left.liftTo = 1; await run(0.3); hand.right.pinchTo = 1; hand.left.pinchTo = 1; await run(0.9); hand.right.pinchTo = 0; hand.left.pinchTo = 0; look(-17, 0); await run(1.6);
      hand.right.liftTo = 0.3; hand.left.liftTo = 0.3; await run(1.4);
    },
  };
  // the app's own sounds, rendered once so the edit can lay them under the picture at the logged times
  if (params.get('sounds') === '1') {
    for (const name of ['click', 'chime', 'tick', 'applause']) {
      try {
        const off = new OfflineAudioContext(2, 48000 * (name === 'applause' ? 4 : 1), 48000); sfx[name](off); const buf = await off.startRendering();
        const n = buf.length, wav = new DataView(new ArrayBuffer(44 + n * 4)), w = (o, s) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
        w(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true); wav.setUint32(24, 48000, true); wav.setUint32(28, 48000 * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, n * 4, true);
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        for (let i = 0; i < n; i++) { wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
        await fetch(`${SERVER}/sounds/${name}.wav`, { method: 'POST', body: wav.buffer });
      } catch (e) { console.log('CAPTURE sound failed ' + name + ' ' + e); }
    }
  }
  if (!SCENES[scene]) { console.log('CAPTURE unknown scene ' + scene); await post('done.json', JSON.stringify({ error: 'unknown' })); return; }
  await run(0.2); frame = 0; events.length = 0; const t0 = t;        // settle, then start counting
  await SCENES[scene]();
  void t0; await post('events.json', JSON.stringify({ fps: FPS, frames: frame, w: W, h: H, events }));
  await post('done.json', JSON.stringify({ frames: frame }));
  console.log(`CAPTURE DONE ${scene} ${frame} frames`);
}
