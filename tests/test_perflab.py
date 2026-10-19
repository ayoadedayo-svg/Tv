"""Tests for the performance lab's parsing, math and safety gates (no TV needed).

Fixtures in fixtures/ were captured once from the TV with read-only commands
on 10/18 while YouTube TV played; show and song titles were replaced.
"""

import subprocess
import json
import tempfile
import argparse
import unittest
from pathlib import Path
from unittest import mock

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools/perflab"))
import perflab as p

FIX = Path(__file__).resolve().parents[1] / "tools/perflab/fixtures"
YTTV = "com.google.android.youtube.tvunplugged"


def fx(name: str) -> str:
    return (FIX / name).read_text()


def raw_snapshot() -> dict:
    names = ["meminfo", "activities", "media_session", "thermal", "loadavg",
             "stat_before", "top", "stat_after", "dumpsys_meminfo"]
    return {"cores": "4", **{n: fx(f"{n}.txt") for n in names}}


class Parsing(unittest.TestCase):
    def test_meminfo(self):
        m = p.parse_meminfo(fx("meminfo.txt"))
        self.assertEqual(m["MemTotal"], 2451268)
        self.assertIn("Active(anon)", m)

    def test_pss_top15(self):
        rows = p.parse_pss(fx("dumpsys_meminfo.txt"))
        self.assertEqual(len(rows), 15)
        self.assertEqual(rows[0]["name"], YTTV)
        self.assertGreater(rows[0]["mb"], rows[1]["mb"])

    def test_meminfo_summary(self):
        s = p.parse_meminfo_summary(fx("dumpsys_meminfo.txt"))
        self.assertLess(s["lost_ram_mb"], 0)  # negative on this TV; must still parse
        for key in ("free_ram_mb", "used_ram_mb", "gpu_mb", "zram_physical_mb", "zram_in_swap_mb"):
            self.assertIn(key, s)

    def test_top_skips_warmup_frame_and_itself(self):
        frames = p.parse_top(fx("top.txt"))
        self.assertEqual(len(frames), 3)
        rows = p.cpu_per_process(frames)
        self.assertEqual(rows[0]["name"], YTTV)
        self.assertFalse(any(r["name"] == "top" for r in rows))
        self.assertTrue(any(r["name"].startswith("[") for r in rows))  # kernel threads keep brackets

    def test_top_ignores_process_whose_args_mention_cpu(self):
        text = ("Tasks: 1 total\n  PID USER PR NI VIRT RES SHR S[%CPU] %MEM TIME+ ARGS\n"
                "  1 root 20 0 1M 1M 1M S 5.0 0.1 0:01.00 init\n"
                "  9 shell 20 0 1M 1M 1M S 1.0 0.1 0:00.30 sh -c ps -o PID,%CPU\n")
        self.assertEqual(p.parse_top(text)[0], {(1, "init"): 5.0, (9, "sh"): 1.0})

    def test_idle(self):
        before, after = p.parse_proc_stat(fx("stat_before.txt")), p.parse_proc_stat(fx("stat_after.txt"))
        self.assertAlmostEqual(p.idle_pct(before, after), 7.7, places=1)

    def test_thermal(self):
        t = p.parse_thermal(fx("thermal.txt"))
        self.assertEqual(t["status"], 0)
        self.assertEqual(t["temps_c"]["CPU"], 75.0)  # the HAL's current value, not the cached one

    def test_foreground_and_playing(self):
        self.assertEqual(p.parse_foreground(fx("activities.txt")), "com.google.android.apps.tv.launcherx")
        sessions = p.parse_sessions(fx("media_session.txt"))
        self.assertEqual(p.playing(sessions), [YTTV])  # Bluetooth ERROR and Spotify NONE don't count
        self.assertEqual(sessions[0]["title"], "Sample Game, Sample Network, null")

    def test_power_clock(self):
        pw = p.parse_power(fx("power.txt"))
        self.assertEqual(pw["wakefulness"], "Awake")
        self.assertEqual(pw["last_activity_ms"], 30078827)
        self.assertEqual(pw["now_ms"], 30078827 + 745965)

    def test_layers_for_cobalt(self):
        names = p.layer_candidates(fx("sf_list.txt"), YTTV)
        self.assertTrue(any("(BLAST)" in n for n in names))
        self.assertFalse(any("Media:" in n or "Background for" in n for n in names))  # video planes skipped

    def test_sf_latency(self):
        period, frames = p.parse_sf_latency(fx("sf_latency_yttv.txt"))
        self.assertEqual(period, 16666666)
        self.assertEqual(len(frames), 127)
        self.assertTrue(all(d <= a for d, a, _ in frames))  # shown no earlier than wanted
        self.assertEqual(p.parse_sf_latency("16666666\n0\t0\t0\n1\t9223372036854775807\t1\n"), (16666666, []))

    def test_snapshot_record(self):
        d = p.build_snapshot(raw_snapshot())
        self.assertEqual(d["memory"]["available_mb"], 713)
        self.assertEqual(d["memory"]["swap_used_mb"], 436)
        self.assertEqual(d["cpu"]["top"][0]["pct_of_core"], 119.0)
        self.assertEqual(d["thermal"]["cpu_c"], 75.0)
        self.assertEqual(len(d["pss_top"]), 15)


