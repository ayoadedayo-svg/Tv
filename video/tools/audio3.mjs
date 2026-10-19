// Today's score: 18.6 s at 126 BPM. Kick and hats drive it, a saw bass moves under the cuts,
// every cut gets a stab, one riser into the lockup, and the music stops dead for the last mark.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUR3, BPM3, CUTS3 } from '../src/timeline3.js';

const SR = 48000;
const N = Math.ceil(DUR3 * SR);
const TAU = Math.PI * 2;
const OUT = path.resolve(fileURLToPath(new URL('../out/score3.wav', import.meta.url)));
const BEAT = 60 / BPM3;

const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const drums = bus();
const harm = bus();
const sfx = bus();
const send = bus();

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const idx = (t) => Math.round(t * SR);

let seed = 90210;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rnd() * 2 - 1;

const put = (b, t, v, pan = 0) => {
  const i = idx(t);
  if (i < 0 || i >= N) return;
  const l = Math.cos(((pan + 1) / 2) * Math.PI * 0.5);
  const r = Math.sin(((pan + 1) / 2) * Math.PI * 0.5);
  b.L[i] += v * l;
  b.R[i] += v * r;
};
const putSend = (t, v) => put(send, t, v);

function kick(t, gain = 1) {
  const len = 0.42;
  let ph = 0;
  for (let i = 0; i < len * SR; i++) {
    const x = i / SR;
    const f = 128 * Math.exp(-x * 26) + 46;
    ph += (TAU * f) / SR;
    const env = Math.exp(-x * 7.5);
    const v = Math.sin(ph) * env * 0.9 + (x < 0.004 ? noise() * 0.25 : 0);
    put(drums, t + x, v * gain);
    if (x < 0.03) putSend(t + x, v * 0.25);
  }
  // the sub that makes it felt rather than heard
  for (let i = 0; i < 0.16 * SR; i++) {
    const x = i / SR;
    put(drums, t + x, Math.sin(TAU * 42 * x) * Math.exp(-x * 12) * 0.45 * gain);
  }
}

function hat(t, gain = 0.22, open = false) {
  const len = open ? 0.16 : 0.045;
  let prev = 0;
  for (let i = 0; i < len * SR; i++) {
    const x = i / SR;
    const n = noise();
    const hp = n - prev * 0.92;
    prev = n;
    put(drums, t + x, hp * Math.exp(-x * (open ? 22 : 90)) * gain, 0.25);
  }
}

function saw(freq, t, dur, gain, cutoff = 1400) {
  let ph = 0;
  let lp = 0;
  const a = 1 - Math.exp((-TAU * cutoff) / SR);
  for (let i = 0; i < dur * SR; i++) {
    ph = (ph + freq / SR) % 1;
    const raw = ph * 2 - 1;
    lp += (raw - lp) * a;
    const x = i / SR;
    const env = Math.min(1, x / 0.01) * Math.exp(-x * 1.6);
    put(harm, t + x, lp * env * gain, -0.05);
  }
}

function stab(t, notes, gain = 0.22) {
  for (const m of notes) {
    const f = midi(m);
    for (const det of [-0.08, 0.08]) {
      let ph = 0;
      for (let i = 0; i < 0.5 * SR; i++) {
        const x = i / SR;
        ph = (ph + (f * (1 + det)) / SR) % 1;
        const env = Math.exp(-x * 5.2) * Math.min(1, x / 0.004);
        put(harm, t + x, (ph * 2 - 1) * env * gain * 0.5, det < 0 ? -0.35 : 0.35);
      }
    }
  }
  // air on the stab so it reads as a hit, not a chord
  for (let i = 0; i < 0.09 * SR; i++) {
    const x = i / SR;
    put(sfx, t + x, noise() * Math.exp(-x * 46) * 0.12);
  }
}

function riser(t, dur) {
  let lp = 0;
  for (let i = 0; i < dur * SR; i++) {
    const x = i / SR;
    const p = x / dur;
    const a = 1 - Math.exp((-TAU * (300 + 5200 * p)) / SR);
    lp += (noise() - lp) * a;
    const env = Math.pow(p, 2.2) * 0.5;
    put(sfx, t + x, lp * env, Math.sin(p * 6) * 0.5);
  }
}

// ---- arrangement ----------------------------------------------------------
const BARS = ['A1', 'A1', 'F1', 'G1'];
const noteOf = (n) => ({ A1: 33, F1: 29, G1: 31 }[n] || 33);
const CHORD = [57, 60, 64, 67];

const hits = CUTS3.filter((t) => t > 0);
const intro = hits[0] ?? 0.32;

