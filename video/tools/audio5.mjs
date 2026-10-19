// 20 s at 120 BPM: pad, a 16th tick, a sub pulse, keystrokes as the rhythm section, one hole at
// the hinge (11.5 s), a warmer re-entry, and a decay under the wordmark. No sting.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUR5, TYPE_AT } from '../src/timeline5.js';

const SR = 48000;
const N = Math.ceil(DUR5 * SR);
const TAU = Math.PI * 2;
const OUT = path.resolve(fileURLToPath(new URL('../out/score5.wav', import.meta.url)));
const BEAT = 0.5; // 120 BPM
const BAR = 2.0;

const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const out = bus();
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const cl = (v, a, b) => Math.min(b, Math.max(a, v));

let seed = 31337;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rnd() * 2 - 1;

const add = (t, v, pan = 0) => {
  const i = Math.round(t * SR);
  if (i < 0 || i >= N) return;
  const l = Math.cos(((pan + 1) / 2) * Math.PI * 0.5);
  const r = Math.sin(((pan + 1) / 2) * Math.PI * 0.5);
  out.L[i] += v * l;
  out.R[i] += v * r;
};

// the hole: nothing between 11.45 and 12.0 except one dry tick
const inHole = (t) => t > 11.45 && t < 12.0;

// pad: two detuned saws per chord, lowpassed by hand
const CHORDS = [
  { at: 0.0, root: 45, notes: [45, 52, 57, 60] },
  { at: 4.0, root: 43, notes: [43, 50, 55, 59] },
  { at: 8.0, root: 41, notes: [41, 48, 53, 57] },
  { at: 12.0, root: 48, notes: [48, 52, 55, 60] },
  { at: 16.5, root: 45, notes: [45, 52, 57, 64] },
];
for (let i = 0; i < CHORDS.length; i++) {
  const c = CHORDS[i];
  const end = i + 1 < CHORDS.length ? CHORDS[i + 1].at : DUR5;
  for (const m of c.notes) {
    for (const det of [-0.06, 0.06]) {
      const f = midi(m) * (1 + det);
      let ph = 0;
      let lp = 0;
      for (let k = Math.round(c.at * SR); k < Math.round(end * SR) && k < N; k++) {
        const t = k / SR;
        ph = (ph + f / SR) % 1;
        const a = 1 - Math.exp((-TAU * 900) / SR);
        lp += (ph * 2 - 1 - lp) * a;
        const fade = Math.min(1, (t - c.at) / 0.4) * Math.min(1, (end - t) / 0.3);
        const amp = 0.07 * fade * (t < 12 ? 1 : 0.8);
        const v = lp * amp;
        const pan = det < 0 ? -0.4 : 0.4;
        const l = Math.cos(((pan + 1) / 2) * Math.PI * 0.5);
        const r = Math.sin(((pan + 1) / 2) * Math.PI * 0.5);
        out.L[k] += v * l;
        out.R[k] += v * r;
      }
    }
  }
}

// a 16th tick: the thing that makes the wall feel alive
for (let t = 0; t < 12.0; t += BEAT / 4) {
  if (inHole(t)) continue;
  const amp = t < 4 ? 0.03 : t < 8 ? 0.035 : 0.045;
  for (let i = 0; i < 0.01 * SR; i++) {
    const x = i / SR;
    add(t + x, noise() * Math.exp(-x * 700) * amp, 0.3);
  }
}

// sub pulse from bar 3
for (let t = 4.0; t < 12.0; t += BEAT) {
  if (inHole(t)) continue;
  for (let i = 0; i < 0.22 * SR; i++) {
    const x = i / SR;
    add(t + x, Math.sin(TAU * 48 * x) * Math.exp(-x * 9) * 0.22);
  }
}

// kick on 2 and 4 through the build, then out
for (let t = 4.0; t < 11.4; t += BEAT) {
  if (inHole(t)) continue;
  for (let i = 0; i < 0.16 * SR; i++) {
    const x = i / SR;
    add(t + x, Math.sin(TAU * (110 * Math.exp(-x * 30) + 44) * x) * Math.exp(-x * 12) * 0.3);
  }
}

// keystrokes: the terminal is the rhythm section
TYPE_AT.forEach((fr, i) => {
  const t = fr / 30;
  for (let k = 0; k < 0.03 * SR; k++) {
    const x = k / SR;
    add(t + x, noise() * Math.exp(-x * 220) * 0.16, i % 2 ? 0.15 : -0.15);
  }
});
// line arrivals in the output
for (let i = 0; i < 5; i++) {
  const t = 6.53 + i * 0.27;
  for (let k = 0; k < 0.02 * SR; k++) {
    const x = k / SR;
    add(t + x, noise() * Math.exp(-x * 300) * 0.09, i % 2 ? 0.2 : -0.2);
  }
}

// the one dry tick in the hole, on the snap
for (let i = 0; i < 0.05 * SR; i++) {
  const x = i / SR;
  add(11.5 + x, noise() * Math.exp(-x * 160) * 0.2, 0);
}

// re-entry: a warm low note and a chord swell
for (let i = 0; i < 1.6 * SR; i++) {
  const x = i / SR;
  add(12.0 + x, Math.sin(TAU * midi(36) * x) * Math.exp(-x * 1.2) * 0.2);
}

// bar 9 chord change accent
for (let i = 0; i < 0.9 * SR; i++) {
  const x = i / SR;
  add(16.5 + x, Math.sin(TAU * midi(57) * x) * Math.exp(-x * 3) * 0.1);
  add(16.5 + x, Math.sin(TAU * midi(64) * x) * Math.exp(-x * 3.4) * 0.07);
}

// decay under the wordmark, no sting
for (let i = 0; i < 1.5 * SR; i++) {
  const x = i / SR;
  add(18.5 + x, Math.sin(TAU * midi(45) * x) * Math.exp(-x * 2.2) * 0.12);
}

// gentle limiter + write 24-bit WAV
const data = Buffer.alloc(N * 2 * 3);
for (let i = 0; i < N; i++) {
  for (let ch = 0; ch < 2; ch++) {
    const v = Math.tanh((ch === 0 ? out.L[i] : out.R[i]) * 1.1) * 0.9;
    data.writeIntLE(Math.round(cl(v, -1, 1) * 8388607), (i * 2 + ch) * 3, 3);
  }
}
const h = Buffer.alloc(44);
h.write('RIFF', 0);
h.writeUInt32LE(36 + data.length, 4);
h.write('WAVE', 8);
h.write('fmt ', 12);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 6, 28);
h.writeUInt16LE(6, 32);
h.writeUInt16LE(24, 34);
h.write('data', 36);
h.writeUInt32LE(data.length, 40);
fs.writeFileSync(OUT, Buffer.concat([h, data]));
console.log(`score5.wav ${DUR5}s @ 120 BPM — hole at 11.5, decay from 18.5`);