class LatencyMath(unittest.TestCase):
    LAYER = "SurfaceView[x/y](BLAST)#1"

    def sf_output(self):
        ms = 1_000_000
        before = [(1400 * ms, 1430 * ms, 1410 * ms)]
        after = before + [(1600 * ms, 1640 * ms, 1610 * ms), (1700 * ms, 1740 * ms, 1710 * ms),
                          (2000 * ms, 2050 * ms, 2010 * ms)]
        rows = lambda fr: "16666666\n" + "".join(f"{d}\t{a}\t{r}\n" for d, a, r in fr)  # noqa: E731
        out = (f"@L {self.LAYER}\n{rows(before)}"
               "@P0   lastUserActivityTime=1000 (500 ms ago)\n@T0 5000000000\n"
               f"@L {self.LAYER}\n{rows(after)}"
               "@P1   lastUserActivityTime=1520 (2900 ms ago)\n")
        return out, "@T1 5080000000\n"

    def test_frame_trial_cobalt_style(self):
        t = p.parse_frame_trial(*self.sf_output(), "KEYCODE_DPAD_DOWN", 3.0)
        self.assertEqual((t["key_time"], t["source"]), ("key-event", "sf"))
        self.assertEqual(t["first_ms"], 120.0)    # 1640 - 1520
        self.assertEqual(t["settled_ms"], 530.0)  # 2050 - 1520
        self.assertEqual(t["frames"], 3)          # duplicates across dumps merged
        self.assertEqual(t["input_cmd_ms"], 80)
        self.assertFalse(t["busy"])

    def test_input_frame_from_real_launcher_capture(self):
        rows = p.parse_framestats(fx("gfxinfo_launcher.txt"))
        self.assertEqual(sum(1 for r in rows if r["InputEventId"]), 4)  # earlier real remote presses
        hit = p.input_response(rows, key_ms=5625600, window_s=3.0)
        self.assertEqual(hit, {"first_ms": 96.4, "handled_ms": 64.3})

    def test_busy_screen(self):
        ms = 1_000_000
        animating = [(t * ms, t * ms + 30 * ms, t * ms + 10 * ms) for t in range(0, 4000, 17)]  # 60 fps
        r = p.frame_response(animating, [], key_ms=2000, window_s=1.5)
        self.assertFalse(r["measured"])  # a new frame on a moving screen proves nothing
        tagged = [{"IntendedVsync": 2100 * ms, "InputEventId": 7, "HandleInputStart": 2105 * ms,
                   "FrameCompleted": 2130 * ms, "DisplayPresentTime": 2150 * ms}]
        r = p.frame_response(animating, tagged, key_ms=2000, window_s=1.5)
        self.assertEqual((r["source"], r["first_ms"], r["handled_ms"], r["settled_ms"]),
                         ("input-frame", 150.0, 105.0, None))

    def test_key_time_falls_back_when_press_not_recorded(self):
        before = {"now_ms": 1500, "last_activity_ms": 1000}
        self.assertEqual(p.key_time_ms(before, {"last_activity_ms": 1000}), (1500, "clock-before-input"))

    def test_sf_no_response(self):
        r = p.sf_response([(1, 2, 1)], key_ms=1000, window_s=3)
        self.assertFalse(r["responded"])

    def test_capture_trial(self):
        out = ("@B 1 2 aaa\n@B 3 4 aaa\n@T0 1000000000\n"
               "@C 1050000000 1250000000 aaa\n@C 1260000000 1460000000 aaa\n"
               "@C 1470000000 1670000000 bbb\n@C 1680000000 1880000000 ccc\n"
               "@C 1890000000 2090000000 ccc\n")
        t = p.parse_capture_trial(out, "KEYCODE_DPAD_DOWN")
        self.assertEqual(t["first_ms"], 365.0)    # between the last unchanged and first changed grab
        self.assertEqual(t["settled_ms"], 680.0)
        self.assertEqual(t["capture_ms"], 200)
        self.assertFalse(t["busy"])
        self.assertFalse(t["still_drawing"])

    def test_summary(self):
        trials = [{"key": "DOWN", "responded": True, "first_ms": v, "settled_ms": v * 2, "busy": False}
                  for v in (100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)]
        trials.append({"key": "DOWN", "responded": False, "first_ms": None, "settled_ms": None, "busy": False})
        trials.append({"key": "DOWN", "responded": False, "measured": False, "first_ms": None,
                       "settled_ms": None, "busy": True})
        s = p.summarize(trials)["DOWN"]
        self.assertEqual((s["n"], s["no_change"], s["unmeasured"], s["busy_before"]), (12, 1, 1, 1))
        self.assertEqual(s["first_median_ms"], 550)
        self.assertEqual(s["first_p90_ms"], 900)


