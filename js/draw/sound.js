// Off Book: four synthesized sounds. Web Audio only, no files.
// Each function takes a running AudioContext and returns nothing.
//
//   click(ac)     advancing a line: a dry, low, wooden tap, 56 ms
//   chime(ac)     a lamp lights: one soft struck bar, about 400 ms
//   tick(ac)      optional, once a second in the last 30 seconds: 20 ms
//   applause(ac)  about twenty people in a small hall, 2.5 s, identical every time
//
// Tuning: every number a developer is likely to touch is in the four recipe objects below.
// Levels are linear gain at the output (1 = full scale).

const CLICK = {
  level: 0.5,
  body: { from: 190, to: 115, glide: 0.04, decay: 0.05 },   // sine thump that drops in pitch: the "low" and the "wood"
  knock: { freq: 470, level: 0.3, decay: 0.018 },           // a short inharmonic partial: the block's hollow note
  contact: { freq: 1100, q: 1.2, level: 0.35, decay: 0.007 }, // band-passed noise: the moment of contact. Raise freq for a harder tap
  length: 0.056,                                            // everything is silent after this
};

const CHIME = {
  level: 0.16,
  freq: 783.99,          // G5. Lower for a rounder note, never above about 1.2 kHz or it starts to nag
  attack: 0.006,         // a soft mallet. 0.001 turns it into glass
  // struck-bar partials: ratio to the fundamental, level, decay in seconds
  partials: [
    { ratio: 1, level: 1, decay: 0.4 },
    { ratio: 2.76, level: 0.22, decay: 0.16 },
    { ratio: 5.4, level: 0.06, decay: 0.07 },
  ],
};

const TICK = {
  level: 0.1,
  contact: { freq: 2600, q: 6, decay: 0.012 },   // narrow noise: the tick
  body: { freq: 1900, level: 0.3, decay: 0.01 }, // a trace of pitch so it reads as a mechanism, not a glitch
};

const APPLAUSE = {
  seconds: 2.5,
  seed: 20261118,        // change the seed for a different room of people; loudness stays the same
  people: 20,
  rate: [3.1, 4.7],      // claps per second, per person
  jitter: 0.12,          // each interval varies by this fraction
  resonance: [850, 2350], // Hz. Cupped hands sit low, flat hands high
  q: [1.6, 3.2],
  ring: [0.004, 0.009],  // decay time constant of one clap, seconds
  joinWithin: 0.32,      // people start clapping over this long
  thinOver: 0.55,        // and stop over this long before the fade
  width: 0.8,            // stereo spread, 0 = mono
  warmth: 4200,          // one-pole low-pass in Hz. Lower is warmer and further away
  reflections: [         // a small hall: a few early reflections, no reverb tail
    { delay: 0.013, level: 0.32 },
    { delay: 0.021, level: 0.24 },
    { delay: 0.034, level: 0.17 },
    { delay: 0.047, level: 0.11 },
  ],
  fadeOut: 0.45,
  rms: 0.11,             // loudness target for the finished buffer. This is the "always the same size" knob
  level: 1,
};

// ---------------------------------------------------------------------------------------

const store = new WeakMap(); // per-context cache of generated buffers

function cache(ac) {
  let c = store.get(ac);
  if (!c) { c = {}; store.set(ac, c); }
  return c;
}

function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wake(ac) {
  if (ac.state === 'suspended' && typeof ac.resume === 'function') {
    const p = ac.resume();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }
}

function noise(ac) {
  const c = cache(ac);
  if (!c.noise) {
    const n = Math.ceil(ac.sampleRate * 0.25);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(7);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    c.noise = buf;
  }
  return c.noise;
}

// percussive envelope: straight up, exponential down
function strike(param, t, peak, attack, decay) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function output(ac, level) {
  const out = ac.createGain();
  out.gain.value = level;
  out.connect(ac.destination);
  return out;
}

function tone(ac, out, type, freq, t, peak, attack, decay, stopAt) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  strike(g.gain, t, peak, attack, decay);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(stopAt);
  return osc;
}

function burst(ac, out, freq, q, t, peak, decay, stopAt) {
  const src = ac.createBufferSource();
  const bp = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = noise(ac);
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  strike(g.gain, t, peak, 0.0005, decay);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(stopAt);
  return src;
}

// A dry, low, wooden tap. Three layers: a sine that drops from 190 to 115 Hz in 40 ms (the body),
// a 470 Hz triangle that dies in 18 ms (the hollow of the wood) and 7 ms of noise around 1.1 kHz
// (the contact). No tail: silent by 56 ms.
export function click(ac) {
  wake(ac);
  const t = ac.currentTime + 0.005;
  const end = t + CLICK.length;
  const out = output(ac, CLICK.level);
  const body = tone(ac, out, 'sine', CLICK.body.from, t, 1, 0.001, CLICK.body.decay, end);
  body.frequency.exponentialRampToValueAtTime(CLICK.body.to, t + CLICK.body.glide);
  tone(ac, out, 'triangle', CLICK.knock.freq, t, CLICK.knock.level, 0.001, CLICK.knock.decay, end);
  burst(ac, out, CLICK.contact.freq, CLICK.contact.q, t, CLICK.contact.level, CLICK.contact.decay, end);
  body.onended = () => out.disconnect();
}

