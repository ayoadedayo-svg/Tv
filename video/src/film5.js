import { DUR5, SHOTS5, VERIFY, TERM } from './timeline5.js';
import { W3 as W, H3 as H } from './timeline3.js';

// Built to the editor's report: the terminal is typography, not a window; the proof gets the
// longest hold; the ending lands on the product's own output, not on a logo card.

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';
const ink = '#0A0B0D';
const cream = '#F2EDE3';
const coral = '#FF5A3C';

const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - cl(t), 4);
const out3 = (t) => Math.pow(cl(t), 3);
const lerp = (a, b, t) => a + (b - a) * t;

function grain(ctx, t) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 16000; i++) {
    const x = (i * 977 + t * 700) % W;
    const y = (i * 613 + t * 300) % H;
    ctx.fillStyle = i % 2 ? '#fff' : '#000';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.restore();
}

/** Shot 1-2: the wall of real package names. No transforms, no modulo: a plain brick of text. */
function wall(ctx, names, t, local) {
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);
  const cols = 8;
  const rows = 34;
  const rowH = 30;
  const colW = Math.floor((W - 80) / cols);
  const lift = Math.round(Math.min(local, 2.0) * (local < 1.5 ? 6 : 40));
  ctx.font = `400 16px ${MONO}`;
  ctx.textAlign = 'left';
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i = (c * 31 + r * 7 + 3) % names.length;
      const name = String(names[i] || '').slice(0, 26);
      if (!name) continue;
      const x = 40 + c * colW;
      const y = 40 + r * rowH - (lift % rowH) + rowH;
      ctx.fillStyle = `rgba(242,237,227,${0.3 + ((i * 5) % 7) / 22})`;
      ctx.fillText(name, x, y);
    }
  }
  ctx.fillStyle = 'rgba(242,237,227,0.95)';
  ctx.font = `500 24px ${MONO}`;
  ctx.fillText('com.amazon.tv.acr', 40, H * 0.46);
  ctx.fillText('com.amazon.tahoe', 40, H * 0.46 + 34);
  const sy = Math.max(-160, Math.min(H + 160, -120 + (local / 1.3) * (H + 240)));
  const g = ctx.createLinearGradient(0, sy - 90, 0, sy + 90);
  g.addColorStop(0, 'rgba(242,237,227,0)');
  g.addColorStop(0.5, 'rgba(242,237,227,0.12)');
  g.addColorStop(1, 'rgba(242,237,227,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, sy - 90, W, 180);
}

function rise(ctx, str, size, colour, t, at, dur = 8, x = W / 2, y = H - 96, align = 'center', track = 0) {
  const e = ease((t - at) / (dur / 30));
  if (e <= 0) return 1;
  ctx.save();
  ctx.globalAlpha = e;
  ctx.fillStyle = colour;
  ctx.font = `400 ${size}px ${SANS}`;
  ctx.textAlign = align;
  ctx.letterSpacing = `${track}px`;
  ctx.fillText(str, x, y + (1 - e) * 18);
  ctx.restore();
  return e;
}