class Compare(unittest.TestCase):
    def test_snapshot_deltas(self):
        a = {"kind": "snapshot", **p.build_snapshot(raw_snapshot())}
        b = {"kind": "snapshot", **p.build_snapshot(raw_snapshot())}
        b["memory"]["available_mb"] += 200
        rows = {r[0]: r for r in p.compare_rows(a, b)}
        name, va, vb, better = rows["memory available MB"]
        self.assertEqual((vb - va, better), (200, "up"))

    def test_kinds_must_match(self):
        with self.assertRaises(ValueError):
            p.compare_rows({"kind": "snapshot"}, {"kind": "latency"})


class FakeAdb:
    """Stands in for subprocess.run with the fixture outputs (YouTube TV playing)."""

    def __init__(self):
        self.calls = []

    def __call__(self, cmd, **kw):
        self.calls.append(cmd)
        script = cmd[-1]
        if cmd[1:] == ["devices", "-l"]:
            out = fx("devices.txt")
        elif script == "getprop ro.build.version.sdk":
            out = "34"
        elif "media_session" in script:
            out = fx("media_session.txt")
        elif "dumpsys power" in script:
            out = fx("power.txt")
        elif "activity activities" in script:
            out = fx("activities.txt")
        else:
            out = ""
        return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr="")


class IdleTV(FakeAdb):
    """Nothing playing, YouTube TV on screen; answers the trial script with synthetic frames."""

    def __call__(self, cmd, **kw):
        self.calls.append(cmd)
        script, out, err = cmd[-1], "", ""
        if cmd[1:] == ["devices", "-l"]:
            out = fx("devices.txt")
        elif "input keyevent" in script:
            out, err = LatencyMath().sf_output()
        elif script == "getprop ro.build.version.sdk":
            out = "34"
        elif "media_session" in script:
            out = fx("media_session.txt").replace("PLAYING(3)", "PAUSED(2)")
        elif "dumpsys power" in script:
            out = "  mWakefulness=Awake\n  lastUserActivityTime=1000 (500 ms ago)\n"
        elif "activity activities" in script:
            out = f"  topResumedActivity=ActivityRecord{{91792fa u0 {YTTV}/.Main t1502}}\n"
        elif "SurfaceFlinger --list" in script:
            out = fx("sf_list.txt")
        elif script.startswith("echo @L"):
            out = f"@L {LatencyMath.LAYER}\n" + fx("sf_latency_yttv.txt")
        return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr=err)


class LatencyRun(unittest.TestCase):
    def test_end_to_end_with_fake_tv(self):
        import json
        import tempfile
        fake = IdleTV()
        with tempfile.TemporaryDirectory() as tmp, mock.patch("perflab.subprocess.run", fake), \
                mock.patch("perflab.time.sleep"), mock.patch("builtins.print"):
            code = p.main(["--serial", "test-tv", "--workdir", tmp, "latency", "t", "--i-know-nobody-is-watching", "--trials", "2"])
            data = json.loads(next(Path(tmp).glob("*-t.json")).read_text())
        self.assertEqual(code, 0)
        self.assertEqual([t["key"] for t in data["trials"]],
                         ["KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_UP"] * 2)  # each press is undone
        self.assertEqual(data["summary"]["KEYCODE_DPAD_DOWN"]["first_median_ms"], 120.0)
        for c in fake.calls[1:]:
            self.assertEqual(c[1:3], ["-s", "test-tv"])
        keys = [c[-1] for c in fake.calls if "input keyevent" in c[-1]]
        self.assertEqual(len(keys), 4)


