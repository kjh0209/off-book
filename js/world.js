// Off Book: the room. Builds the three.js scene from the design and exposes the few things the app changes:
// what the monitor shows, which people are lit, the clock, the two boards and the hands.
// Unlit materials only, no shadows, no real-time lights. Canvas textures are redrawn only when their content changes.
import * as THREE from 'three';
import { color, layout } from './tokens.js';
import { drawMonitor } from './draw/monitor.js';
import { drawClock } from './draw/clock.js';
import { drawNotes } from './draw/notes.js';
import { drawQuestion } from './draw/qa.js';
import { drawFloor, drawWall, drawTable } from './draw/textures.js';

const deg = Math.PI / 180;
const basic = (o) => new THREE.MeshBasicMaterial(o);
export const LIGHT = { lit: 1, dim: 0.05, out: 0.02, half: 0.3, ask: 0.15 };   // linear multipliers

function canvasTex(w, h, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: !!opts.read });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  return { c, ctx, t, draw(fn) { fn(ctx, w, h); t.needsUpdate = true; } };
}
function drawPool(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,226,180,0.6)'); g.addColorStop(0.55, 'rgba(255,226,180,0.18)'); g.addColorStop(1, 'rgba(255,226,180,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
// one lamp per line on the monitor's top rail, in fives; square = anchor line; bar = current line
function drawRail(ctx, w, h, { total = 0, lit = new Set(), anchors = new Set(), current = -1 } = {}) {
  ctx.fillStyle = color.n2; ctx.fillRect(0, 0, w, h);
  if (!total) return;
  const groups = Math.floor((total - 1) / 5), room = w - 2 * 96;
  const gap = Math.min(62, (room - groups * 22) / Math.max(1, total - 1)), group = Math.min(34, gap * 0.55), r = Math.min(17, gap * 0.36);
  let x = (w - ((total - 1) * gap + groups * group)) / 2;
  for (let i = 0; i < total; i++) {
    const y = h * 0.44;
    ctx.fillStyle = lit.has(i) ? color.accent : color.n4;
    if (anchors.has(i)) ctx.fillRect(x - r, y - r, r * 2, r * 2); else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    if (i === current) { ctx.fillStyle = color.n8; ctx.fillRect(x - Math.max(r * 2, 14), h - 17, Math.max(r * 4, 28), 8); }
    x += gap + ((i + 1) % 5 === 0 ? group : 0);
  }
}

// mr: "my room". Nothing of the hall is drawn; the monitor, the clock and seven people stand in the user's own room (passthrough).
export async function buildWorld({ panel = false, textScale = 1, mr = false } = {}) {
  await Promise.all(['500 80px "Atkinson Hyperlegible Next"', '400 40px "Atkinson Hyperlegible Next"', '600 40px "Atkinson Hyperlegible Next"',
    '400 40px "Atkinson Hyperlegible Mono"', '500 40px "Atkinson Hyperlegible Mono"'].map((f) => document.fonts.load(f)));
  const loader = new THREE.TextureLoader();
  const img = async (url) => { const t = await loader.loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

  const scene = new THREE.Scene();
  const room = new THREE.Group(); scene.add(room);        // everything that belongs to the room; moved as one when the user is centred
  const shell = new THREE.Group(); room.add(shell); shell.visible = !mr;   // floor, walls, table, risers, lamps: the hall itself
  const E = layout.eyeHeight;

  // ---------- room ----------
  const floorT = canvasTex(1024, 1024, { repeat: [4, 4], read: true }); floorT.draw((c, w) => drawFloor(c, w));
  const wallT = canvasTex(1024, 1024, { repeat: [5, 2], read: true }); wallT.draw((c, w) => drawWall(c, w));
  const tableT = canvasTex(1024, 1024, { repeat: [2, 1], read: true }); tableT.draw((c, w) => drawTable(c, w));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), basic({ map: floorT.t })); floor.rotation.x = -Math.PI / 2; floor.position.z = -1; shell.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), basic({ color: 0x0b0a09 })); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 4.2, -1); shell.add(ceiling);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), basic({ map: wallT.t, color: 0xe6e0d6 })); back.position.set(0, 2.1, -7.6); shell.add(back);
  const behind = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), basic({ map: wallT.t, color: 0x8f8a82 })); behind.position.set(0, 2.1, 5.6); behind.rotation.y = Math.PI; shell.add(behind);
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 0.02), basic({ color: 0x1b1815 })); skirting.position.set(0, 0.06, -7.58); shell.add(skirting);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), basic({ map: wallT.t, color: 0xb4aea4 }));
    side.position.set(sx * 5.6, 2.1, -1); side.rotation.y = -sx * Math.PI / 2; shell.add(side);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 1.15), basic({ map: tableT.t, color: new THREE.Color(2.0, 1.9, 1.8) }));
  table.position.set(0, layout.tableHeight - 0.02, -0.95); shell.add(table);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.1, 1.09), basic({ color: 0x0f0d0b })); apron.position.set(0, layout.tableHeight - 0.09, -0.95); shell.add(apron);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, layout.tableHeight - 0.04, 0.05), basic({ color: 0x0f0d0b }));
    leg.position.set(sx * 0.69, (layout.tableHeight - 0.04) / 2, -0.95 + sz * 0.52); shell.add(leg);
  }

  // ---------- monitor ----------
  const md = layout.monitor.distance, ma = layout.monitor.centreBelowEye * deg, mw = layout.monitor.width, mh = mw * 592 / 2048;
  const mon = new THREE.Group(); mon.position.set(0, E - md * Math.sin(ma), -md * Math.cos(ma)); mon.rotation.x = -ma; mon.scale.setScalar(textScale); room.add(mon);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.06, mh + 0.085, 0.05), basic({ color: 0x0d0c0a })); housing.position.set(0, 0.012, -0.027); mon.add(housing);
  const body = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.02, mh + 0.085, 0.3), basic({ color: 0x0d0c0a })); body.position.set(0, 0.012, -0.2); mon.add(body);
  const screenT = canvasTex(2048, 592);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), basic({ map: screenT.t })); mon.add(screen);
  const railT = canvasTex(2048, 96);
  const rail = new THREE.Mesh(new THREE.PlaneGeometry(mw, mw * 96 / 2048), basic({ map: railT.t })); rail.position.set(0, mh / 2 + mw * 48 / 2048 + 0.006, 0.001); mon.add(rail);
  // the veil that fades the words while the head is up
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), basic({ color: color.n1, transparent: true, opacity: 0, depthWrite: false })); veil.position.z = 0.0015; veil.visible = false; mon.add(veil);

  // my room: the monitor has no table to stand on, so it is a thin panel, and it fades back while the head is up
  // (in the hall the words are veiled; here the whole panel steps aside so it does not stand between you and the people)
  const monMats = [housing.material, body.material, screen.material, rail.material];
  if (mr) { body.visible = false; for (const m of monMats) { m.transparent = true; m.depthWrite = false; } }

  // ---------- audience ----------
  const A = layout.audience, personH = 1.3, firstRow = 4.6, rowDepth = 0.85, riserH = 0.25, seatGap = 0.66;
  const peopleT = await img(panel ? './textures/panel.png' : './textures/people.png');
  const meta = await (await fetch(panel ? './textures/panel.json' : './textures/people.json')).json();
  const handT = panel ? null : await img('./textures/hand_up.png');
  const poolT = canvasTex(256, 256); poolT.draw(drawPool);
  const people = [], blocks = [];
  let seat = 0, asker = null, mrSeat = 0;
  const MR_SLOTS = [-27, -18, -4.5, 4.5, 13.5, 22.5, 31.5].map((v) => v - 2.25);   // degrees: two on the left, three in the middle, two on the right
  A.blockYaw.forEach((yaw, bi) => {
    const dir = new THREE.Vector3(Math.sin(yaw * deg), 0, -Math.cos(yaw * deg)), right = new THREE.Vector3(Math.cos(yaw * deg), 0, Math.sin(yaw * deg));
    const block = { level: LIGHT.half, risers: [], bulb: null, shade: null, pool: null, wash: null };
    A.perBlock.forEach((n, ri) => {
      const d = firstRow + ri * rowDepth, y0 = ri * riserH;
      if (ri > 0 && !panel) {
        const riser = new THREE.Mesh(new THREE.BoxGeometry(2.25, riserH * ri, rowDepth), basic({ color: 0x100d0b }));
        riser.position.copy(dir.clone().multiplyScalar(d)).setY(riserH * ri / 2); riser.rotation.y = -yaw * deg; shell.add(riser); block.risers.push(riser);
      }
      for (let k = 0; k < n; k++) {
        if (panel && !(ri === 0 && k === 0)) { seat++; continue; }
        if (mr && !panel && ri === 2) { seat++; continue; }                 // my room: the front two rows only, as one arc of five
        let pos = panel ? new THREE.Vector3((bi - 1) * 0.78, 0, -3.3) : dir.clone().multiplyScalar(d).add(right.clone().multiplyScalar((k - (n - 1) / 2) * seatGap));
        if (mr && !panel) { const a = (yaw + (ri === 0 ? (k - 0.5) * 7 : (k - 1) * 7) * (ri === 0 ? 1 : 0.0)) * deg; const slot = MR_SLOTS[mrSeat++ % MR_SLOTS.length]; pos = new THREE.Vector3(Math.sin(slot * deg) * 3.1, 0, -Math.cos(slot * deg) * 3.1); void a; }
        const i = panel ? bi : seat % meta.count, flip = !panel && seat >= meta.count;
        const map = peopleT.clone(); map.repeat.set((flip ? -1 : 1) / meta.cols, 1 / meta.rows);
        map.offset.set(((i % meta.cols) + (flip ? 1 : 0)) / meta.cols, 1 - (Math.floor(i / meta.cols) + 1) / meta.rows); map.needsUpdate = true;
        const mat = basic({ map, transparent: true, alphaTest: mr ? 0.02 : 0.5, depthWrite: !mr });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(personH * 0.5, personH), mat);
        const yy = mr ? 0 : y0;
        m.position.copy(pos).setY(yy + personH / 2); m.rotation.y = mr && !panel ? Math.atan2(-pos.x, -pos.z) : panel ? 0 : -yaw * deg; room.add(m);
        const p = { mesh: m, mat, block: bi, cur: LIGHT.half, target: LIGHT.half, wait: 0, stagger: ((seat * 37) % 16) / 100, y0: yy, phase: (seat * 2.399) % 6.283, nod: 0, focus: 0,
          yaw: Math.atan2(pos.x, -pos.z) / deg, pitch: Math.atan2(yy + personH * 0.86 - E, Math.hypot(pos.x, pos.z)) / deg };
        people.push(p);
        if (!panel && !mr && bi === 1 && ri === 0 && k === 1) asker = p;       // front of the centre block, beside the question board
        seat++;
      }
    });
    const c = dir.clone().multiplyScalar(firstRow + rowDepth);
    block.shade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 20, 1, true), basic({ color: 0x141210, side: THREE.DoubleSide })); block.shade.position.set(c.x, 2.92, c.z); shell.add(block.shade);
    block.bulb = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), basic({ color: 0x2a2018 })); block.bulb.rotation.x = Math.PI / 2; block.bulb.position.set(c.x, 2.845, c.z); shell.add(block.bulb);
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.2, 0.012), basic({ color: 0x1b1815 })); cord.position.set(c.x, 3.6, c.z); shell.add(cord);
    block.pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.8), basic({ map: poolT.t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    block.pool.rotation.x = -Math.PI / 2; block.pool.rotation.z = yaw * deg; block.pool.position.set(c.x - dir.x * 1.1, 0.004, c.z - dir.z * 1.1); shell.add(block.pool);
    block.wash = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.6), basic({ map: poolT.t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    block.wash.position.set(Math.tan(yaw * deg) * 7.55, 2.0, -7.55); shell.add(block.wash);
    blocks.push(block);
  });
  if (panel) {
    const pt = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.70, 0.5), basic({ color: 0x1b1611 })); pt.position.set(0, 0.35, -2.85); room.add(pt);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.03, 0.56), basic({ color: 0x3a2f25 })); top.position.set(0, 0.715, -2.85); room.add(top);
  }
  // the asker's raised hand: a second sprite on the same seat, shown only while the question is being asked
  let askerUp = null;
  if (asker && handT) {
    askerUp = new THREE.Mesh(new THREE.PlaneGeometry(personH, personH), basic({ map: handT, transparent: true, alphaTest: 0.5 }));
    askerUp.position.copy(asker.mesh.position); askerUp.rotation.copy(asker.mesh.rotation); askerUp.visible = false; room.add(askerUp);
  }
  const lampOn = new THREE.Color(0xffe2b4), lampOff = new THREE.Color(0x2a2018), shadeOn = new THREE.Color(0x2b2620), shadeOff = new THREE.Color(0x141210), riserOn = new THREE.Color(0x3a2e24), riserOff = new THREE.Color(0x100d0b);

  // ---------- clock ----------
  const cw = layout.clock.width, ch = cw * 320 / 1024;
  const clockT = canvasTex(1024, 320);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), basic({ map: clockT.t }));
  clock.position.set(0, E + layout.clock.distance * Math.tan(layout.clock.aboveEye * deg), -7.58); room.add(clock);
  if (mr) { clock.scale.setScalar(0.46); clock.position.set(0, E + 3.4 * Math.tan(15 * deg), -3.4); }
  let clockKey = '';

  // ---------- boards: notes and question, standing left of centre on a solid base ----------
  function board(w, h, dist, below, yaw, tex) {
    const g = new THREE.Group(); g.rotation.y = -yaw * deg; room.add(g);
    const y = E - dist * Math.sin(below * deg), z = -dist * Math.cos(below * deg);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic({ map: tex })); face.position.set(0, y, z); g.add(face);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.02), basic({ color: 0x0d0c0a })); frame.position.set(0, y, z - 0.012); g.add(frame);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, y - h / 2, 0.02), basic({ color: 0x0d0c0a })); base.position.set(0, (y - h / 2) / 2, z - 0.012); g.add(base);
    g.visible = false; return g;
  }
  const nw = layout.notes.width, notesT = canvasTex(2048, 1400), questionT = canvasTex(1536, 640);
  const notesBoard = board(nw, nw * 1400 / 2048, layout.notes.distance, layout.notes.centreBelowEye, layout.notes.yaw, notesT.t);
  const questionBoard = board(nw, nw * 640 / 1536, layout.notes.distance, 5.8, layout.notes.yaw, questionT.t);

  // ---------- hands: 25 joints each, drawn as joints and the bones between them (two instanced meshes per hand) ----------
  // Joint order is the WebXR one: wrist, then thumb (4), index, middle, ring, little (5 each).
  const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [8, 9], [0, 10], [10, 11], [11, 12], [12, 13], [13, 14],
    [0, 15], [15, 16], [16, 17], [17, 18], [18, 19], [0, 20], [20, 21], [21, 22], [22, 23], [23, 24], [5, 10], [10, 15], [15, 20]];
  const hands = { left: null, right: null }, tmp = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dv = new THREE.Vector3();
  // Shaded without lights: a painted sphere (matcap) gives the fingers form. The hands are drawn last, over a cleared
  // depth buffer, because real hands rest in the lap, which is under the virtual table.
  const mc = canvasTex(128, 128); mc.draw((c, w, h) => { const g = c.createRadialGradient(w * 0.38, h * 0.32, 2, w * 0.5, h * 0.5, w * 0.56); g.addColorStop(0, '#e6dccb'); g.addColorStop(0.45, '#a89b89'); g.addColorStop(0.85, '#5b5147'); g.addColorStop(1, '#2c2620'); c.fillStyle = '#2c2620'; c.fillRect(0, 0, w, h); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  const SKIN = new THREE.Color(0xffffff), FLASH = new THREE.Color(1.5, 1.15, 0.6);
  const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3(), basis = new THREE.Matrix4();
  for (const side of ['left', 'right']) {
    const skin = new THREE.MeshMatcapMaterial({ matcap: mc.t, color: SKIN.clone(), transparent: true });
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), skin, 26);          // 25 joints and the palm
    const bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), skin, BONES.length);
    for (const im of [dots, bones]) { im.frustumCulled = false; im.visible = false; scene.add(im); }   // in the scene, not the room: hands live in the user's real space
    dots.renderOrder = side === 'left' ? 20 : 22; bones.renderOrder = dots.renderOrder + 1;
    dots.onBeforeRender = (r) => r.clearDepth();
    hands[side] = { dots, bones, skin, flash: 0 };
  }

  // ---------- state the app drives ----------
  let reachedSet = null;
  let lightMode = 'half', lightZone = 1, lightShares = [1, 1, 1], veilTarget = 0, veilCur = 0, fadeOutT = 0.4, lifeT = 0;
  const api = {
    scene, room, mon, screen, people, blocks, panel, mr,
    monitor(state) { screenT.draw((c, w, h) => drawMonitor(c, w, h, state)); },
    rail(state) { railT.draw((c, w, h) => drawRail(c, w, h, state)); },
    clock(state) { const key = `${Math.ceil(Math.abs(state.seconds))}|${state.target}|${state.state}`; if (key === clockKey) return; clockKey = key; clockT.draw((c, w, h) => drawClock(c, w, h, state)); },
    notes(data) { if (!data) { notesBoard.visible = false; return; } notesT.draw((c, w, h) => drawNotes(c, w, h, data)); notesBoard.visible = true; },
    question(data) { if (!data) { questionBoard.visible = false; return; } questionT.draw((c, w, h) => drawQuestion(c, w, h, data)); questionBoard.visible = true; },
    askerHand(up) { if (askerUp) { askerUp.visible = !!up; asker.mesh.visible = !up; } },
    // mode: 'zone' (the block you face), 'out' (looking down), 'half' (menus), 'full' (the end), 'ask' (only the asker)
    // mode: 'zone' (the block you face), 'out', 'half', 'full', 'ask', or 'shares' (each block as bright as its share of your gaze)
    light(mode, zone = 1) { lightMode = mode; if (Array.isArray(zone)) { const mx = Math.max(1, ...zone); lightShares = zone.map((z) => 0.16 + 0.84 * z / mx); } else lightZone = zone; },
    // a couple of people in a block dip their heads: they heard that line
    nod() {},
    flash(side) { if (hands[side]) hands[side].flash = 0.18; },
    // weights 0..1 per person: how directly the head points at each
    focus(weights) { people.forEach((p, i) => { p.focus = weights ? weights[i] || 0 : 0; }); },
    nodPerson(i) { if (people[i]) people[i].nod = 0.9; },
    // the end: the people you turned to are lit, the others stay half lit
    reached(set) { reachedSet = set; },
    // a stand-in for the real room when there is no passthrough camera (simulator capture): a photograph on a sphere
    backdrop(texture, turn = 0) { const sky = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 32), basic({ map: texture, side: THREE.BackSide, depthWrite: false })); sky.rotation.y = turn * deg; sky.renderOrder = -10; scene.add(sky); return sky; },
    veil(amount) { veilTarget = amount; },
    setFade(sec) { fadeOutT = sec; },
    // put the room where the user is: their eye at the room's eye point, the room's forward along their gaze
    centre(headPos, headYaw) { room.rotation.y = headYaw; room.position.set(headPos.x, headPos.y - E, headPos.z); },
    hand(side, joints) {          // joints: 25 entries of {position, radius} (or null) in WebXR order; null when the hand is not seen
      const { dots, bones } = hands[side]; if (!joints) { dots.visible = bones.visible = false; return; }
      let n = 0;
      for (const j of joints) { if (!j) continue; tmp.position.copy(j.position); tmp.quaternion.identity(); tmp.scale.setScalar(Math.max(0.006, (j.radius || 0.009) * 1.02)); tmp.updateMatrix(); dots.setMatrixAt(n++, tmp.matrix); }
      const w = joints[0], ix = joints[6], md = joints[11], pk = joints[21];
      if (w && ix && md && pk) {      // the palm: a flat ellipsoid between the wrist and the knuckles
        bz.subVectors(md.position, w.position); const len = bz.length(); bx.subVectors(pk.position, ix.position); const wid = bx.length();
        if (len > 1e-3 && wid > 1e-3) {
          bz.multiplyScalar(1 / len); bx.multiplyScalar(1 / wid); by.crossVectors(bz, bx).normalize(); bx.crossVectors(by, bz).normalize();
          basis.makeBasis(bx, by, bz); tmp.quaternion.setFromRotationMatrix(basis); tmp.position.copy(w.position).addScaledVector(bz, len * 0.52);
          tmp.scale.set(wid * 0.72, 0.013, len * 0.58); tmp.updateMatrix(); dots.setMatrixAt(n++, tmp.matrix);
        }
      }
      dots.count = n; dots.instanceMatrix.needsUpdate = true; dots.visible = n > 0;
      let m = 0;
      for (const [a, b] of BONES) {
        const ja = joints[a], jb = joints[b]; if (!ja || !jb) continue;
        dv.subVectors(jb.position, ja.position); const len = dv.length(); if (len < 1e-4) continue;
        tmp.position.addVectors(ja.position, jb.position).multiplyScalar(0.5); tmp.quaternion.setFromUnitVectors(up, dv.multiplyScalar(1 / len));
        const r = Math.max(0.006, Math.min(ja.radius || 0.009, jb.radius || 0.009)); tmp.scale.set(r, len, r); tmp.updateMatrix(); bones.setMatrixAt(m++, tmp.matrix);
      }
      bones.count = m; bones.instanceMatrix.needsUpdate = true; bones.visible = m > 0;
    },
    update(dt) {
      lifeT += dt;
      for (const side of ['left', 'right']) { const h = hands[side]; if (h.flash > 0) { h.flash -= dt; h.skin.color.copy(h.flash > 0 ? FLASH : SKIN); } }
      for (const p of people) {
        const pi = people.indexOf(p);
        let target = lightMode === 'reached' ? (reachedSet && reachedSet.has(pi) ? LIGHT.lit : 0.42) : lightMode === 'full' ? LIGHT.lit : lightMode === 'half' ? LIGHT.half : lightMode === 'out' ? LIGHT.out : lightMode === 'shares' ? lightShares[p.block]
          : lightMode === 'ask' ? (p === asker ? LIGHT.lit : LIGHT.ask) : (p.block === lightZone ? LIGHT.lit * (0.32 + 0.68 * p.focus) : LIGHT.dim);     // the one you face is the brightest in the block
        if (target !== p.target) { p.wait = target > p.cur ? p.stagger : 0; p.target = target; }
        if (p.wait > 0) { p.wait -= dt; continue; }
        const span = p.target > p.cur ? 0.6 : (lightMode === 'out' ? fadeOutT : 1.2);       // seconds for a full swing; always from the current value
        const step = dt / span;
        p.cur = p.target > p.cur ? Math.min(p.target, p.cur + step) : Math.max(p.target, p.cur - step);
        // ease in perception: the multiplier is linear light, so square the ramp position
        const g = p.cur;
        // my room: people are solid whenever the head is up (no ghosts); the ones you face are brighter; they fade away only when you look down
        if (mr) { const b = g <= LIGHT.dim ? 0.5 : 0.5 + 0.5 * (g - LIGHT.dim) / (LIGHT.lit - LIGHT.dim); p.mat.color.setRGB(b, b * 0.98, b * 0.94); p.mat.opacity = Math.max(0, Math.min(1, (g - LIGHT.out) / (LIGHT.dim - LIGHT.out))); p.mesh.visible = p.mat.opacity > 0.01; }
        else p.mat.color.setRGB(g, g * 0.98, g * 0.94);
        // signs of life that a flat sprite can carry: slow breathing, sitting a little taller when lit, a small dip of the head
        const lit = Math.max(0, Math.min(1, (g - LIGHT.dim) / (LIGHT.lit - LIGHT.dim)));
        const sy = 1 + 0.004 * Math.sin(lifeT * 1.15 + p.phase) + 0.012 * lit;
        let lean = 0; if (p.nod > 0) { p.nod -= dt; const x = 1 - Math.max(0, p.nod) / 0.9; lean = x > 0 && x < 1 ? 0.028 * Math.sin(Math.PI * x) : 0; }      // a flat picture cannot nod; it can sit forward a little
        p.mesh.scale.set(1 + lean, sy + lean, 1); p.mesh.position.y = p.y0 + personH * (sy + lean) / 2;
      }
      blocks.forEach((b, bi) => {
        const mine = people.filter((p) => p.block === bi); const lv = mine.length ? mine.reduce((s, p) => s + p.cur, 0) / mine.length : 0;
        const k = Math.max(0, Math.min(1, (lv - LIGHT.dim) / (LIGHT.lit - LIGHT.dim)));
        b.bulb.material.color.copy(lampOff).lerp(lampOn, k); b.shade.material.color.copy(shadeOff).lerp(shadeOn, k);
        b.pool.material.opacity = 0.42 * k; b.wash.material.opacity = 0.16 * k; b.pool.visible = b.wash.visible = k > 0.01;
        for (const r of b.risers) r.material.color.copy(riserOff).lerp(riserOn, k);
        if (askerUp && bi === 1) askerUp.material.color.copy(asker.mat.color);
      });
      const vs = veilTarget > veilCur ? dt / 0.3 : dt / 0.25;
      veilCur = veilTarget > veilCur ? Math.min(veilTarget, veilCur + vs) : Math.max(veilTarget, veilCur - vs);
      if (mr) { veil.visible = false; const o = 1 - 0.86 * veilCur; for (const m of monMats) m.opacity = o; }
      else { veil.material.opacity = veilCur; veil.visible = veilCur > 0.01; }
    },
  };
  api.monitor({ mode: 'message', title: '' }); api.rail({}); api.clock({ seconds: 180, target: 180, state: 'normal' });
  return api;
}