// four on the floor, kick + offbeat hats, until the lockup
for (let t = 0; t < 12.4; t += BEAT) {
  const bar = Math.floor(t / (BEAT * 4));
  if (t >= 0.32) kick(t, t < 3.4 ? 0.85 : 1);
  hat(t + BEAT / 2, 0.26, t > 9.4);
  if (bar % 2 === 1) hat(t + BEAT / 4, 0.12);
  if (bar >= 1 && bar % 4 === 2) hat(t + BEAT * 0.75, 0.09);
}

// bass: an eighth-note pulse, root of the bar
for (let t = 0.32; t < 12.4; t += BEAT / 2) {
  const bar = Math.floor(t / (BEAT * 4)) % BARS.length;
  const root = noteOf(BARS[bar]);
  const oct = Math.floor(t / (BEAT * 8)) % 2 === 0 ? 0 : 12;
  saw(midi(root + oct), t, BEAT * 0.42, 0.3, 900 + 600 * Math.min(1, t / 12));
}

// a stab on every cut, tuned to the chord of that bar
hits.forEach((t) => {
  if (t > 15.4) return;
  const bar = Math.floor(t / (BEAT * 4)) % BARS.length;
  const root = noteOf(BARS[bar]);
  stab(t, [root + 24, ...CHORD.map((c) => c + (bar % 2 ? 2 : 0))], t === 0.32 ? 0.2 : 0.17);
});

// riser into the lockup, then the floor stops
riser(11.35, 1.05);
for (let i = 0; i < 0.9 * SR; i++) {
  const x = i / SR;
  put(drums, 12.4 + x, Math.sin(TAU * 48 * x) * Math.exp(-x * 3.4) * 0.5);
}

// the last mark: one struck note, no drums, decaying to zero
{
  const f = midi(69);
  for (let i = 0; i < 2.4 * SR; i++) {
    const x = i / SR;
    const env = Math.exp(-x * 1.5);
    put(harm, 15.4 + x, Math.sin(TAU * f * x) * env * 0.16);
    put(harm, 15.4 + x, Math.sin(TAU * f * 2 * x) * env * 0.05);
  }
}

// ---- reverb: two delay lines, no convolution ------------------------------
function reverb(bus, wet = 0.18) {
  const d1 = Math.floor(0.037 * SR);
  const d2 = Math.floor(0.061 * SR);
  const L = bus.L.slice();
  const R = bus.R.slice();
  for (let i = 0; i < N; i++) {
    const a = L[i - d1] || 0;
    const b = R[i - d2] || 0;
    bus.L[i] += b * wet * 0.7;
    bus.R[i] += a * wet * 0.7;
  }
}
reverb(send, 0.22);
for (let i = 0; i < N; i++) {
  harm.L[i] += send.L[i] * 0.9;
  harm.R[i] += send.R[i] * 0.9;
}

// ---- sidechain the harmonics to the kick ---------------------------------
for (let t = 0; t < N / SR; t += BEAT) {
  const i0 = idx(t);
  for (let i = 0; i < 0.18 * SR && i0 + i < N; i++) {
    const g = 1 - 0.55 * Math.exp(-(i / SR) * 12);
    harm.L[i0 + i] *= g;
    harm.R[i0 + i] *= g;
  }
}

// ---- mix + soft clip ------------------------------------------------------
const out = bus();
for (let i = 0; i < N; i++) {
  const l = drums.L[i] + harm.L[i] + sfx.L[i];
  const r = drums.R[i] + harm.R[i] + sfx.R[i];
  out.L[i] = Math.tanh(l * 1.15) * 0.92;
  out.R[i] = Math.tanh(r * 1.15) * 0.92;
}

// ---- write 24-bit WAV -----------------------------------------------------
const bytes = 3;
const data = Buffer.alloc(N * 2 * bytes);
for (let i = 0; i < N; i++) {
  for (let ch = 0; ch < 2; ch++) {
    const v = clamp(ch === 0 ? out.L[i] : out.R[i], -1, 1);
    const s = Math.round(v * 8388607);
    const o = (i * 2 + ch) * bytes;
    data.writeIntLE(s, o, 3);
  }
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2 * bytes, 28);
header.writeUInt16LE(2 * bytes, 32);
header.writeUInt16LE(24, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
fs.writeFileSync(OUT, Buffer.concat([header, data]));

const cuts = hits.length;
console.log(`score3.wav ${DUR3}s @ ${BPM3} BPM — ${cuts} stabs across ${(DUR3 / (BEAT * 4)).toFixed(1)} bars`);
