# Optional performance measurements

`tools/perflab/perflab.py` runs on the computer with Python 3.10+ and `adb`.
It is not part of `all.sh`, does not change TV settings, and does not install
anything. Its parsers were developed against a TCL G08 running Android 14;
other Android/Fire OS builds may expose different or unavailable metrics.

Select the exact endpoint shown by `adb devices -l` using `--serial` or
`ADB_SERIAL`. The tool never falls back to another device, pairs, reconnects,
or approves authorization prompts for you.

## Read-only snapshots

```sh
python3 tools/perflab/perflab.py --serial "$ADB_SERIAL" snapshot before
# Make one deliberate change, then recreate the same app/menu/playback workload.
python3 tools/perflab/perflab.py --serial "$ADB_SERIAL" snapshot after
python3 tools/perflab/perflab.py compare report/perflab/<before>.json report/perflab/<after>.json
```

A snapshot reads memory/swap, foreground and playing app packages, CPU,
temperature and process memory. It typically takes about 40 seconds. Reads
still add some load: the expensive `dumpsys meminfo` runs after the CPU window.
The first toybox `top` frame is a short warm-up and is excluded; the next two
five-second frames are averaged. CPU usage is per core (100% = one core), and
the number of cores is read from the TV rather than assumed to be four.

Missing memory/thermal values are unknown, not zero. A command failure stops
the collection. The output warns when app/playback context differs between
reports or changes within a snapshot. Matching those fields still does not
prove identical workloads: use the same show/menu, wait for downloads and
updates to finish, and repeat measurements. Lower memory use alone is not
proof of a faster TV; cached apps can reduce subsequent launch time.

Reports go in ignored `report/perflab/`. Structured snapshots omit device
addresses and media titles. `snapshot --save-raw` additionally saves diagnostic
dumps, which can contain private information. Keep those local and review even
structured reports before sharing them; package lists and user-supplied labels
can reveal personal information.

## Visible responsiveness trials

Only run this when nobody is watching. It sends directional keys to the TV:

```sh
python3 tools/perflab/perflab.py --serial "$ADB_SERIAL" latency menu \
  --i-know-nobody-is-watching --key DOWN --trials 5
```

The flag is required. The tool refuses while the TV sleeps or reports active
playback/buffering, and stops if the foreground app changes. It rechecks before
each key. Media-session reporting is incomplete in some apps, so these checks
cannot replace the operator's confirmation. A foreground session with missing
state, or an unreadable media-session dump, blocks the trial.

Only UP/DOWN/LEFT/RIGHT are accepted. Each press is followed by the opposite
direction by default. This often returns focus, but does not guarantee an exact
navigation rollback. `--no-return` disables that return press. `--app <package>`
also opens the app, which is a visible action and can trigger autoplay; if that
happens the trial stops without pressing keys. It does not close the app again.

The default method uses input-tagged Android frames when available. On this
TCL, YouTube TV's Cobalt renderer produced almost no useful `gfxinfo` frames,
so the fallback uses SurfaceFlinger presentation timestamps on a previously
still surface. A continuously animating surface without an input-tagged frame
is **unmeasured**, not a dropped key. This is an estimate, not a hardware
input-latency measurement. `--method screencap` uses screenshot hashes and is
much coarser; protected video can render black. Measure menus, not video.

Results distinguish first-response/settling times, no visible change, and
unmeasured trials. They do not establish a cleanup speedup unless the before
and after runs use comparable conditions.

## Validation and provenance

The original tool collected real TCL snapshots and a YouTube TV menu trial.
This portable extraction is covered by offline fixture and fake-ADB tests;
it has not been rerun on the TV or validated on other hardware. No before/after
improvement is claimed from the original session because workloads differed.

Run `python3 -m unittest discover -s tests -v`. Fixtures are reduced diagnostic
samples from that session with device endpoints and viewing titles replaced,
plus synthetic failure cases. No tests contact a TV.
