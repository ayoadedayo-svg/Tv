// The 24-hour film: real screenshots from the TV, cut on the score's own hits.
export const DUR4 = 18.6;
export const BPM4 = 126;

// Cut times are the score's stab times, so every cut lands on a hit.
export const CUT4 = [0.0, 0.32, 1.9, 3.4, 4.9, 6.4, 7.9, 9.4, 10.9, 12.4, 15.4];

export const SHOTS4 = [
  { t: 0.0, kind: 'black' },
  { t: 0.32, kind: 'line', text: 'in 24 hours,', plate: 'ink' },
  { t: 1.9, kind: 'line', text: 'six strangers', plate: 'cobalt' },
  { t: 3.4, kind: 'photo', img: 'launcher', caption: 'a home screen with nothing to sell', chips: ['no amazon home', '41 kb'] },
  { t: 4.9, kind: 'photo', img: 'shorts', caption: 'shorts, switched off everywhere', chips: ['hide shorts everywhere', 'one tick'] },
  { t: 6.4, kind: 'line', text: 'fixed six bugs.', plate: 'acid' },
  { t: 7.9, kind: 'proof', plate: 'ink' },
  { t: 9.4, kind: 'photo', img: 'smarttube', caption: 'youtube, without the ads', chips: ['no ads', 'no shorts'] },
  { t: 10.9, kind: 'line', text: 'your tv.', plate: 'coral' },
  { t: 12.4, kind: 'lockup' },
  { t: 15.4, kind: 'mark' },
];