// One soft struck bar. Three sine partials at the ratios of a metal bar (1, 2.76, 5.4); the upper
// two die quickly so what is left is a plain G5 for 400 ms. No reverb, nothing after 450 ms.
export function chime(ac) {
  wake(ac);
  const t = ac.currentTime + 0.005;
  const out = output(ac, CHIME.level);
  let longest = null;
  for (const p of CHIME.partials) {
    const osc = tone(ac, out, 'sine', CHIME.freq * p.ratio, t, p.level, CHIME.attack, p.decay, t + CHIME.attack + p.decay + 0.03);
    if (!longest) longest = osc; // the fundamental is listed first and lasts longest
  }
  if (longest) longest.onended = () => out.disconnect();
}

// A quiet tick: 12 ms of narrow noise at 2.6 kHz with a trace of a 1.9 kHz sine under it.
export function tick(ac) {
  wake(ac);
  const t = ac.currentTime + 0.005;
  const end = t + 0.02;
  const out = output(ac, TICK.level);
  const src = burst(ac, out, TICK.contact.freq, TICK.contact.q, t, 1, TICK.contact.decay, end);
  tone(ac, out, 'sine', TICK.body.freq, t, TICK.body.level, 0.0005, TICK.body.decay, end);
  src.onended = () => out.disconnect();
}

// Applause is rendered once per context into a stereo buffer and then just played, so it costs one
// node at run time and is sample-for-sample the same every time.
//
// Recipe: twenty people. Each has a clapping rate (3.1 to 4.7 a second, with 12% jitter so nobody
// keeps time), a hand resonance (a band-pass between 850 and 2350 Hz), a place in the stereo field,
// a moment they join and a moment they stop. One clap is a few milliseconds of decaying noise through
// that person's band-pass. The sum goes through a 4.2 kHz low-pass (warmth), four early reflections
// (the small hall) and a 450 ms fade, and is then scaled to a fixed RMS.
function buildApplause(ac) {
  const A = APPLAUSE;
  const sr = ac.sampleRate;
  const n = Math.ceil(sr * A.seconds);
  const buf = ac.createBuffer(2, n, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const r = rng(A.seed);
  const span = (pair) => pair[0] + r() * (pair[1] - pair[0]);
  const clapLen = Math.floor(sr * 0.03);

  for (let p = 0; p < A.people; p++) {
    const rate = span(A.rate);
    const f = span(A.resonance);
    const q = span(A.q);
    const tau = span(A.ring) * sr;
    const loud = 0.55 + r() * 0.45;
    const angle = ((r() * 2 - 1) * A.width + 1) * Math.PI / 4;
    const gl = Math.cos(angle);
    const gr = Math.sin(angle);
    const leave = A.seconds - 0.15 - r() * A.thinOver;

    // band-pass biquad (constant 0 dB peak), coefficients normalised by a0
    const w0 = (2 * Math.PI * f) / sr;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;

    let t = r() * A.joinWithin;
    while (t < leave) {
      const i0 = Math.floor(t * sr);
      const hit = loud * (0.8 + r() * 0.4);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < clapLen && i0 + i < n; i++) {
        const x = (r() * 2 - 1) * Math.exp(-i / tau);
        const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        L[i0 + i] += y * hit * gl;
        R[i0 + i] += y * hit * gr;
      }
      t += (1 / rate) * (1 - A.jitter + r() * A.jitter * 2);
    }
  }

  // early reflections, crossed between the channels so the room has some width
  const dryL = new Float32Array(L);
  const dryR = new Float32Array(R);
  A.reflections.forEach((ref, k) => {
    const d = Math.floor(ref.delay * sr);
    const fromL = k % 2 === 0 ? dryR : dryL;
    const fromR = k % 2 === 0 ? dryL : dryR;
    for (let i = d; i < n; i++) {
      L[i] += fromL[i - d] * ref.level;
      R[i] += fromR[i - d] * ref.level;
    }
  });

  // warmth, fade, and a fixed loudness
  const c = 1 - Math.exp((-2 * Math.PI * A.warmth) / sr);
  const fadeFrom = n - Math.floor(A.fadeOut * sr);
  let lpL = 0, lpR = 0, sum = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    lpL += c * (L[i] - lpL);
    lpR += c * (R[i] - lpR);
    let g = 1;
    if (i > fadeFrom) {
      const k = (n - i) / (n - fadeFrom);
      g = k * k;
    }
    L[i] = lpL * g;
    R[i] = lpR * g;
    sum += L[i] * L[i] + R[i] * R[i];
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  let scale = A.rms / rms;
  if (peak * scale > 0.9) scale = 0.9 / peak;
  for (let i = 0; i < n; i++) { L[i] *= scale; R[i] *= scale; }
  return buf;
}

export function applause(ac) {
  wake(ac);
  const c = cache(ac);
  if (!c.applause) c.applause = buildApplause(ac);
  const out = output(ac, APPLAUSE.level);
  const src = ac.createBufferSource();
  src.buffer = c.applause;
  src.connect(out);
  src.onended = () => out.disconnect();
  src.start(ac.currentTime + 0.01);
}
