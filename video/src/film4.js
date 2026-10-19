import { W3 as W, H3 as H } from './timeline3.js';
import { DUR4, SHOTS4 } from './timeline4.js';

// Real screenshots from the TV, real annotation, real motion. The lesson from the reference that
// got millions of views: it does not cut fast, something moves inside every shot.

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Geist Mono", "JetBrains Mono", Menlo, monospace';
const cream = '#F7F1E4';
const ink = '#0A0B0D';
const blue = '#2A49FF';
const coral = '#FF5A3C';
const acid = '#E8FF4A';
const PLATES = {
  ink: { a: '#101216', b: '#05060A', ink: cream },
  cobalt: { a: '#2A49FF', b: '#0E22A8', ink: cream },
  acid: { a: '#E8FF4A', b: '#C3D900', ink: ink },
  coral: { a: '#FF5A3C', b: '#C92908', ink: ink },
};

let noise = [];
let vign = null;

export function init4() {
  for (let k = 0; k < 3; k++) {
    const n = document.createElement('canvas');
    n.width = 960;
    n.height = 540;
    const nx = n.getContext('2d');
    const d = nx.createImageData(960, 540);
    let seed = 7717 + k * 313;
    const r = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 110 + Math.floor(r() * 40);
      d.data[i] = v;
      d.data[i + 1] = v;
      d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    nx.putImageData(d, 0, 0);
    noise.push(n);
  }
  vign = document.createElement('canvas');
  vign.width = W;
  vign.height = H;
  const v = vign.getContext('2d');
  const g = v.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.98);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  v.fillStyle = g;
  v.fillRect(0, 0, W, H);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 4);
const lerp = (a, b, t) => a + (b - a) * t;

function grain(ctx, t, a = 0.05) {
  const n = noise[Math.floor(t * 24) % 3];
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'overlay';
  const off = (t * 880) % 960;
  ctx.drawImage(n, -off, 0);
  ctx.drawImage(n, 960 - off, 0);
  ctx.restore();
}

function plateBg(ctx, name) {
  const p = PLATES[name] || PLATES.ink;
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, p.a);
  g.addColorStop(1, p.b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return p;
}

/** A sentence, set as one line, arriving word by word and settling. */
function sentence(ctx, str, color, t, t0, out, o = {}) {
  const size = o.size || 150;
  ctx.save();
  ctx.font = `500 ${size}px ${SANS}`;
  const words = str.split(' ');
  const space = size * 0.24;
  const widths = words.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = W / 2 - total / 2;
  const base = H * 0.56;
  words.forEach((w, i) => {
    const e = ease((t - t0 - i * 0.07) / 0.34);
    const q = out ? Math.pow(clamp((t - out) / 0.22, 0, 1), 3) : 0;
    ctx.save();
    ctx.globalAlpha = clamp(e, 0, 1) * (1 - q);
    ctx.translate(x + widths[i] / 2, base + (1 - e) * 46 - q * 34);
    ctx.scale(1 + (1 - e) * 0.05, 1 + (1 - e) * 0.05);
    ctx.fillStyle = color;
    ctx.fillText(w, -widths[i] / 2, 0);
    ctx.restore();
    x += widths[i] + space;
  });
  ctx.restore();
}

