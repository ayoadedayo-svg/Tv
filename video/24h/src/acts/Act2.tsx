import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, U, typeStyle } from '../brand/tokens';
import { Words } from '../fx/Words';
import { E, prog } from '../lib/anim';
import { ACT, copy, CUE, f60 } from '../timeline';
import { Chip, Fragment, punch } from './Act1';
import { Screen, SCREEN } from './Screen';

// ACT 2 - the television is empty, one flash as it becomes the viewer's, then the lockup.

const L = (a: number) => a - ACT.mark.from;

export const Act2: React.FC = () => {
  const f = useCurrentFrame();

  const flashIn = prog(f, L(CUE.flash) - f60(2), L(CUE.flash) + f60(2), E.out);
  const flashOut = prog(f, L(CUE.flash) + f60(2), L(CUE.flash) + f60(16), E.in);
  const white = flashIn * (1 - flashOut);

  const floodIn = prog(f, L(CUE.yours) + f60(4), L(CUE.yours) + f60(20), E.inOut);
  const floodOut = prog(f, L(CUE.lockup) - f60(30), L(CUE.lockup) - f60(6), E.in);
  const accent = floodIn * (1 - floodOut);

  const fade = 1 - prog(f, L(CUE.lockup) - f60(8), L(CUE.lockup) + f60(8), E.in);
  const rule = prog(f, L(CUE.lockup) + f60(2), L(CUE.lockup) + f60(34), E.inOut);
  const mark = prog(f, L(CUE.lockup) + f60(8), L(CUE.lockup) + f60(42), E.out);

  const word = copy('wordmark');
  const url = copy('url');
  const wordScale = punch(f, word.in, 0.04);

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: SCREEN.w * U, height: SCREEN.h * U }}>
        <Screen w={SCREEN.w * U} h={SCREEN.h * U} draw={1} fill={1} clear={1} accent={accent} fade={fade} />
        {['shorts', 'fixes', 'stars', 'yours'].map((id) => (
          <Fragment key={id} id={id} f={f} from={ACT.mark.from} punchAt={copy(id).in} />
        ))}
        {['chip4', 'chip5', 'chip6'].map((id) => (
          <Chip key={id} id={id} f={f} from={ACT.mark.from} />
        ))}
      </div>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 * U, transform: `scale(${wordScale})` }}>
          <Words id="wordmark" text={word.text} frame={f} start={L(word.in)} size={236 * U} style={{ ...typeStyle('display', 236 * U), color: C.white }} />
        </div>
        <div style={{ width: 880 * U * rule, height: 3 * U, marginTop: 30 * U, background: C.white, opacity: 0.5 }} />
        <div style={{ marginTop: 26 * U, opacity: mark }}>
          <Words id="url" text={url.text} frame={f} start={L(url.in)} size={27 * U} style={{ ...typeStyle('ui', 27 * U), fontFamily: '"Geist Mono Variable", monospace', color: C.mute }} />
        </div>
      </div>

      <AbsoluteFill style={{ backgroundColor: C.white, opacity: white }} />
    </AbsoluteFill>
  );
};
