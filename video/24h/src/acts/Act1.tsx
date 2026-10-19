import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, U, typeStyle } from '../brand/tokens';
import { Words } from '../fx/Words';
import { E, mix, prog } from '../lib/anim';
import { ACT, copy, CUE, f60 } from '../timeline';
import { Screen, SCREEN } from './Screen';

// ACT 1 - the hook, and what the command removed: a terminal line that types itself, runs, and
// turns into a television full of somebody else's tiles.

export const L1 = (a: number) => a - ACT.statement.from;

/** Scale punch: everything that lands on a beat lands a little larger and settles. */
export const punch = (f: number, at: number, amount = 0.05) => 1 + amount * (1 - prog(f, at, at + f60(12), E.out));

/** One COPY fragment, rendered only inside its own window, with the beat's punch. */
export const Fragment: React.FC<{ id: string; f: number; from: number; ink?: string; punchAt?: number }> = ({ id, f, from, ink = C.white, punchAt }) => {
  const c = copy(id);
  const start = c.in - from;
  const out = c.out - from;
  if (f < start - 2 || f > out + f60(20)) return null;
  const s = punchAt === undefined ? 1 : punch(f, punchAt - from);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${s})` }}>
      <Words id={id} text={c.text} frame={f} start={start} out={out} size={168 * U} style={{ ...typeStyle('display', 168 * U), color: ink }} />
    </div>
  );
};

/** A mono evidence pill under the statement: what the change actually was. */
export const Chip: React.FC<{ id: string; f: number; from: number }> = ({ id, f, from }) => {
  const c = copy(id);
  const start = c.in - from;
  const out = c.out - from;
  if (f < start || f > out + f60(12)) return null;
  const p = prog(f, start, start + f60(10), E.out);
  const q = prog(f, out, out + f60(10), E.in);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: '9%', display: 'flex', justifyContent: 'center', opacity: p * (1 - q), transform: `translateY(${mix(18, 0, p) + 10 * q}px)` }}>
      <span style={{ ...typeStyle('ui', 26 * U), fontFamily: '"Geist Mono Variable", monospace', color: C.mute, border: `${1 * U}px solid ${C.line}`, borderRadius: 999, padding: `${9 * U}px ${18 * U}px` }}>
        {c.text}
      </span>
    </div>
  );
};

export const Act1: React.FC = () => {
  const f = useCurrentFrame();
  const cmd = copy('cmd');
  const typed = Math.round(cmd.text.length * prog(f, L1(cmd.in), L1(cmd.in) + f60(44), E.type));
  const ran = prog(f, L1(CUE.run), L1(CUE.run) + f60(10), E.out);
  const lineUp = prog(f, L1(CUE.run), L1(CUE.run) + f60(18), E.inOut);

  const pop = prog(f, L1(CUE.run), L1(CUE.run) + f60(14), E.out);
  const fill = prog(f, L1(CUE.day) - f60(8), L1(CUE.day) + f60(24), E.out);
  const clear = prog(f, L1(CUE.hosts), L1(CUE.stars) - f60(80), E.inOut);

  const blink = Math.floor(f / 20) % 2 === 0;

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: SCREEN.w * U, height: SCREEN.h * U, transform: `scale(${mix(0.94, 1, pop)})`, opacity: pop }}>
          <Screen w={SCREEN.w * U} h={SCREEN.h * U} draw={pop} fill={fill} clear={clear} />
          {['day', 'hosts', 'ads'].map((id) => (
            <Fragment key={id} id={id} f={f} from={ACT.statement.from} punchAt={copy(id).in} />
          ))}
          {['chip1', 'chip2', 'chip3'].map((id) => (
            <Chip key={id} id={id} f={f} from={ACT.statement.from} />
          ))}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            ...typeStyle('ui', 34 * U),
            fontFamily: '"Geist Mono Variable", monospace',
            color: C.white,
            opacity: 1 - prog(f, L1(CUE.run) + f60(16), L1(CUE.run) + f60(30), E.in),
            transform: `translateY(${mix(0, -300, lineUp) * U}px) scale(${mix(1, 0.62, lineUp)})`,
          }}
        >
          <span style={{ opacity: 0.45 }}>$ </span>
          {cmd.text.slice(0, typed)}
          <span style={{ opacity: blink || typed < cmd.text.length ? 1 : 0 }}>▌</span>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ backgroundColor: C.white, opacity: ran * (1 - prog(f, L1(CUE.run) + f60(4), L1(CUE.run) + f60(16), E.in)) * 0.9 }} />
    </AbsoluteFill>
  );
};
