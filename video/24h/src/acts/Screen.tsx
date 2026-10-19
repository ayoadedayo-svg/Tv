import React from 'react';
import { C, U } from '../brand/tokens';

// The film's one object: a television. Inside it, the thing a smart TV actually shows - one hero
// tile and rows of app tiles - which is also the bloat, and which leaves.

export const SCREEN = { w: 1560, h: 877.5 };

type Block = { x: number; y: number; w: number; h: number; hero?: boolean };

const BLOCKS: Block[] = [
  { x: 4, y: 7, w: 52, h: 42, hero: true },
  { x: 58, y: 7, w: 38, h: 19 },
  { x: 58, y: 30, w: 18, h: 19 },
  { x: 78, y: 30, w: 18, h: 19 },
  { x: 4, y: 55, w: 14, h: 15 },
  { x: 20, y: 55, w: 14, h: 15 },
  { x: 36, y: 55, w: 14, h: 15 },
  { x: 52, y: 55, w: 14, h: 15 },
  { x: 68, y: 55, w: 14, h: 15 },
  { x: 84, y: 55, w: 12, h: 15 },
  { x: 4, y: 76, w: 10, h: 12 },
  { x: 16, y: 76, w: 10, h: 12 },
  { x: 28, y: 76, w: 10, h: 12 },
  { x: 40, y: 76, w: 10, h: 12 },
  { x: 52, y: 76, w: 10, h: 12 },
  { x: 64, y: 76, w: 10, h: 12 },
  { x: 76, y: 76, w: 10, h: 12 },
  { x: 88, y: 76, w: 8, h: 12 },
];

export const Screen: React.FC<{
  w: number;
  h: number;
  draw: number; // 0..1 the frame draws itself
  fill: number; // 0..1 the tiles arrive
  clear: number; // 0..1 the tiles leave, left to right
  accent?: number; // 0..1 the one accent flood
  pulse?: number; // 0..1 the frame brightens on a picture beat
  fade?: number; // 0..1 the whole object fades
  style?: React.CSSProperties;
}> = ({ w, h, draw, fill, clear, accent = 0, fade = 1, pulse = 0, style }) => {
  const cells = BLOCKS.map((b, i) => {
    const delay = (b.x / 100) * 0.62 + (i % 3) * 0.03;
    const gone = Math.min(1, Math.max(0, (clear - delay) / 0.36));
    const on = Math.min(1, Math.max(0, (fill - (b.x / 100) * 0.28 - b.y * 0.002) / 0.44));
    if (on <= 0 || gone >= 1) return null;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${b.x}%`,
          top: `${b.y}%`,
          width: `${b.w}%`,
          height: `${b.h}%`,
          opacity: on * (1 - gone),
          transform: `translateY(${-18 * gone * U}px) scale(${1 - 0.06 * gone})`,
          transformOrigin: '50% 50%',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: i % 5 === 0 ? C.line : C.ink2,
            border: `${1 * U}px solid ${i % 3 === 0 ? C.tile : C.line}`,
            borderRadius: (b.hero ? 3 : 2) * U,
            opacity: b.hero ? 1 : 0.85,
          }}
        />
      </div>
    );
  });

  const edge = 3 * U;
  const stroke = `rgba(244,245,247,${0.55 + 0.45 * pulse})`;
  return (
    <div style={{ position: 'relative', width: w, height: h, opacity: fade, ...style }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{cells}</div>
      <div style={{ position: 'absolute', inset: 0, background: C.accent, opacity: accent }} />
      <div style={{ position: 'absolute', left: 0, top: 0, height: edge, background: stroke, width: `${draw * 100}%` }} />
      <div style={{ position: 'absolute', right: 0, bottom: 0, height: edge, background: stroke, width: `${draw * 100}%` }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: edge, background: stroke, height: `${draw * 100}%` }} />
      <div style={{ position: 'absolute', right: 0, bottom: 0, width: edge, background: stroke, height: `${draw * 100}%` }} />
    </div>
  );
};
