import { ACT, copy, CUE, f60, TOTAL } from './timeline';

export type SoundEvent = {
  f: number;
  kind: string;
  weight?: number;
  pan?: number;
  id?: string;
  variant?: string;
  dur?: number;
  apexFrac?: number;
};

const actOf = (f: number) => Object.entries(ACT).find(([, a]) => f >= a.from && f < a.from + a.dur)?.[0] ?? 'tail';

/** Varied on purpose: keys for the command, a hit for the run, ticks for chips, pops for ties. */
export default function cues(): SoundEvent[] {
  const ev: SoundEvent[] = [];

  // The command types itself: keys on a 3-frame stagger, thinning out.
  for (let i = 0; i < 9; i++) {
    const f = CUE.hook + f60(4) + i * f60(5);
    ev.push({ f, kind: 'key', weight: 0.5, pan: -0.15, variant: i === 8 ? 'return' : undefined, id: `type-${i}` });
  }
  ev.push({ f: CUE.run, kind: 'hit', weight: 1.1, pan: 0, id: 'run' });
  ev.push({ f: CUE.run + f60(4), kind: 'whoosh', weight: 0.7, pan: 0, dur: f60(18), apexFrac: 0.5, id: 'screen-in' });

  // One soft text sound per fragment, on its last word coming to rest.
  for (const id of ['day', 'hosts', 'ads', 'shorts', 'fixes', 'stars', 'yours']) {
    ev.push({ f: copy(id).resolved, kind: 'text', weight: 0.85, pan: 0, id });
  }

  // The evidence pills: a crisp tick for each, panned by where they sit.
  ['chip1', 'chip2', 'chip3', 'chip4', 'chip5', 'chip6'].forEach((id, i) => {
    ev.push({ f: copy(id).resolved, kind: i % 2 === 0 ? 'tick' : 'tock', weight: 0.6, pan: -0.25 + (i % 3) * 0.25, variant: 'crisp', id });
  });

  // The flash and the flood, then the lockup: a snap, a landing, one struck note.
  ev.push({ f: CUE.flash, kind: 'snap', weight: 0.9, pan: 0, id: 'flash' });
  ev.push({ f: CUE.yours + f60(4), kind: 'land', weight: 0.9, pan: 0, id: 'flood' });
  ev.push({ f: CUE.lockup, kind: 'hit', weight: 0.55, pan: 0, id: 'lockup' });
  ev.push({ f: copy('wordmark').resolved, kind: 'bell', weight: 0.4, pan: 0, id: 'wordmark' });
  ev.push({ f: copy('url').resolved, kind: 'click', weight: 0.35, pan: 0, variant: 'confirm', id: 'url' });

  for (const e of ev) {
    if (!(e.f >= 0 && e.f < TOTAL)) throw new Error(`sync: ${e.id} at f=${e.f} is outside the film (0..${TOTAL - 1})`);
    e.id = `${actOf(e.f)}:${e.id}`;
  }
  return ev;
}