class Safety(unittest.TestCase):
    def test_bad_windows_are_rejected_before_adb(self):
        for value in ('0', '-1', '11', 'nan', 'inf'):
            with self.subTest(value=value), mock.patch('perflab.subprocess.run', side_effect=AssertionError('adb called')):
                self.assertEqual(p.main(['latency', 'x', '--i-know-nobody-is-watching', '--window', value]), 2)

    def test_unknown_media_dump_refuses_keys(self):
        tv = mock.Mock()
        tv.sh.return_value = 'Permission denied'
        with self.assertRaisesRegex(ValueError, 'unrecognized'):
            p.live_state(tv)

    def test_numeric_playback_states(self):
        sessions = p.parse_sessions('  package=example.player\n  state=PlaybackState {state=3, position=1}')
        self.assertEqual(p.playing(sessions), ['example.player'])

    def test_foreground_unknown_playback_blocks_trial(self):
        self.assertIn('playback state', p.refuse_reason({'unknown_playback': True, 'playing': [], 'wakefulness': 'Awake'}))

    def test_shell_failure_with_stdout_is_not_success(self):
        runner = mock.Mock(return_value=subprocess.CompletedProcess([], 1, stdout='partial', stderr='offline'))
        with self.assertRaises(RuntimeError):
            p.TV('adb', 'test-tv', runner).sh('dumpsys power')

    def test_missing_target_does_not_contact_adb(self):
        args = argparse.Namespace(serial=None)
        with mock.patch('perflab.subprocess.run', side_effect=AssertionError('adb called')):
            with self.assertRaisesRegex(ValueError, 'choose a device'):
                p.connect(args)

    def test_snapshot_core_count_and_unknown_memory(self):
        raw = raw_snapshot()
        raw['cores'] = '8'
        data = p.build_snapshot(raw)
        self.assertEqual(data['cpu']['cores'], 8)
        self.assertEqual(data['cpu']['busy_cores'], 7.38)
        self.assertTrue(all('title' not in row for row in data['sessions']))
        raw['meminfo'] = ''
        self.assertIsNone(p.build_snapshot(raw)['memory']['available_mb'])
        self.assertIsNone(p.build_snapshot(raw)['memory']['swap_used_mb'])

    def test_snapshot_default_writes_no_raw_or_device_id(self):
        raw = raw_snapshot()
        raw['activities_end'] = raw['activities']
        raw['media_session_end'] = raw['media_session']
        outputs = {cmd: raw[name] for name, cmd, _ in p.SNAPSHOT_STEPS}
        tv = mock.Mock(serial='private-endpoint')
        tv.sh.side_effect = lambda cmd, **kw: outputs[cmd]
        with tempfile.TemporaryDirectory() as tmp, mock.patch('perflab.connect', return_value=tv), mock.patch('builtins.print'):
            args = argparse.Namespace(label='before', workdir=tmp, save_raw=False)
            self.assertEqual(p.cmd_snapshot(args), 0)
            files = list(Path(tmp).iterdir())
            self.assertEqual(len(files), 1)
            text = files[0].read_text()
            self.assertNotIn('private-endpoint', text)
            self.assertNotIn('Sample Game', text)
            self.assertFalse(any('input ' in call.args[0] or 'am start' in call.args[0] for call in tv.sh.call_args_list))

    def test_latency_needs_the_flag_before_touching_adb(self):
        with mock.patch("perflab.subprocess.run", side_effect=AssertionError("adb called")):
            self.assertEqual(p.main(["--serial", "test-tv", "latency", "x"]), 2)

    def test_latency_refuses_while_playing(self):
        fake = FakeAdb()
        with mock.patch("perflab.subprocess.run", fake):
            self.assertEqual(p.main(["--serial", "test-tv", "latency", "x", "--i-know-nobody-is-watching"]), 2)
        scripts = [c[-1] for c in fake.calls]
        self.assertFalse(any("input" in s or "am start" in s for s in scripts))
        for c in fake.calls[1:]:
            self.assertEqual(c[1:4], ["-s", "test-tv", "shell"])

    def test_refuse_reasons(self):
        self.assertIn("playing", p.refuse_reason({"playing": [YTTV], "wakefulness": "Awake"}))
        self.assertIn("not awake", p.refuse_reason({"playing": [], "wakefulness": "Asleep"}))
        self.assertIsNone(p.refuse_reason({"playing": [], "wakefulness": "Awake"}))

    def test_only_dpad_keys(self):
        with mock.patch("perflab.subprocess.run", side_effect=AssertionError("adb called")):
            self.assertEqual(p.main(["--serial", "test-tv", "latency", "x", "--i-know-nobody-is-watching", "--key", "ENTER"]), 2)

    def test_target_never_falls_back(self):
        devices = p.parse_devices(fx("devices.txt"))
        self.assertEqual(p.pick_tv(devices, "test-tv"), "test-tv")
        self.assertIsNone(p.pick_tv(devices, "missing-tv"))
        self.assertIsNone(p.pick_tv(devices, ""))


if __name__ == "__main__":
    unittest.main()
