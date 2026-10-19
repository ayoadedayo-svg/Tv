// Today's film. Same engine as the launch cut, new content, faster and louder.
export const W3 = 1920;
export const H3 = 1080;
export const FPS3 = 30;
export const BPM3 = 126;
export const BEAT3 = 60 / BPM3; // 0.476 s
export const BAR3 = BEAT3 * 4; // 1.905 s
export const DUR3 = 18.6;

export const PLATES3 = {
  ink: { a: '#0A0B0D', b: '#14161C', ink: '#F7F1E4', arc: '#2A49FF' },
  cobalt: { a: '#2A49FF', b: '#1027B8', ink: '#F7F1E4', arc: '#FF5A3C' },
  coral: { a: '#FF5A3C', b: '#DA2E12', ink: '#0A0B0D', arc: '#2A49FF' },
  acid: { a: '#E8FF4A', b: '#BFD900', ink: '#0A0B0D', arc: '#0A0B0D' },
  mint: { a: '#5BF0B0', b: '#12B47A', ink: '#0A0B0D', arc: '#2A49FF' },
  cream: { a: '#F7F1E4', b: '#E6D8C0', ink: '#0A0B0D', arc: '#FF5A3C' },
};

// The cuts. Every one is a beat: the score lands on these times.
export const SHOTS3 = [
  { t: 0.0, kind: 'bars' },
  { t: 0.32, kind: 'word', text: '24 HOURS.', plate: 'ink', size: 214 },
  { t: 1.9, kind: 'stars', plate: 'cobalt' },
  { t: 3.4, kind: 'word', text: '6 FIXES.', plate: 'acid', size: 226, sub: '6 pull requests' },
  { t: 4.9, kind: 'word', text: 'NO ADS.', plate: 'coral', size: 250 },
  { t: 6.4, kind: 'word', text: 'NO SHORTS.', plate: 'mint', size: 232 },
  { t: 7.9, kind: 'two', a: 'YOUTUBE.', b: 'REPLACED.', plate: 'cream' },
  { t: 9.4, kind: 'hosts', plate: 'ink' },
  { t: 10.9, kind: 'word', text: 'YOUR TV.', plate: 'cobalt', size: 250, sub: 'ten minutes, no root' },
  { t: 12.4, kind: 'lockup' },
  { t: 15.4, kind: 'mark' },
];

export const CUTS3 = SHOTS3.map((s) => s.t);
