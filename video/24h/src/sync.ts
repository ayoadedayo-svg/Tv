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

/** The film's sound, computed from the same constants the picture animates with. */
export default function cues(): SoundEvent[] {
  const ev: SoundEvent[] = [];

  // One soft text sound per fragment, on the frame its last word comes to rest.
  for (const id of ['day', 'strangers', 'fixes', 'stars', 'ads', 'shorts', 'yours']) {
    ev.push({ f: copy(id).resolved, kind: 'text', weight: 0.9, pan: 0, id });
  }

  // The screen drawing itself: one whoosh across the move, apex at its mid-point.
  ev.push({ f: CUE.open + f60(27), kind: 'whoosh', weight: 0.6, pan: 0, dur: f60(54), apexFrac: 0.5, id: 'screen-draw' });

  // The tiles leaving: one tick per column, travelling left to right with the wipe.
  for (let i = 0; i < 12; i++) {
    const f = CUE.strangers + Math.round((i / 12) * (CUE.settle - CUE.strangers));
    ev.push({ f, kind: 'tick', weight: 0.45, pan: -0.6 + (i / 11) * 1.2, id: `tile-${i}` });
  }

  // The screen becomes the viewer's: one landing, then the lockup hit and the wordmark bell.
  ev.push({ f: CUE.settle, kind: 'land', weight: 1.9, pan: 0, id: 'screen-empty' });
  ev.push({ f: CUE.yours + f60(4), kind: 'land', weight: 0.8, pan: 0, id: 'flood' });
  ev.push({ f: CUE.lockup, kind: 'hit', weight: 0.25, pan: 0, id: 'lockup' });
  ev.push({ f: copy('wordmark').resolved, kind: 'bell', weight: 0.35, pan: 0, id: 'wordmark' });

  for (const e of ev) {
    if (!(e.f >= 0 && e.f < TOTAL)) throw new Error(`sync: ${e.id} at f=${e.f} is outside the film (0..${TOTAL - 1})`);
    e.id = `${actOf(e.f)}:${e.id}`;
  }
  return ev;
}
