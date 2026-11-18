// Off Book: the entry page. Script in, link out, settings, and the door into the room.
import { CFG, SAMPLES, hash, packState, serialise, splitScript, spokenSeconds, tune, unpackState } from './logic.js';

const $ = (id) => document.getElementById(id);
const KEY = 'offbook.v1';
const params = new URLSearchParams(location.search);
tune(params);

// ---------- what is kept on this device ----------
const blank = () => ({ settings: { hand: 'right', textSize: 'large', room: 'full', mode: 'skeleton', fade: '1', sound: '1' }, own: { title: 'My script', text: '', target: 180 }, levels: {}, clean: {}, seen: {} });
function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); const b = blank(); return d ? { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) }, own: { ...b.own, ...(d.own || {}) } } : b; } catch { return blank(); } }
let data = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private window: the page still works for this visit */ } };
const store = { get: () => data, set: (d) => { data = d; save(); } };

// ---------- the script ----------
let parsed = { lines: [], questions: [], dropped: 0 };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// data.own.text is the serialised form: one line per row, a * in front of each key word
function parse() { parsed = splitScript(data.own.text); }
const plainText = () => parsed.lines.map((l) => l.text).concat(parsed.questions.map((q) => 'Q: ' + q)).join('\n');

function renderLines() {
  const n = parsed.lines.length;
  $('lines').innerHTML = parsed.lines.map((l, i) => `<li class="${i < 2 || i === n - 1 ? 'anchor' : ''}"><span class="sq"></span><span class="n">${i + 1}</span><span>` +
    l.words.map((w, k) => `<button type="button" class="w${w.key ? ' k' : ''}" data-l="${i}" data-w="${k}" aria-pressed="${w.key}">${esc(w.t)}</button>`).join(' ') + '</span></li>').join('');
  $('count').textContent = n ? `${n} line${n === 1 ? '' : 's'}, about ${mmss(spokenSeconds(parsed.lines))} spoken` : 'No script yet: the room has samples';
  const warn = $('warn'); warn.hidden = !parsed.dropped;
  if (parsed.dropped) warn.textContent = `The last ${parsed.dropped} line${parsed.dropped === 1 ? ' was' : 's were'} left out, including your closing line. The room holds ${CFG.maxLines} lines.`;
  renderLevels(); renderLink();
}
function renderLevels() {
  const lines = parsed.lines.length ? parsed.lines : splitScript(SAMPLES.pitch.text).lines;
  const i = Math.min(lines.length - 1, lines.length > 3 ? 2 : 0), words = lines[i].words, n = lines.length;
  $('lamps').innerHTML = lines.slice(0, 12).map((_, k) => `<li class="${k < 2 || k === n - 1 ? 'anchor ' : ''}${k < i ? 'lit ' : ''}${k === i ? 'now ' : ''}${k > 0 && k % 5 === 0 ? 'gap' : ''}"></li>`).join('');
  $('railcount').textContent = `${i + 1} of ${n}`;
  const blankOf = (w) => `<span class="b">${esc(w.t)}</span>`;
  const row = (name, html) => `<div><dt>${name}</dt><dd>${html}</dd></div>`;
  $('rows').innerHTML = row('Read', words.map((w) => esc(w.t)).join(' ')) +
    row('Key words', words.map((w) => (w.key ? `<span class="k">${esc(w.t)}</span>` : blankOf(w))).join(' ')) +
    row('First word', `<span class="k">${esc(words[0].t)}</span><span class="long"></span>`) +
    row('Blank', '<span class="none">No words.</span>');
}

// ---------- the link ----------
let link = '';
async function renderLink() {
  const state = { v: 1, t: data.own.title, g: data.own.target, x: serialise(parsed.lines) + (parsed.questions.length ? '\n' + parsed.questions.map((q) => 'Q: ' + q).join('\n') : ''), s: data.settings };
  const base = location.origin + location.pathname + (location.search || '');
  link = parsed.lines.length ? `${base}#s=${await packState(state)}` : base;
  $('send').href = 'https://www.oculus.com/open_url/?url=' + encodeURIComponent(link);      // # travels as %23
  if (link.length > CFG.linkBudget) $('status').textContent = `This link is ${link.length} characters long. If the headset does not open it, copy the link, message it to yourself and open it in the headset browser.`;
  else if ($('status').dataset.kind !== 'note') $('status').textContent = '';
}
const say = (text, stay = false) => { const s = $('status'); s.dataset.kind = 'note'; s.textContent = text; if (!stay) setTimeout(() => { if (s.textContent === text) { s.textContent = ''; s.dataset.kind = ''; } }, 8000); };

