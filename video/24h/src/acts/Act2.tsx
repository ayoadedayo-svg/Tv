import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, TYPE, U, typeStyle } from '../brand/tokens';
import { Words } from '../fx/Words';
import { E, prog } from '../lib/anim';
import { ACT, copy, CUE, f60 } from '../timeline';
import { Fragment } from './Act1';
import { Screen, SCREEN } from './Screen';

// ACT 2 - the screen is empty. One accent flood when it becomes the viewer's, then the object
// collapses into the rule under the wordmark.

const L = (a: number) => a - ACT.mark.from;

export const Act2: React.FC = () => {
  const f = useCurrentFrame();

  const floodIn = prog(f, L(CUE.yours) - f60(4), L(CUE.yours) + f60(16), E.inOut);
  const floodOut = prog(f, L(CUE.lockup) - f60(34), L(CUE.lockup) - f60(6), E.in);
  const accent = floodIn * (1 - floodOut);

  const fade = 1 - prog(f, L(CUE.lockup) - f60(8), L(CUE.lockup) + f60(8), E.in);
  const rule = prog(f, L(CUE.lockup) + f60(2), L(CUE.lockup) + f60(38), E.inOut);
  const mark = prog(f, L(CUE.lockup) + f60(10), L(CUE.lockup) + f60(46), E.out);

  const word = copy('wordmark');
  const url = copy('url');

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: SCREEN.w * U, height: SCREEN.h * U }}>
        <Screen w={SCREEN.w * U} h={SCREEN.h * U} draw={1} fill={1} clear={1} accent={accent} fade={fade} />
        {['ads', 'shorts', 'yours'].map((id) => (
          <Fragment key={id} id={id} f={f} from={ACT.mark.from} ink={C.white} />
        ))}
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: TYPE.display.size * U, opacity: rule > 0 ? 1 : 0 }}>
          <Words
            id="wordmark"
            text={word.text}
            frame={f}
            start={L(word.in)}
            size={236 * U}
            style={{ ...typeStyle('display', 236 * U), color: C.white }}
          />
        </div>
        <div style={{ width: 880 * U * rule, height: 3 * U, marginTop: 30 * U, background: C.white, opacity: 0.5 }} />
        <div style={{ marginTop: 26 * U, opacity: mark, ...typeStyle('ui', 27 * U), fontFamily: '"Geist Mono Variable", monospace', color: C.mute }}>
          <Words id="url" text={url.text} frame={f} start={L(url.in)} size={27 * U} style={{ fontFamily: '"Geist Mono Variable", monospace' }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
