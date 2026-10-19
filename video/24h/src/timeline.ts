// The single source of truth for time. Picture (src/acts), sound (src/sync.ts -> out/cues.json)
// and QA (scripts/grid-check.ts) all import this file, so a change here moves everything together.
// Think in bars and beats, never in seconds. Keep this file free of React and CSS imports:
// Node scripts load it directly.
import { holdFor, PACE, readingWindows, revealFor, wordCount, type PaceName } from './lib/pace';

export { PACE } from './lib/pace';

export const FPS = 60;
export const BPM = 100;
export const W = 1920;
export const H = 1080;
export const PACE_NAME: PaceName = 'crisp';

/** Frames per beat. Must be a whole number (grid-check fails otherwise). */
export const BEAT = (60 / BPM) * FPS;
export const BAR = BEAT * 4;
/** Absolute frame of a grid position: bar is 1-based, beat 0-3, sub = 16ths within the beat. */
export const b = (bar: number, beat = 0, sub = 0) => Math.round(((bar - 1) * 4 + beat) * BEAT + sub * (BEAT / 4));

/** A choreography length written in 60 fps frames, converted to this film's fps. */
export const f60 = (frames: number) => Math.round((frames * FPS) / 60);

/** After the last bar the picture holds while the audio decays to digital silence. */
export const TAIL = FPS;

// Acts: contiguous, bar-aligned, [from, from + dur). Each act is its own composition in Root.tsx.
export const ACT = {
  statement: { from: b(1), dur: b(5) - b(1) }, // the day, the people, and what they changed
  mark: { from: b(5), dur: b(9) + TAIL - b(5) }, // what is left, and the lockup
};

export const TOTAL = b(9) + TAIL;

// Named sync points (absolute frames), all on the 16th grid.
export const CUE = {
  open: b(1), // the screen draws itself
  day: b(1, 0, 3), // "24 hours."
  strangers: b(2), // "six strangers."
  fixes: b(3), // "six fixes."
  stars: b(4), // "309 stars."
  settle: b(4, 3), // the last tiles leave: the picture beat under the quiet
  ads: b(5), // "no ads."
  shorts: b(6), // "no shorts."
  yours: b(7), // "your tv."
  lockup: b(8), // the wordmark
  end: b(9), // hold
};

export type Copy = {
  id: string;
  text: string;
  in: number;
  resolved: number;
  out: number;
  kind?: 'copy' | 'ui';
  chain?: string;
  mode?: 'build' | 'replace';
};

const pace = PACE[PACE_NAME];

/** One fragment revealed word by word, resolved frames and hold from this film's pace. */
export const line = (id: string, text: string, inF: number, out?: number): Copy => {
  const n = wordCount(text);
  const resolved = inF + f60(revealFor(n, pace));
  return { id, text, in: inF, resolved, out: out ?? resolved + f60(holdFor(n, pace)) };
};

/** Every on-screen word. Fragments are 2 words; the wordmark and URL are `ui`, counted apart. */
export const COPY: Copy[] = [
  line('day', '24 hours.', CUE.day, CUE.strangers - f60(30)),
  line('strangers', 'six strangers.', CUE.strangers, CUE.fixes - f60(30)),
  line('fixes', 'six fixes.', CUE.fixes, CUE.stars - f60(30)),
  line('stars', '309 stars.', CUE.stars, CUE.stars + f60(80)),
  line('ads', 'no ads.', CUE.ads, CUE.shorts - f60(30)),
  line('shorts', 'no shorts.', CUE.shorts, CUE.yours - f60(30)),
  line('yours', 'your tv.', CUE.yours, CUE.lockup - f60(30)),
  { id: 'wordmark', text: 'dumbtv', kind: 'ui', in: CUE.lockup, resolved: CUE.lockup + f60(28), out: TOTAL },
  { id: 'url', text: 'github.com/humblemuzzu/dumbtv', kind: 'ui', in: CUE.lockup + f60(30), resolved: CUE.lockup + f60(46), out: TOTAL },
];

/** The reading windows of every COPY entry, for grid-check and the QA scripts. */
export const READ = readingWindows(COPY, pace, FPS, TOTAL);

export const copy = (id: string): Copy => {
  const c = COPY.find((x) => x.id === id);
  if (!c) throw new Error(`timeline: no COPY entry "${id}"`);
  return c;
};

export const chainOf = (id: string): Copy[] => COPY.filter((c) => c.chain === id);