export function drawFrame5(ctx, t, images) {
  const f = Math.round(t * 30);
  const s = SHOTS5.slice().reverse().find((x) => f >= x.f) || SHOTS5[0];
  const local = t - s.f / 30;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  const kind = s.kind;

  if (kind === 'wall' || kind === 'wallcount') {
    wall(ctx, images.names, t, kind === 'wall' ? local : 1.5 + local);
    if (kind === 'wall') {
      rise(ctx, s.copy, 40, cream, t, 10 / 30, 8, 96, H - 84, 'left');
    } else {
      // "236 apps." with the size break inside one line
      const e = ease((t - 45 / 30) / 0.3);
      const v = Math.round(236 * ease((t - 51 / 30) / 1.0));
      const shown = v > 236 ? 241 : v;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.textAlign = 'center';
      ctx.fillStyle = cream;
      ctx.font = `500 160px ${SANS}`;
      ctx.fillText(String(shown), W / 2 - 150, H * 0.56);
      ctx.font = `400 48px ${SANS}`;
      ctx.fillText('apps.', W / 2 + 130, H * 0.56);
      ctx.restore();
      // the freeze: everything stops dead for 9 frames
      if (f >= 96 && f < 105) {
        ctx.fillStyle = 'rgba(242,237,227,0.02)';
        ctx.fillRect(0, 0, W, H);
      }
    }
  } else if (kind === 'big') {
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, W, H);
    // 236 at 520 px, sharpening left to right through a clipping wipe
    const p = cl((t - 105 / 30) / 0.8);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W * p, H);
    ctx.clip();
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.font = `500 520px ${SANS}`;
    ctx.letterSpacing = '-14px';
    ctx.fillText('236', W / 2, H * 0.72);
    ctx.restore();
    rise(ctx, s.copy, 64, ink, t, 117 / 30, 8, W / 2, H * 0.85);
  } else if (kind === 'term' || kind === 'output') {
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `400 34px ${MONO}`;
    ctx.textAlign = 'left';
    const first = TERM[0];
    if (kind === 'term') {
      const p2 = cl((t - 153 / 30) / ((178 - 153) / 30));
      const full = ctx.measureText(first).width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 120 + full * p2 + 2, H);
      ctx.clip();
      ctx.fillStyle = cream;
      ctx.fillText(first, 120, 300);
      ctx.restore();
      ctx.fillStyle = cream;
      ctx.fillRect(120 + full * p2 + 6, 272, 16, 34);
    } else {
      ctx.fillStyle = 'rgba(242,237,227,0.55)';
      ctx.fillText(first, 120, 300);
      TERM.slice(2).forEach((line, i) => {
        const at = (195 + (i + 1) * 8) / 30;
        const e = ease((t - at) / 0.2);
        if (e <= 0) return;
        ctx.globalAlpha = e;
        const parts = line.trim().split(/\s{2,}/);
        ctx.fillStyle = 'rgba(242,237,227,0.55)';
        ctx.fillText(parts[0] || '', 120, 360 + i * 52 + (1 - e) * 14);
        ctx.fillStyle = i === 0 ? coral : cream;
        ctx.fillText(line.replace(/^\s*/, ''), 420, 360 + i * 52 + (1 - e) * 14);
        ctx.globalAlpha = 1;
      });
      // the odometer, top right
      const v = Math.round(65 * ease((t - 240 / 30) / 1.2));
      ctx.textAlign = 'right';
      ctx.fillStyle = cream;
      ctx.font = `500 64px ${MONO}`;
      ctx.fillText(String(v), W - 120, 170);
      // and the two sentences
      rise(ctx, 'One command.', 40, cream, t, 195 / 30, 8, 120, H - 90, 'left');
      ctx.save();
      ctx.globalAlpha = cl((t - 240 / 30) / 0.2);
      ctx.fillStyle = coral;
      ctx.font = `400 40px ${SANS}`;
      ctx.textAlign = 'left';
      ctx.fillText('65 packages gone.', 120, H - 90);
      ctx.restore();
      // progress rule
      const pr = cl((t - 195 / 30) / 2.5);
      ctx.fillStyle = 'rgba(242,237,227,0.25)';
      ctx.fillRect(120, H - 60, W - 240, 1);
      ctx.fillStyle = coral;
      ctx.fillRect(120, H - 60, (W - 240) * pr, 1);
    }
  } else if (kind === 'verify') {
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `400 26px ${MONO}`;
    ctx.textAlign = 'left';
    VERIFY.forEach((row, i) => {
      const at = (285 + 3 + i * 5) / 30;
      const e = ease((t - at) / 0.16);
      if (e <= 0) return;
      const y = 190 + i * 56 + (1 - e) * 10;
      ctx.globalAlpha = e;
      const [, host, res] = row;
      ctx.fillStyle = 'rgba(242,237,227,0.45)';
      ctx.fillText(row[0].padStart(9), 120, y);
      ctx.fillStyle = cream;
      ctx.fillText(host, 330, y);
      const blocked = res === 'blocked';
      ctx.fillStyle = blocked ? coral : 'rgba(242,237,227,0.75)';
      ctx.fillText(res, W - 520, y);
      ctx.globalAlpha = 1;
    });
    // the corner counter: social proof as evidence, not as a beat
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(242,237,227,0.4)';
    ctx.font = `400 20px ${MONO}`;
    ctx.fillText('330 \u2605 \u00b7 6 PR \u00b7 24 h', W - 120, 120);
  } else if (kind === 'snap') {
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, W, H);
    const e = ease((t - 345 / 30) / (4 / 30));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(lerp(1.06, 1, e), lerp(1.06, 1, e));
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.font = `500 96px ${SANS}`;
    ctx.fillText(s.copy, 0, 24);
    ctx.restore();
  } else if (kind === 'switch') {
    // the settings panel, cropped to the switch at native sharpness
    const img = images.shorts;
    const push = 1.06 - 0.06 * ease(local / 2.5);
    const scale = Math.max(H / img.height, W / img.width) * push;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, W / 2 - w / 2, H / 2 - h / 2, w, h);
    // a coral ring lands on the tick
    const ring = ease((t - 418 / 30) / 0.25);
    if (ring > 0) {
      ctx.save();
      ctx.globalAlpha = ring;
      ctx.strokeStyle = coral;
      ctx.lineWidth = 4;
      const rx = W * 0.62;
      const ry = H * 0.19;
      ctx.beginPath();
      ctx.arc(rx, ry, 34 + 16 * (1 - ring), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === 'home' || kind === 'claim' || kind === 'end') {
    const img = images.home;
    const blur = kind === 'end' ? 24 : 0;
    const dim = kind === 'claim' ? 0.55 : kind === 'end' ? 0.65 : 0.12;
    const push = kind === 'home' ? 1.06 - 0.06 * ease(local / 2.0) : 1 + 0.02 * ease(local / 2.0);
    const scale = Math.max(H / img.height, W / img.width) * push;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.save();
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(img, W / 2 - w / 2, H / 2 - h / 2, w, h);
    ctx.restore();
    ctx.fillStyle = `rgba(10,11,13,${dim})`;
    ctx.fillRect(0, 0, W, H);

    if (kind === 'home') {
      // a remote moving across the tiles
      const dp = cl((t - 455 / 30) / 0.8);
      const dx = lerp(W * 0.2, W * 0.62, ease(dp));
      ctx.strokeStyle = 'rgba(242,237,227,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, H * 0.32, 150, 120);
      rise(ctx, s.copy, 40, cream, t, s.copyAt / 30, 8, 96, H - 84, 'left');
    }

    if (kind === 'claim') {
      rise(ctx, 'No ads.', 120, cream, t, 519 / 30, 8, W / 2, H * 0.46);
      rise(ctx, 'No Shorts.', 120, cream, t, 528 / 30, 8, W / 2, H * 0.6);
    }

    if (kind === 'end') {
      const e = ease((t - 555 / 30) / 0.4);
      ctx.save();
      ctx.globalAlpha = e;
      ctx.textAlign = 'center';
      ctx.fillStyle = cream;
      ctx.font = `500 140px ${SANS}`;
      ctx.fillText('dumbtv', W / 2, H * 0.54);
      ctx.fillStyle = coral;
      ctx.fillRect(W / 2 - 240 * e, H * 0.585, 480 * e, 3);
      ctx.globalAlpha = e * 0.8;
      ctx.fillStyle = cream;
      ctx.font = `400 28px ${MONO}`;
      ctx.fillText('github.com/humblemuzzu/dumbtv', W / 2, H * 0.64);
      ctx.restore();
    }
  }

  grain(ctx, t);
  // hard out: no fade, no sting
  if (t > DUR5 - 1 / 30) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }
}
