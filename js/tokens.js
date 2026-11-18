// Off Book design tokens. Single source of truth for every canvas-drawn surface and the 3D scene.
export const color = {
  // one warm-tinted neutral ramp (room, surfaces, text)
  n0: '#0a0908',   // room black
  n1: '#12100e',   // screen background, darkest surface
  n2: '#1b1815',   // raised surface (housing, table edge)
  n3: '#27231f',   // surface step
  n4: '#3a342e',   // hairline, ruled blank for dropped words
  n5: '#5e554b',   // disabled, unlit lamp
  n6: '#8c8275',   // muted text (only above 0.8 degrees)
  n7: '#bdb1a0',   // secondary text
  n8: '#ece3d4',   // primary text ("chalk")
  paper: '#cdbfa8', // notes sheet under low light (never pure white)
  ink: '#1a1612',  // text on paper
  // one accent: tungsten. Lit status lamps, focus bracket, the pencil underline on key words.
  accent: '#f0b45a',
  accentDim: '#7a5a2c',
  // semantic, clock only
  clock: '#ff4a36',
  clockGhost: '#1f0d0b',
};
export const font = {
  ui: "'Atkinson Hyperlegible Next', system-ui, sans-serif",
  mono: "'Atkinson Hyperlegible Mono', ui-monospace, monospace",
  weights: { regular: 400, medium: 500, semibold: 600 },
};
export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96];
export const radius = { control: 8, card: 12, panel: 16 };
export const motion = { ease: 'cubic-bezier(0.2, 0, 0, 1)', fast: 120, base: 240, slow: 600, lightUp: 600, lightDown: 1200 };
// physical layout, metres and degrees. Seated eye point is the origin of angles, 1.20 m above the floor.
export const layout = {
  eyeHeight: 1.20,
  tableHeight: 0.74,
  monitor: { distance: 1.00, centreBelowEye: 21, width: 0.69, height: 0.20, tilt: 21 },   // 38 x 11 degrees. Prompt rows sit 20 degrees below eye line so reading them takes a head movement, which is what Eyes Up measures
  audience: { firstRow: 3.4, rowDepth: 0.9, riser: 0.22, blockYaw: [-19.5, 0, 19.5], perBlock: [2, 3, 2], paintedDistance: 6.0, paintedSize: 2.25 },
  clock: { distance: 7.5, aboveEye: 11, width: 1.9 },   // about 14 degrees wide, between the heads and the pendant lamp
  notes: { distance: 1.9, centreBelowEye: 1.9, width: 1.0, yaw: -15.2 },   // 30 x 20.4 degrees (2048 x 1400 canvas): from the monitor's top rail (-12.2) to just under the clock (8.7)
  frame: { horizontal: 60, vertical: 50 },
};
export const levels = ['Read', 'Key words', 'First word', 'Blank'];