/** A real screenshot with a slow push, a scrim, and annotation chips that pop in turn. */
function photo(ctx, img, t, local, o) {
  if (!img) return;
  const push = 1.06 + 0.05 * ease(local / 3.2);
  const s = Math.max(W / img.width, H / img.height) * push;
  const w = img.width * s;
  const h = img.height * s;
  ctx.save();
  ctx.globalAlpha = clamp(local / 0.12, 0, 1);
  ctx.drawImage(img, W / 2 - w / 2 + Math.sin(local * 0.5) * 8, H / 2 - h / 2 + Math.cos(local * 0.4) * 6, w, h);
  ctx.restore();

  // scrim: the screenshot stays readable, the type stays legible
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(6,7,10,0)');
  g.addColorStop(1, 'rgba(6,7,10,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // caption
  const c = ease((local - 0.18) / 0.4);
  ctx.save();
  ctx.globalAlpha = c;
  ctx.fillStyle = cream;
  ctx.font = `500 58px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText(o.caption, 110, H - 108);
  ctx.restore();

  // chips, popping in one at a time with a leader line
  (o.chips || []).forEach((c2, i) => {
    const at = 0.5 + i * 0.34;
    const e = ease((local - at) / 0.3);
    if (e <= 0) return;
    const x = 110 + i * 430;
    const y = H - 190;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.fillStyle = coral;
    ctx.fillRect(x, y, 3, 40 * e);
    ctx.font = `400 27px ${MONO}`;
    const tw = ctx.measureText(c2).width;
    ctx.fillStyle = 'rgba(10,11,13,0.72)';
    ctx.fillRect(x + 10, y - 6, tw + 34, 46);
    ctx.fillStyle = cream;
    ctx.fillText(c2, x + 27, y + 26);
    ctx.restore();
  });
}

const shotOf = (t) => SHOTS4.slice().reverse().find((s) => t >= s.t) || SHOTS4[0];

export function drawFrame4(ctx, t, images) {
  const s = shotOf(t);
  const local = t - s.t;
  const next = SHOTS4[SHOTS4.indexOf(s) + 1];
  const until = next ? next.t - s.t : DUR4 - s.t;
  ctx.clearRect(0, 0, W, H);

  if (s.kind === 'black') {
    ctx.fillStyle = '#05060A';
    ctx.fillRect(0, 0, W, H);
  } else if (s.kind === 'line') {
    const p = plateBg(ctx, s.plate);
    const out = until > 1.2 ? s.t + until - 0.24 : undefined;
    sentence(ctx, s.text, p.ink, t, s.t, out, { size: 168 });
  } else if (s.kind === 'photo') {
    ctx.fillStyle = '#05060A';
    ctx.fillRect(0, 0, W, H);
    photo(ctx, images[s.img], t, local, s);
  } else if (s.kind === 'proof') {
    plateBg(ctx, 'ink');
    // two facts, set like a label and its value, not as giant digits
    const rows = [
      ['packages disabled', '65'],
      ['hosts answering 127.0.0.1', '396'],
      ['pull requests merged', '6'],
      ['stars in 24 hours', '330'],
    ];
    rows.forEach((r, i) => {
      const e = ease((local - i * 0.16) / 0.4);
      const y = H * 0.3 + i * 108;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.fillStyle = 'rgba(247,241,228,0.5)';
      ctx.font = `400 34px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1).padStart(2, '0'), 180, y);
      ctx.fillStyle = cream;
      ctx.font = `400 42px ${MONO}`;
      ctx.fillText(r[0], 260, y);
      ctx.fillStyle = acid;
      ctx.font = `500 52px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(r[1], W - 180, y);
      ctx.restore();
    });
  } else if (s.kind === 'lockup') {
    plateBg(ctx, 'ink');
    const e = ease(local / 0.45);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = cream;
    ctx.globalAlpha = e;
    ctx.font = `500 200px ${SANS}`;
    ctx.fillText('dumbtv', W / 2, H * 0.55 + (1 - e) * 26);
    ctx.globalAlpha = e * 0.5;
    ctx.fillRect(W / 2 - 470 * e, H * 0.6, 940 * e, 3);
    ctx.globalAlpha = e * 0.7;
    ctx.font = `400 30px ${MONO}`;
    ctx.fillText('github.com/humblemuzzu/dumbtv', W / 2, H * 0.665);
    ctx.restore();
  } else if (s.kind === 'mark') {
    plateBg(ctx, 'ink');
    const e = ease(local / 0.5);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = e;
    ctx.fillStyle = cream;
    ctx.font = `400 46px ${SANS}`;
    ctx.fillText('no ads. no tracking. no root.', W / 2, H * 0.47);
    ctx.globalAlpha = e * 0.55;
    ctx.font = `400 30px ${MONO}`;
    ctx.fillText('A FIRE TV, IN TEN MINUTES', W / 2, H * 0.545);
    ctx.globalAlpha = e;
    ctx.fillStyle = coral;
    ctx.fillRect(W / 2 - 46, H * 0.6, 92, 7);
    ctx.restore();
  }

  // a two-frame glitch on every cut, so the beat is felt even on mute
  if (local < 0.07 && s.kind !== 'black') {
    ctx.save();
    ctx.globalAlpha = 0.8;
    for (const [sy, sh, dx] of [[H * 0.2, H * 0.045, 22], [H * 0.58, H * 0.03, -16]]) {
      ctx.drawImage(ctx.canvas, 0, sy, W, sh, dx, sy, W, sh);
    }
    ctx.restore();
  }

  grain(ctx, t, 0.05);
  ctx.drawImage(vign, 0, 0);

  if (t > DUR4 - 0.5) {
    ctx.fillStyle = `rgba(5,6,10,${clamp((t - (DUR4 - 0.5)) / 0.5, 0, 1)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (t < 0.08) {
    ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.08})`;
    ctx.fillRect(0, 0, W, H);
  }
}
