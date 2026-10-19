import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Mark } from './brand/Mark';
import { C, U, typeStyle } from './brand/tokens';
import { FontGate } from './lib/FontGate';
import { copy } from './timeline';

// Style frames: `npm run stills`, then look at them before building motion.

export const MarkStill: React.FC<{ size: number; surface: 'paper' | 'ink' }> = ({ size, surface }) => (
  <AbsoluteFill style={{ background: surface === 'ink' ? C.ink : C.paper, alignItems: 'center', justifyContent: 'center' }}>
    <Mark size={size} ink={surface === 'ink' ? C.white : C.ink} />
  </AbsoluteFill>
);

const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** The mark at every working size on both surfaces: the screen stroke and the period must hold. */
export const MarkSizes: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    {(['paper', 'ink'] as const).map((surface) => (
      <div key={surface} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 56 * U, background: surface === 'ink' ? C.ink : C.paper }}>
        {SIZES.map((s) => (
          <Mark key={s} size={s * U} ink={surface === 'ink' ? C.white : C.ink} />
        ))}
      </div>
    ))}
  </AbsoluteFill>
);

type Ground = 'light' | 'dark' | 'accent';
const inkOn = (g: Ground) => (g === 'light' ? C.ink : C.white);
const groundOf = (g: Ground) => (g === 'light' ? C.paper : g === 'dark' ? C.ink : C.accent);

/** The lockup as the film ends on it: wordmark, a rule under it, the URL in mono. */
const Lockup: React.FC<{ ink: string; cx: number; cy: number; scale: number }> = ({ ink, cx, cy, scale }) => {
  const name = copy('wordmark').text;
  return (
    <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
      <div style={{ ...typeStyle('display', 168 * U * scale), color: ink }}>{name}</div>
      <div style={{ height: 3 * U * scale, width: 520 * U * scale, background: ink, opacity: 0.5, margin: `${22 * U * scale}px auto` }} />
      <div style={{ ...typeStyle('ui', 26 * U * scale), color: ink, opacity: 0.7, fontFamily: '"Geist Mono Variable", monospace' }}>{copy('url').text}</div>
    </div>
  );
};

export const BrandMark: React.FC<{ size: number; ground: Ground }> = ({ size, ground }) => (
  <AbsoluteFill style={{ background: groundOf(ground), alignItems: 'center', justifyContent: 'center' }}>
    <Mark size={size} ink={inkOn(ground)} />
  </AbsoluteFill>
);

export const BrandLockup: React.FC<{ ground: Ground }> = ({ ground }) => (
  <FontGate>
    <AbsoluteFill style={{ background: groundOf(ground) }}>
      <Lockup ink={inkOn(ground)} cx={1200} cy={400} scale={1} />
    </AbsoluteFill>
  </FontGate>
);

export const BrandAvatar: React.FC<{ ground: Ground }> = ({ ground }) => (
  <AbsoluteFill style={{ background: groundOf(ground), alignItems: 'center', justifyContent: 'center' }}>
    <Mark size={230} ink={inkOn(ground)} />
  </AbsoluteFill>
);

export const BrandHeader: React.FC<{ ground: Ground }> = ({ ground }) => (
  <FontGate>
    <AbsoluteFill style={{ background: groundOf(ground), alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...typeStyle('display', 120 * U), color: inkOn(ground) }}>{copy('wordmark').text}</div>
    </AbsoluteFill>
  </FontGate>
);
