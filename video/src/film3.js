import * as D from './design.js';
import { W3 as W, H3 as H } from './timeline3.js';
import { PLATES3, SHOTS3, DUR3, BEAT3 } from './timeline3.js';

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Geist Mono", "JetBrains Mono", Menlo, monospace';
const cream = '#F7F1E4';
const ink = '#0A0B0D';
const blue = '#2A49FF';
const coral = '#FF5A3C';
const acid = '#E8FF4A';
const mint = '#5BF0B0';

let noise = [];
let vign = null;

export function init3() {
  for (let k = 0; k < 3; k++) {
    const n = document.createElement('canvas');
    n.width = 960;
    n.height = 540;
    const nx = n.getContext('2d');
    const data = nx.createImageData(960, 540);
    let seed = 4127 + k * 977;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < data.data.length; i += 4) {
      const v = 108 + Math.floor(rnd() * 44);
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    nx.putImageData(data, 0, 0);
    noise.push(n);
  }
  vign = document.createElement('canvas');
  vign.width = W;
  vign.height = H;
  const v = vign.getContext('2d');
  const g = v.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  v.fillStyle = g;
  v.fillRect(0, 0, W, H);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 4);
const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);
const lerp = (a, b, t) => a + (b - a) * t;

function grain(ctx, t, alpha = 0.05) {
  const n = noise[Math.floor(t * 24) % 3];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  const off = (t * 917) % 960;
  ctx.drawImage(n, -off, 0);
  ctx.drawImage(n, 960 - off, 0);
  ctx.restore();
}

function plate(ctx, t, name) {
  const p = PLATES3[name] || PLATES3.ink;
  const g = ctx.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, p.a);
  g.addColorStop(1, p.b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // the arc: one shape across every plate, so the cuts feel like one world
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = p.arc;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, H * 1.24, H * 0.72, Math.PI * 1.14, Math.PI * 1.86);
  ctx.stroke();
  ctx.restore();
  return p;
}

function fit(ctx, str, size, weight, maxW, tracking = -0.035) {
  ctx.font = `${weight} ${size}px ${SANS}`;
  let w = ctx.measureText(str).width + tracking * size * (str.length - 1);
  if (w <= maxW) return size;
  return Math.floor((size * maxW) / w);
}

function words(ctx, str, color, t, t0, o = {}) {
  const size = o.size || 200;
  const gap = o.gap || 0.06;
  const stag = o.stagger || 0.055;
  const dur = o.dur || 0.32;
  const parts = str.split(' ');
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const f = fit(ctx, str, size, 500, 1640);
  ctx.font = `500 ${f}px ${SANS}`;
  const widths = parts.map((p) => ctx.measureText(p).width);
  const space = (o.gap || 0.22) * f;
  const total = widths.reduce((a, b) => a + b, 0) + space * (parts.length - 1);
  let x = W / 2 - total / 2;
  const base = H * 0.61;
  parts.forEach((p, i) => {
    const p0 = (o.delay || 0) + i * stag;
    const e = ease((t - t0 - p0) / dur);
    const out = o.out ? easeIn((t - o.out) / 0.22) : 0;
    ctx.save();
    ctx.globalAlpha = clamp(e, 0, 1) * (1 - out);
    ctx.translate(x + widths[i] / 2, base + (1 - e) * 54 - out * 40);
    ctx.scale(1 + (1 - e) * 0.06, 1 + (1 - e) * 0.06);
    ctx.fillStyle = color;
    ctx.fillText(p, -widths[i] / 2, 0);
    ctx.restore();
    x += widths[i] + (i < parts.length - 1 ? space : 0);
  });
  ctx.restore();
  return base;
}

function number(ctx, value, color, t, t0, size = 300) {
  const p = ease((t - t0) / 0.9);
  const shown = Math.round(value * p);
  ctx.save();
  ctx.font = `500 ${size}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.96 * clamp((t - t0) / 0.12, 0, 1);
  ctx.fillText(String(shown).padStart(String(value).length, '0'), W / 2, H * 0.6);
  ctx.restore();
  return p;
}

function sub(ctx, str, color, t, t0) {
  const e = ease((t - t0) / 0.35);
  ctx.save();
  ctx.globalAlpha = 0.62 * e;
  ctx.fillStyle = color;
  ctx.font = `400 30px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(str.toUpperCase(), W / 2, H * 0.74 + (1 - e) * 14);
  ctx.restore();
}

