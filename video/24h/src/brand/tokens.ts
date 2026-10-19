// Brand tokens: the only place a colour, face or type size is written down. Acts import these;
// scripts/lint-film.mjs fails any hex colour that is not declared here.
//
import type React from 'react';
import { safeInsets } from '../lib/safe';
import { H, W } from '../timeline';

export const C = {
  ink: '#0A0B0D', // the stage: a dark room with one screen in it
  ink2: '#14161A', // the bloat blocks sitting on the screen
  paper: '#F4F5F7', // the light surface, for stills and the brand kit
  mist: '#E7E9EC', // soft panels on paper
  line: '#2A2E36', // hairlines on ink
  tile: '#3A404A', // a tile's edge: just enough to read as content
  // The four muted fills of the tiles: borrowed colours of app icons, quiet enough that they read
  // as someone else's content rather than as the film's own palette.
  t1: '#243B6B',
  t2: '#25313C',
  t3: '#1F4640',
  t4: '#4A2B2B',
  mute: '#8A9099', // secondary text on ink
  white: '#FFFFFF',
  // The one accent, and what it means: "yours". It arrives only on the TV that is now the
  // viewer's, floods the screen exactly once, and is gone before the wordmark. Under 8% of the
  // frame everywhere else.
  accent: '#2A49FF',
};

export const FONT = {
  text: '"Geist Variable", "Geist", system-ui, sans-serif', // the film's one sans, for every role; typeStyle and measure.ts read it
  mono: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
};

/** Faces the FontGate waits for before anything renders or measures (one entry per weight in use). */
export const FACES = ['400 16px "Geist Variable"', '600 16px "Geist Variable"', '400 16px "Geist Mono Variable"'];

/** Layout unit: 1 at 1080p, scales every size with the short side of the frame (16:9, 9:16, 1:1). */
export const U = Math.min(W, H) / 1080;

// One token per role, reused everywhere, so nothing is "almost matched" (size in px at 1080p).
export const TYPE = {
  display: { size: 120, weight: 600, track: -0.045, lead: 1.0 }, // statements and the wordmark
  line: { size: 64, weight: 500, track: -0.025, lead: 1.1 }, // fragment chains (fx/Chain): a quiet line in open space, up to ~8 words
  secondary: { size: 48, weight: 450, track: -0.02, lead: 1.15 }, // descriptor lines, URLs
  ui: { size: 24, weight: 500, track: -0.01, lead: 1.3 }, // smallest readable size on screen
};

/** CSS for a type role at a size (px). Tabular figures always, so numbers never jitter in width. */
export const typeStyle = (role: keyof typeof TYPE, size = TYPE[role].size * U): React.CSSProperties => ({
  fontFamily: FONT.text,
  fontSize: size,
  fontWeight: TYPE[role].weight,
  letterSpacing: `${TYPE[role].track}em`,
  lineHeight: TYPE[role].lead,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'pre',
});

/**
 * Safe margins for a w x h frame as a symmetric envelope: the larger inset of each pair from the
 * frame's safe-zone preset (src/lib/safe.ts), so a centred layout that fits inside clears every
 * side. 96 x 64 px at 1920x1080; 120 x 420 at 1080x1920, where the feed zones are asymmetric
 * (use safeBox() from lib/safe.ts there to centre on the clear band instead of the frame).
 */
export const safeArea = (w: number, h: number) => {
  const i = safeInsets(undefined, w, h);
  return { x: Math.max(i.left, i.right), y: Math.max(i.top, i.bottom) };
};
/** The film's safe margins; text stays inside them (scripts/layout-audit.sh checks). */
export const SAFE = safeArea(W, H);