// ---------- settings ----------
function renderSettings() {
  document.querySelectorAll('.seg[data-key]').forEach((seg) => { const v = String(data.settings[seg.dataset.key]); seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); });
  $('target').textContent = mmss(data.own.target);
}
document.querySelectorAll('.seg[data-key]').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; data.settings[seg.dataset.key] = b.dataset.v; save(); renderSettings(); renderLink();
}));
$('less').addEventListener('click', () => { data.own.target = Math.max(30, data.own.target - 30); save(); renderSettings(); renderLink(); });
$('more').addEventListener('click', () => { data.own.target = Math.min(240, data.own.target + 30); save(); renderSettings(); renderLink(); });

// ---------- editing ----------
let typing = null;
$('text').addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    // keep the key words the writer chose on lines whose words have not changed
    const chosen = new Map(parsed.lines.map((l) => [l.id, l.words.map((w) => w.key)]));
    const fresh = splitScript($('text').value);
    for (const l of fresh.lines) { const keep = chosen.get(l.id); if (keep && keep.length === l.words.length) l.words.forEach((w, k) => { w.key = keep[k]; }); }
    parsed = fresh; data.own.text = serialise(parsed.lines) + (parsed.questions.length ? '\n' + parsed.questions.map((q) => 'Q: ' + q).join('\n') : ''); save(); renderLines();
  }, 250);
});
$('lines').addEventListener('click', (e) => {
  const b = e.target.closest('.w'); if (!b) return;
  const w = parsed.lines[+b.dataset.l].words[+b.dataset.w]; w.key = !w.key;
  if (!parsed.lines[+b.dataset.l].words.some((x) => x.key)) w.key = true;          // a line keeps at least one
  data.own.text = serialise(parsed.lines) + (parsed.questions.length ? '\n' + parsed.questions.map((q) => 'Q: ' + q).join('\n') : ''); save(); renderLines();
});
$('name').addEventListener('input', () => { data.own.title = $('name').value.trim() || 'My script'; save(); renderLink(); });
$('clear').addEventListener('click', () => { data.own.text = ''; $('text').value = ''; parse(); save(); renderLines(); $('text').focus(); });
$('reset').addEventListener('click', () => { for (const l of parsed.lines) { delete data.levels[l.id]; delete data.clean[l.id]; } save(); say('Every line of this script is back at Read.'); });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(link); say('Link copied. Message it to yourself and open it in the headset browser.'); }
  catch { say('Could not copy. Select the address bar after pressing Send to headset, or paste your script in the headset browser.'); }
});
// ---------- cue cards for the day ----------
function showCards() {
  const lines = parsed.lines.length ? parsed.lines : splitScript(SAMPLES.pitch.text).lines, n = lines.length;
  $('cardstitle').textContent = (parsed.lines.length ? data.own.title : SAMPLES.pitch.title) + ': cue cards';
  $('cardlist').innerHTML = lines.map((l, i) => {
    const full = i === 0 || i === n - 1, todo = parsed.lines.length && data.clean[l.id] !== 1 && Object.keys(data.clean).length > 0;
    // key words that stand next to each other in the line stay together ("six years", "thirty-one percent")
    const groups = []; l.words.forEach((w, k) => { if (!w.key) return; const t = w.t.replace(/[.,;:!?]+$/, ''); if (groups.length && groups[groups.length - 1].end === k - 1) { groups[groups.length - 1].t += ' ' + t; groups[groups.length - 1].end = k; } else groups.push({ t, end: k }); });
    const body = full ? esc(l.text) : groups.map((g) => `<span class="k">${esc(g.t)}</span>`).join('<span class="sep">\u00b7</span>');
    return `<li class="${todo ? 'todo' : ''}" data-full="${esc(l.text)}"><span>${body}</span>${full ? '' : `<small>${todo ? 'not yet said to the room. ' : ''}tap for the whole line</small>`}</li>`;
  }).join('');
  $('cards').hidden = false; window.scrollTo(0, 0);
}
$('cardsbtn').addEventListener('click', showCards);
$('cardlist').addEventListener('click', (e) => { const li = e.target.closest('li'); if (!li || li.dataset.open) return; li.dataset.open = '1'; li.querySelector('span').textContent = li.dataset.full; const sm = li.querySelector('small'); if (sm) sm.remove(); });
$('cardsclose').addEventListener('click', () => { $('cards').hidden = true; });
$('ownbtn').addEventListener('click', () => { document.body.classList.add('own'); $('text').focus(); });
$('send').addEventListener('click', (e) => { if (!parsed.lines.length) { e.preventDefault(); say('Paste a script first. Without one the room starts with samples.'); } });