function bars(ctx, local) {
  const cols = ['#F7F1E4', '#E8FF4A', '#5BF0B0', '#2A49FF', '#FF5A3C', '#0A0B0D'];
  const w = W / cols.length;
  const p = ease(local / 0.3);
  cols.forEach((c, i) => {
    const h = H * (0.35 + 0.65 * p) * (0.7 + 0.3 * ((i * 7) % 5) / 5);
    ctx.fillStyle = c;
    ctx.fillRect(i * w, 0, w + 1, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(i * w, H - h * 0.5, w + 1, h * 0.5);
  });
}

const shot = (t) => SHOTS3.slice().reverse().find((s) => t >= s.t) || SHOTS3[0];

export function drawFrame3(ctx, t, images) {
  const s = shot(t);
  const local = t - s.t;
  const prev = SHOTS3[SHOTS3.indexOf(s) - 1];
  const sinceCut = local;
  const out = prev && sinceCut > 0.36 ? 0 : 0;

  ctx.clearRect(0, 0, W, H);
  const kind = s.kind;

  if (kind === 'bars') {
    ctx.fillStyle = '#0A0B0D';
    ctx.fillRect(0, 0, W, H);
    bars(ctx, local);
  } else if (kind === 'word' || kind === 'two') {
    const p = plate(ctx, t, s.plate);
    if (kind === 'word') {
      words(ctx, s.text, p.ink, t, s.t, { size: s.size || 210, out: s.t + 1.42 });
      if (s.sub) sub(ctx, s.sub, p.ink, t, s.t + 0.42);
    } else {
      // two lines, replaced one after the other: the fastest read in the film
      const phase = local < 0.75 ? 0 : 1;
      const str = phase === 0 ? s.a : s.b;
      const t0 = phase === 0 ? s.t : s.t + 0.75;
      words(ctx, str, p.ink, t, t0, { size: 236 });
    }
  } else if (kind === 'stars') {
    const p = plate(ctx, t, 'cobalt');
    number(ctx, 330, p.ink, t, s.t + 0.1, 330);
    sub(ctx, 'stars in 24 hours', p.ink, t, s.t + 0.36);
  } else if (kind === 'hosts') {
    const p = plate(ctx, t, 'ink');
    number(ctx, 396, p.ink, t, s.t + 0.1, 330);
    sub(ctx, 'hosts answering 127.0.0.1', p.ink, t, s.t + 0.36);
  } else if (kind === 'lockup') {
    const p = plate(ctx, t, 'ink');
    const e = ease(local / 0.4);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `500 190px ${SANS}`;
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = e;
    ctx.fillText('dumbtv', W / 2, H * 0.56 + (1 - e) * 30);
    ctx.globalAlpha = e * 0.5;
    ctx.fillRect(W / 2 - 440 * e, H * 0.6, 880 * e, 3);
    ctx.globalAlpha = e * 0.7;
    ctx.font = `400 30px ${MONO}`;
    ctx.fillText('github.com/humblemuzzu/dumbtv', W / 2, H * 0.665);
    ctx.restore();
  } else if (kind === 'mark') {
    const p = plate(ctx, t, 'cream');
    const e = ease(local / 0.5);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = e;
    ctx.fillStyle = p.ink;
    // the mark: a screen, its stand, and a period
    const mw = 300 * e;
    const sx = W / 2 - mw / 2;
    const sy = H * 0.38;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(sx, sy, mw, mw * 0.5625);
    ctx.globalAlpha = e * 0.9;
    ctx.beginPath();
    ctx.moveTo(W / 2 - mw * 0.12, sy + mw * 0.5625 + 26);
    ctx.lineTo(W / 2 + mw * 0.12, sy + mw * 0.5625 + 26);
    ctx.lineTo(W / 2 + mw * 0.16, sy + mw * 0.5625 + 40);
    ctx.lineTo(W / 2 - mw * 0.16, sy + mw * 0.5625 + 40);
    ctx.closePath();
    ctx.fillStyle = p.ink;
    ctx.fill();
    ctx.globalAlpha = e * 0.75;
    ctx.font = `400 34px ${MONO}`;
    ctx.fillText('NO ADS · NO TRACKING · NO ROOT', W / 2, H * 0.8);
    ctx.globalAlpha = e;
    ctx.fillStyle = coral;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.87, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // glitch slices on the first three frames of every cut
  if (sinceCut < 0.1 && kind !== 'bars') {
    ctx.save();
    ctx.globalAlpha = 0.85;
    const slices = [[H * 0.18, H * 0.05, 26], [H * 0.54, H * 0.03, -20], [H * 0.8, H * 0.04, 14]];
    for (const [sy, sh, dx] of slices) ctx.drawImage(ctx.canvas, 0, sy, W, sh, dx, sy, W, sh);
    ctx.restore();
  }

  grain(ctx, t, 0.055);
  ctx.drawImage(vign, 0, 0);

  // pull the last frame down to black so the score can land the final hit
  if (t > DUR3 - 0.55) {
    ctx.fillStyle = `rgba(6,6,8,${clamp((t - (DUR3 - 0.55)) / 0.55, 0, 1)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (t < 0.1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.1})`;
    ctx.fillRect(0, 0, W, H);
  }
}
