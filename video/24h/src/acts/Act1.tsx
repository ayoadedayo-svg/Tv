import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, U, typeStyle } from '../brand/tokens';
import { Words } from '../fx/Words';
import { E, prog } from '../lib/anim';
import { ACT, copy, CUE, f60 } from '../timeline';
import { Screen, SCREEN } from './Screen';

// ACT 1 - a screen draws itself in a dark room, fills with somebody else's tiles, and the tiles
// leave. The copy says what happened; the picture says what it was like.

const L = (a: number) => a - ACT.statement.from;

/** One COPY fragment, rendered only inside its own window. */
export const Fragment: React.FC<{ id: string; f: number; from: number; ink?: string }> = ({ id, f, from, ink = C.white }) => {
  const c = copy(id);
  const start = c.in - from;
  const out = (c.out ?? c.resolved + f60(40)) - from;
  if (f < start - 2 || f > out + f60(18)) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Words
        id={id}
        text={c.text}
        frame={f}
        start={start}
        out={out}
        size={168 * U}
        style={{ ...typeStyle('display', 168 * U), color: ink }}
      />
    </div>
  );
};

export const Act1: React.FC = () => {
  const f = useCurrentFrame();
  const draw = prog(f, L(CUE.open), L(CUE.open) + f60(32), E.inOut);
  const fill = prog(f, L(CUE.day) - f60(16), L(CUE.day) + f60(34), E.out);
  const clear = prog(f, L(CUE.strangers), L(CUE.settle), E.inOut);
  const pulse = prog(f, L(CUE.settle) - f60(4), L(CUE.settle) + f60(4), E.out) * (1 - prog(f, L(CUE.settle) + f60(10), L(CUE.settle) + f60(70), E.smooth));

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: SCREEN.w * U, height: SCREEN.h * U }}>
        <Screen w={SCREEN.w * U} h={SCREEN.h * U} draw={draw} fill={fill} clear={clear} pulse={pulse} />
        {['day', 'strangers', 'fixes', 'stars'].map((id) => (
          <Fragment key={id} id={id} f={f} from={ACT.statement.from} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