// ---------- the room ----------
let xrOK = false, arOK = false, room = null, session = null;
if (navigator.xr && navigator.xr.isSessionSupported) navigator.xr.isSessionSupported('immersive-ar').then((ok) => { arOK = ok; }).catch(() => {});
// On a headset the page is a door, not a form: one button, with the script box a tap away.
if (navigator.xr && navigator.xr.isSessionSupported) navigator.xr.isSessionSupported('immersive-vr').then((ok) => { xrOK = ok; if (ok && params.get('preview') !== '1') document.body.classList.add('xr'); }).catch(() => {});
// Fetch the room's code and pictures now, so the headset is not left looking at nothing after the button is pressed.
const mainReady = import('./main.js'); mainReady.catch(() => {});
for (const u of ['./textures/people.png', './textures/hand_up.png', './textures/panel.png', './textures/people.json', './textures/panel.json', './textures/people_room.png', './textures/people_room.json', './models/hand_left.glb', './models/hand_right.glb']) fetch(u).catch(() => {});
let linkFailed = false;
async function enter(auto = false, extra = {}) {
  const settings = { free: data.settings.hand === 'left' ? 'left' : 'right', oneHand: data.settings.hand === 'one', textSize: data.settings.textSize, room: data.settings.room, mode: data.settings.mode, fade: data.settings.fade !== '0', sound: data.settings.sound !== '0' && !auto };
  if (params.get('fade') === '0') settings.fade = false;
  if (['panel', 'full', 'mine'].includes(params.get('room'))) settings.room = params.get('room');
  // the session must be asked for inside the click, before anything is awaited
  if (settings.room === 'mine' && xrOK && !arOK) settings.room = 'full';        // no passthrough on this device: the hall instead
  if (extra.session) session = extra.session;
  else if (xrOK && !auto && params.get('preview') !== '1') { try { session = await navigator.xr.requestSession(settings.room === 'mine' ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['hand-tracking', 'local-floor'] }); } catch { session = null; } }
  document.body.classList.add('in-room');
  $('keytext').textContent = session ? '' : matchMedia('(pointer: coarse)').matches ? 'Preview: tap to go on, drag to look, press and hold to see the line, two fingers to pause.' : 'Preview without a headset: Space goes on, hold S to read, drag to look around, Left goes back, hold Down to see the line, P pauses.';
  const { enterRoom } = await mainReady;
  room = await enterRoom({ canvas: $('stage'), settings, own: parsed.lines.length ? { title: data.own.title, text: data.own.text, target: data.own.target } : null, linkFailed, store, auto, ...extra, xr: session || false,
    onLeave: () => { document.body.classList.remove('in-room'); const s = session; session = null; room = null; if (s) s.end().catch(() => {}); data = load(); } });
  return room;
}
$('enter').addEventListener('click', () => enter().catch((err) => { document.body.classList.remove('in-room'); say('The room could not start: ' + (err && err.message ? err.message : err)); console.error(err); }));
$('leave').addEventListener('click', () => { if (room) room.S && room.stop(); document.body.classList.remove('in-room'); if (session) session.end().catch(() => {}); session = null; room = null; data = load(); });

// ---------- start ----------
(async () => {
  if (params.get('auto') || params.get('capture') || params.get('emu')) { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } data = blank(); }   // a test run starts as a first visit
  const m = location.hash.match(/[#&]s=([^&]+)/);
  if (m) {
    const st = await unpackState(m[1]);
    if (st && typeof st.x === 'string') { data.own = { title: st.t || 'My script', text: st.x, target: st.g || 180 }; if (st.s) data.settings = { ...data.settings, ...st.s }; save(); say('Your script arrived.', true); }
    else { linkFailed = true; say('Your script didn’t arrive: the link was cut short. Send it again, or paste the script here.', true); }
    history.replaceState(null, '', location.pathname + location.search);
  }
  parse(); $('text').value = plainText(); $('name').value = data.own.title; renderSettings(); renderLines();
  if (params.get('cards') === '1') showCards();
  if (params.get('emu')) { const { runCapture } = await import('./capture.js'); runCapture(enter, params, true).catch((e) => console.error('CAPTURE ERROR ' + (e && e.stack || e))); return; }
  if (params.get('capture')) { const { runCapture } = await import('./capture.js'); runCapture(enter, params).catch((e) => console.error('CAPTURE ERROR ' + (e && e.stack || e))); return; }
  if (params.get('auto')) { const { runAuto } = await import('./auto.js'); runAuto(enter, params.get('auto')).catch((e) => console.error('AUTO ERROR ' + (e && e.stack || e))); }
})();
window.__offbook = { hash, get data() { return data; }, get room() { return room; } };
