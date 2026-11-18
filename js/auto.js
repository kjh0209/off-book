// Off Book: a scripted walk through the real app, for checking it in a browser with nobody at the keys.
// index.html?auto=walk runs every step and logs AUTO PASS / AUTO FAIL lines; other values stop in one state for a screenshot:
// auto=run | left | down | peek | menu | pause | curtain | question
export async function runAuto(enter, mode) {
  localStorage.removeItem('offbook.v1');
  const room = await enter(true), S = room.S;
  let t = 0; const checks = [];
  const adv = (sec, pitch = -3, yaw = 0) => { room.look.pitch = pitch; room.look.yaw = yaw; const end = t + sec; while (t < end - 1e-9) { t += 1 / 30; room.step(t); } };
  const ok = (name, cond, detail = '') => { checks.push([name, !!cond]); console.log(`AUTO ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
  const say = (up = 3, yaw = 0) => { adv(0.8, -21, 0); adv(up, -3, yaw); room.act('next'); };
  const lum = (zone) => { const ps = room.world.people.filter((p) => p.block === zone); return ps.reduce((s, p) => s + p.cur, 0) / ps.length; };
  const hold = () => {
    room.render(); setInterval(() => room.render(), 200); const st = room.stats(); console.log('STATS ' + JSON.stringify(st));
    const c = room.renderer.domElement, gl = room.renderer.getContext(), px = new Uint8Array(4); gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const im = new Image(); im.src = c.toDataURL('image/png'); im.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99'; document.body.appendChild(im);   // headless capture does not pick the canvas up; show the frame as an image
  };

  if (mode === 'keys') {
    // real DOM events through the page's own handlers, not act() calls
    const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const c = room.renderer.domElement, ptr = (type, x, y, pt = 'mouse', id = 1) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: pt, pointerId: id, bubbles: true }));
    const run = (sec) => adv(sec, room.look.pitch, room.look.yaw);   // advance time without touching where the view points
    run(0.5); key('keydown', ' '); key('keyup', ' '); run(0.3);
    ok('Space begins and starts the try-out', S.kind === 'run' && S.run.demo);
    key('keydown', 's'); run(0.5); ok('holding S looks down at the monitor', room.look.pitch === -21 && S.run.head === 'down');
    key('keyup', 's'); run(0.5); ok('letting go of S looks up again', room.look.pitch === -3 && S.run.head === 'up');
    run(2); key('keydown', ' '); key('keyup', ' '); run(0.5); ok('Space goes to the next line', S.run.index === 1);
    key('keydown', 'ArrowDown'); run(0.5); ok('holding Down shows the whole line', S.run.peeking === true);
    key('keyup', 'ArrowDown'); run(0.3); ok('letting go of Down hides it', S.run.peeking === false && room.look.pitch === -3);
    key('keydown', 'ArrowLeft'); key('keyup', 'ArrowLeft'); run(0.3); ok('Left arrow goes back a line', S.run.index === 0);
    key('keydown', 'p'); key('keyup', 'p'); run(0.3); ok('P pauses', S.kind === 'pause');
    key('keydown', 'ArrowRight'); run(0.1); ok('Right arrow moves the focus', S.menu.focus === 1);
    key('keydown', 'ArrowLeft'); run(0.1); key('keydown', 'Enter'); run(0.3); ok('Enter on Keep going resumes', S.kind === 'run');
    ptr('pointerdown', 800, 400); ptr('pointermove', 700, 400); ptr('pointerup', 700, 400); run(0.2);
    ok('dragging turns the head', Math.abs(room.look.yaw) > 5, String(room.look.yaw));
    const at = S.run.index; run(0.6); ptr('pointerdown', 800, 300); ptr('pointerup', 800, 300); run(0.3);
    ok('a click goes to the next line', S.run.index === at + 1);
    ptr('pointerdown', 600, 300, 'touch', 2); ptr('pointerdown', 900, 300, 'touch', 3); run(0.3);
    ok('a second finger pauses', S.kind === 'pause'); ptr('pointerup', 600, 300, 'touch', 2);
    room.look.yaw = 0; room.look.pitch = -21; run(0.3); room.render();
    const r = c.getBoundingClientRect(), v = S.menu.buttons.map((_, i) => i);
    // click the middle of the last button on the monitor: project its centre from the 3D screen to the page
    const THREE = await import('three'); const p3 = new THREE.Vector3((2 - 1) * (0.69 / 3), 0, 0); room.world.screen.localToWorld(p3); p3.project(room.camera);
    const px = r.left + (p3.x + 1) / 2 * r.width, py = r.top + (1 - p3.y) / 2 * r.height;
    ptr('pointerdown', px, py); ptr('pointerup', px, py); run(0.3);
    ok('clicking the Leave button on the monitor leaves', !document.body.classList.contains('in-room'), `buttons ${v.length} at ${Math.round(px)},${Math.round(py)}`);
    const failed = checks.filter((x) => !x[1]).map((x) => x[0]);
    console.log(`AUTO DONE ${checks.length - failed.length}/${checks.length}` + (failed.length ? ' FAILED: ' + failed.join(' | ') : ''));
    return;
  }
  if (mode === 'hands') {          // both hands in front of the eyes, to check how they are drawn: &pose=rest|pinch|hold, &room=mine for the stand-in room
    const THREE = await import('three'), { handJoints } = await import('./capture.js'), q = new URLSearchParams(location.search), pose = q.get('pose') || 'rest', deg = Math.PI / 180;
    if (room.world.mr) { const tex = await new THREE.TextureLoader().loadAsync('./shots/room.jpg'); tex.colorSpace = THREE.SRGBColorSpace; room.world.backdrop(tex, -105); }
    console.log('HANDS mesh ' + await room.world.handsReady);
    room.data.seen.try4 = 1; adv(0.3); room.act('next'); adv(0.3); S.menu.focus = 1; room.act('next'); adv(0.6, +(q.get('pitch') || -16), 0);
    for (const side of ['right', 'left']) {
      const m = side === 'left' ? -1 : 1, lift = pose === 'rest' ? 0.45 : side === 'right' ? (pose === 'pinch' ? 1 : 0.45) : (pose === 'hold' ? 0.5 : 0.45), pin = (side === 'right' && pose === 'pinch') || (side === 'left' && pose === 'hold') ? 1 : 0;
      const wrist = new THREE.Vector3(m * 0.3, 0.76, -0.33).lerp(new THREE.Vector3(m * 0.21, 1.0, -0.45), lift), quat = new THREE.Quaternion().setFromEuler(new THREE.Euler((26 + 16 * lift) * deg, m * 20 * deg, -m * (38 - 10 * lift) * deg, 'YXZ'));
      if (pose === 'tracked') {        // joints with orientations, as a headset gives them: the mesh's own open pose, moved to where the wrist is
        const B = room.world.handBind(side), turn = quat.clone().multiply(B[0].quaternion.clone().invert()), o = B[0].position.clone();
        room.world.hand(side, B.map((b) => ({ position: b.position.sub(o).applyQuaternion(turn).add(wrist), quaternion: turn.clone().multiply(b.quaternion), radius: 0.009 })));
      } else room.world.hand(side, handJoints(side, wrist, quat, pin, 0.42 + 0.12 * pin));
    }
    return hold();
  }
  if (mode === 'minedown') {       // my room: look up at the middle, pass a line, look down, and report every person's state
    const dump = (tag) => console.log('MINE ' + tag + ' ' + room.world.people.map((p) => `x${p.mesh.position.x.toFixed(2)}z${p.mesh.position.z.toFixed(2)}:${p.cur.toFixed(2)}/${(+p.focus).toFixed(2)}`).join(' '));
    room.data.seen.try4 = 1; adv(0.3); room.act('next'); adv(0.3); S.menu.focus = 1; room.act('next'); adv(0.5, -21); adv(3, -3, 2); dump('up'); adv(3, -3, -17); dump('left'); adv(3, -3, 16); dump('right');
    room.act('next'); adv(0.3, -3, 2); adv(2.5, -21, 0); dump('down'); adv(3, -3, 2); room.act('next'); adv(2.5, -21, 0); dump('down2');
    for (let i = 0; i < 6; i++) { adv(0.8, -21, 0); adv(4.5, -3, i % 2 ? 12 : -12); room.act('next'); } adv(2.5, -21, 0); dump('down3'); return;
  }
  adv(0.5);
  ok('opens on the centring message', S.kind === 'centre');
  room.act('next'); adv(0.3);
  ok('first visit starts the four-line try-out', S.kind === 'run' && S.run.demo && S.pass === 0);
  if (mode === 'onboard') { adv(1, -21); return hold(); }
  for (let i = 0; i < 4; i++) say(2.5);
  ok('the try-out comes round again one step thinner', S.kind === 'run' && S.pass === 1 && S.run.levels.join() === '1,1,1,1', S.run && S.run.levels.join());
  for (let i = 0; i < 4; i++) say(2.5);
  ok('the try-out ends at the notes sheet', S.kind === 'curtain');
  adv(0.9, -21); ok('the full house is lit at the end even with the head down', lum(0) > 0.85 && lum(2) > 0.85, `${lum(0).toFixed(2)} ${lum(2).toFixed(2)}`); adv(1.7);
  room.act('next'); adv(0.3);
  ok('"Choose a script" opens the script menu', S.kind === 'menu' && S.menu.buttons.length >= 5, S.menu && S.menu.buttons.map((b) => b.label).join(' | '));
  if (mode === 'menu') { adv(1, -18); return hold(); }
  adv(1.4); ok('menu lights are at half', Math.abs(lum(1) - 0.3) < 0.05, lum(1).toFixed(2));

  S.menu.focus = 1; room.act('next'); adv(0.3);
  const run = () => S.run;
  ok('the pitch has 18 lines', S.kind === 'run' && run().lines.length === 18);
  ok('the clock stands before the first look up', run().elapsed === 0);
  adv(0.8, -21); adv(1.5, -3, -16);
  ok('looking left lights the left block only', lum(0) > 0.35 && lum(1) < 0.2 && lum(2) < 0.2, `${lum(0).toFixed(2)} ${lum(1).toFixed(2)} ${lum(2).toFixed(2)}`);
  ok('one person in that block is the brightest', room.world.people.filter((p) => p.cur > 0.95).length === 1, String(room.world.people.filter((p) => p.cur > 0.95).length));
  if (mode === 'left') { room.look.yaw = -16; return hold(); }
  adv(1.2, -3, 0);
  if (mode === 'run') return hold();
  adv(1.0, -21, 0);
  ok('looking down puts the house out', lum(0) < 0.05 && lum(1) < 0.05 && lum(2) < 0.05, `${lum(0).toFixed(2)} ${lum(1).toFixed(2)} ${lum(2).toFixed(2)}`);
  if (mode === 'down') return hold();
  adv(3, -3); room.act('next'); adv(0.2);
  ok('line 1 looked at twice is kept, not thinned', run().per[0].verdict === 'kept', run().per[0].verdict);
  room.act('next'); ok('a second pinch inside 0.4 s is ignored', run().index === 1);
  say(5, 14); say(5, 14); say(5, 0); say(5, -14);                       // lines 2..5 clean
  ok('lines said to the room light their lamps', [1, 2, 3, 4].every((i) => run().isClean(i)), [1, 2, 3, 4].map((i) => run().per[i].verdict).join());
  adv(0.8, -21); adv(1, -3); room.act('peekStart'); adv(1.2, -3);
  ok('the house is out while a line is pulled out', lum(1) < 0.2, lum(1).toFixed(2));
  if (mode === 'peek') return hold();
  room.act('peekEnd'); adv(4, -3); room.act('next');                    // line 6 pulled out
  ok('a line pulled out with the other hand is marked', run().per[5].verdict === 'looked');
  say(5); room.act('back'); adv(0.6); room.act('next'); adv(0.5);        // back by accident on line 8 -> 7, straight on again
  ok('going back by accident keeps the earlier result', run().per[6].verdict === 'clean' && run().index === 7, run().per[6].verdict + ' at ' + run().index);
  room.act('pause'); adv(0.3);
  ok('pause opens Keep going / Start again / Leave', S.kind === 'pause' && S.menu.buttons.map((b) => b.label).join() === 'Keep going,Start again,Leave');
  if (mode === 'pause') { adv(0.5, -18); return hold(); }
  const e0 = run().elapsed; adv(4, -3); ok('the clock stands while paused', run().elapsed === e0);
  room.act('next'); adv(0.2); ok('Keep going returns to the same line', S.kind === 'run' && run().index === 7);
  for (let i = 7; i < 18; i++) say(5, i % 3 === 0 ? -14 : i % 3 === 1 ? 0 : 14);
  ok('after the last line the monitor asks you to stay with them', S.kind === 'land');
  if (mode === 'land') { adv(0.9, -3, 0); room.look.pitch = -8; return hold(); }
  adv(2.2, -3, 0);
  ok('the run ends at the notes sheet', S.kind === 'curtain' && !!S.result);
  const r = S.result || {};
  ok('zone shares add up to 100', r.zones && r.zones[0] + r.zones[1] + r.zones[2] === 100, String(r.zones));
  ok('the weak lines are the kept line and the pulled-out line', String(r.weak) === '0,5', String(r.weak));
  ok('said to the room counts the rest', r.said === 16 && r.total === 18, `${r.said}/${r.total}`);
  adv(1.6);
  ok('first button is Run weak lines', S.menu.buttons[0].label === 'Run weak lines', S.menu.buttons[0].sub);
  const lit = () => room.world.people.filter((p) => p.cur > 0.9).length;
  ok('after the sheet only the people you turned to stay bright', (adv(1.5), lit() === room.reach.got.size && lit() > 2 && lit() < 21), `${lit()} lit, ${room.reach.got.size} reached`);
  ok('then everyone is lit again', (adv(6), lit() === 21), String(lit()));
  ok('a question is offered after a full run', S.menu.buttons.map((b) => b.label).join() === 'Run weak lines,Done for tonight,A question');
  if (mode === 'curtain') { room.look.yaw = -8; return hold(); }
  const saved = JSON.parse(localStorage.getItem('offbook.v1') || '{}'), ids = room.scripts[1].lines.map((l) => l.id);
  ok('levels are saved on this device', saved.levels && saved.levels[ids[1]] === 1 && saved.levels[ids[0]] === 0 && saved.levels[ids[5]] === 0, JSON.stringify(ids.slice(0, 6).map((id) => saved.levels && saved.levels[id])));
  room.act('next'); adv(0.3);
  ok('the weak-lines run holds only those lines', S.kind === 'run' && String(run().order) === '0,5');
  say(5); ok('the weak-lines run moves to the next weak line', S.run.index === 5);
  say(5); adv(1.6);
  ok('the weak-lines run ends with no target time', S.kind === 'curtain' && S.result.targetSec === null && S.result.opening === null);
  S.menu.focus = S.menu.buttons.findIndex((b) => b.label === 'Done for tonight'); room.act('next'); adv(0.3);
  ok('Done for tonight returns to the script menu', S.kind === 'menu');
  ok('the menu tile carries the record of the run', /night 1, 16 of 18/.test(S.menu.buttons[1].sub), S.menu.buttons[1].sub);
  if (mode === 'question') { S.menu.focus = S.menu.buttons.length - 1; room.act('next'); adv(1.2, -3); return hold(); }
  S.menu.focus = S.menu.buttons.length - 1; room.act('next'); adv(0.5);
  ok('a question starts with Breathe', S.kind === 'qa' && S.q.phase === 'breathe');
  adv(2.2, -8, -15); ok('the answer clock runs after Breathe', S.q.phase === 'answer'); adv(4, -3, 0); room.act('next'); adv(0.2);
  ok('the answer is summed up on the monitor', !!S.qResult && S.menu.buttons[0].label === 'Another question', S.menu.buttons[0].sub);
  S.menu.focus = 1; room.act('next'); adv(0.3);
  room.render(); const st = room.stats();
  ok('draw calls within budget', st.calls <= 78, JSON.stringify(st));
  room.act('pause'); adv(0.2); S.menu.focus = S.menu.buttons.length - 1; room.act('next');
  ok('Leave returns to the page', !document.body.classList.contains('in-room'));
  const failed = checks.filter((c) => !c[1]).map((c) => c[0]);
  console.log(`AUTO DONE ${checks.length - failed.length}/${checks.length}` + (failed.length ? ' FAILED: ' + failed.join(' | ') : ''));
}
