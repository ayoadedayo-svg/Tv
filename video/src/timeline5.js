// 20.000 s = 600 frames at 30 fps, 120 BPM. Ten bars of 60 frames; cuts subdivided inside them.
export const DUR5 = 20.0;
export const FPS5 = 30;
export const BPM5 = 120;

// start frame, length, kind - only three lengths exist (45, 60, 75, 90) plus the 15-frame snap
export const SHOTS5 = [
  { f: 0, n: 45, kind: 'wall', copy: 'This is running on your TV.', copyAt: 10 },
  { f: 45, n: 60, kind: 'wallcount' },
  { f: 105, n: 45, kind: 'big', copy: 'You installed three.' },
  { f: 150, n: 45, kind: 'term' },
  { f: 195, n: 90, kind: 'output' },
  { f: 285, n: 60, kind: 'verify' },
  { f: 345, n: 15, kind: 'snap', copy: 'It fixes YouTube too.' },
  { f: 360, n: 75, kind: 'switch' },
  { f: 435, n: 60, kind: 'home', copy: "That's the whole home screen.", copyAt: 450 },
  { f: 495, n: 60, kind: 'claim' },
  { f: 555, n: 45, kind: 'end' },
];

// the real output of the real script, transcribed from a run on the TV
export const VERIFY = [
  ['', 'host', 'result'],
  ['----------', '--------------------------------------', '----------------------'],
  ['ok', 'softwareupdates.amazon.com', 'blocked'],
  ['ok', 'arcus-uswest.amazon.com', 'blocked'],
  ['ok', 'unagi-zaz.amazon.com', 'blocked'],
  ['ok', 'unagi-na.amazon.com', 'blocked'],
  ['ok', 'api.amazonalexa.com', 'blocked'],
  ['ok', 'device-messaging-na.amazon.com', 'blocked'],
  ['ok', 'www.youtube.com', 'resolves'],
  ['ok', 'i.ytimg.com', 'resolves'],
  ['ok', 'appstore-tv-prod-na.amazon.com', 'resolves'],
  ['ok', 'm.media-amazon.com', 'resolves'],
  ['ok', 'packages', '65 disabled'],
];

export const TERM = [
  '$ ./scripts/all.sh',
  '',
  '  packages      65 disabled',
  '  protected     6 background denied',
  '  filter        396 entries',
  '  vpn           dnsfilter.android',
  '  home          armed, front is dumbtv home',
];

export const TYPE_AT = [150, 154, 158, 162, 166, 170, 174]; // keystroke cue frames for the score
