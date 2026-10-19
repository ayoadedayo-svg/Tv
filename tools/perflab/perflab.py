#!/usr/bin/env python3
"""Optional Android TV performance measurements. See docs/PERFORMANCE.md."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shlex
import shutil
import statistics
import subprocess
import sys
import time
from pathlib import Path

WORKDIR = Path(__file__).resolve().parents[2] / "report" / "perflab"

PLAYING_STATES = {"PLAYING", "BUFFERING", "FAST_FORWARDING", "REWINDING", "CONNECTING",
                  "SKIPPING_TO_PREVIOUS", "SKIPPING_TO_NEXT", "SKIPPING_TO_QUEUE_ITEM"}
TOP_N = 15
INT64_MAX = 9223372036854775807

KEYS = {"UP": "KEYCODE_DPAD_UP", "DOWN": "KEYCODE_DPAD_DOWN",
        "LEFT": "KEYCODE_DPAD_LEFT", "RIGHT": "KEYCODE_DPAD_RIGHT"}
OPPOSITE = {"KEYCODE_DPAD_UP": "KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_DOWN": "KEYCODE_DPAD_UP",
            "KEYCODE_DPAD_LEFT": "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_RIGHT": "KEYCODE_DPAD_LEFT"}

# Layers that never hold the app's UI pixels: video planes, containers, input sinks.
LAYER_SKIP = ("Media:", "Background for", "Bounds for", "ActivityRecord", "InputSink",
              "Task=", "animation-leash", "Surface(name=")
BUSY_FRAMES = 3      # this many frames in the second before a press = the screen was already moving
SF_POLL_S = 0.8      # SurfaceFlinger keeps 128 frames (~2.1 s at 60 Hz); dump faster than that


# ---------------------------------------------------------------- parsing

def kb(text: str) -> int:
    """'1,234K' or '1,234' -> 1234."""
    return int(text.replace(",", "").rstrip("Kk"))


def parse_meminfo(text: str) -> dict[str, int]:
    """/proc/meminfo values in kB."""
    out = {}
    for line in text.splitlines():
        m = re.match(r"^(\w+(?:\(\w+\))?):\s+(\d+)\s*kB", line.strip())
        if m:
            out[m.group(1)] = int(m.group(2))
    return out


def parse_pss(text: str, n: int = TOP_N) -> list[dict]:
    """Top n rows of 'Total PSS by process' from `dumpsys meminfo`."""
    rows, inside = [], False
    for line in text.splitlines():
        if line.startswith("Total PSS by process"):
            inside = True
            continue
        if inside:
            m = re.match(r"^\s+([\d,]+)K: (.+?) \(pid (\d+)", line)
            if not m:
                break
            rows.append({"name": m.group(2), "pid": int(m.group(3)), "mb": round(kb(m.group(1)) / 1024, 1)})
    return rows[:n]


def parse_meminfo_summary(text: str) -> dict[str, float]:
    """The totals at the bottom of `dumpsys meminfo`, in MB."""
    pats = {"free_ram_mb": r"Free RAM:\s+(-?[\d,]+)K", "used_ram_mb": r"Used RAM:\s+(-?[\d,]+)K",
            "lost_ram_mb": r"Lost RAM:\s+(-?[\d,]+)K", "gpu_mb": r"^\s*GPU:\s+(-?[\d,]+)K",
            "zram_physical_mb": r"ZRAM:\s+(-?[\d,]+)K physical",
            "zram_in_swap_mb": r"ZRAM:.*?used for\s+(-?[\d,]+)K in swap"}
    out = {}
    for key, pat in pats.items():
        m = re.search(pat, text, re.M)
        if m:
            out[key] = round(kb(m.group(1)) / 1024, 1)
    return out


def parse_top(text: str) -> list[dict[tuple[int, str], float]]:
    """Frames of `top -b`, each {(pid, name): %cpu}. %cpu is out of 100 per core."""
    frames, cols, cur = [], None, None
    for line in text.splitlines():
        if line.startswith("Tasks:"):
            cur = {}
            frames.append(cur)
            cols = None
            continue
        if cur is None:
            continue
        if re.match(r"^\s*PID\s.*%CPU", line):  # column header (not a process whose args mention %CPU)
            cols = line.replace("[", " ").replace("]", " ").split()
            continue
        if cols and line.strip():
            parts = line.split(None, len(cols) - 1)
            if len(parts) < len(cols) or not parts[0].isdigit():
                continue
            row = dict(zip(cols, parts))
            try:
                cpu = float(row["%CPU"])
            except ValueError:
                continue
            cmdline = row["ARGS"]
            if cmdline.startswith("top "):
                continue  # our own sampler
            name = cmdline if cmdline.startswith("[") else cmdline.split()[0]  # [kernel thread] or binary
            cur[(int(row["PID"]), name)] = cpu
    return frames


def cpu_per_process(frames: list[dict], n: int = TOP_N) -> list[dict]:
    """Average %cpu per process. toybox top's first frame is a ~0.3 s warm-up, so skip it."""
    use = frames[1:] if len(frames) > 1 else frames
    total: dict[tuple[int, str], float] = {}
    for frame in use:
        for key, cpu in frame.items():
            total[key] = total.get(key, 0.0) + cpu
    rows = [{"name": name, "pid": pid, "pct_of_core": round(cpu / len(use), 1)}
            for (pid, name), cpu in total.items()] if use else []
    rows.sort(key=lambda r: -r["pct_of_core"])
    return rows[:n]


def parse_proc_stat(text: str) -> tuple[int, int]:
    """(idle jiffies incl. iowait, total jiffies) from the 'cpu' line of /proc/stat."""
    for line in text.splitlines():
        if line.startswith("cpu "):
            v = [int(x) for x in line.split()[1:9]]  # user nice system idle iowait irq softirq steal
            return v[3] + v[4], sum(v)
    raise ValueError("no cpu line in /proc/stat")


def idle_pct(before: tuple[int, int], after: tuple[int, int]) -> float:
    d_idle, d_total = after[0] - before[0], after[1] - before[1]
    return round(100.0 * d_idle / d_total, 1) if d_total > 0 else None


def parse_thermal(text: str) -> dict:
    """Thermal status and the HAL's current temperatures (°C) from `dumpsys thermalservice`."""
    out = {"status": None, "temps_c": {}}
    m = re.search(r"^Thermal Status: (\d+)", text, re.M)
    if m:
        out["status"] = int(m.group(1))
    for section in ("Current temperatures from HAL:", "Cached temperatures:"):
        start = text.find(section)
        if start < 0:
            continue
        for line in text[start:].splitlines()[1:]:
            m = re.search(r"Temperature\{mValue=([-\d.]+), mType=\d+, mName=(\w+)", line)
            if not m:
                break
            out["temps_c"][m.group(2)] = float(m.group(1))
        if out["temps_c"]:
            break
    return out


def parse_foreground(text: str) -> str | None:
    """Package of the resumed activity from `dumpsys activity activities`."""
    m = re.search(r"(?:topResumedActivity=|mResumedActivity: |ResumedActivity: )ActivityRecord\{\S+ u\d+ ([\w.]+)/", text)
    return m.group(1) if m else None


def parse_sessions(text: str) -> list[dict]:
    """Media sessions: package, playback state and the now-playing description."""
    sessions, cur = [], None
    for line in text.splitlines():
        m = re.search(r"^\s+package=([\w.]+)", line)
        if m:
            cur = {"package": m.group(1), "state": None, "title": None}
            sessions.append(cur)
            continue
        if cur is None:
            continue
        m = re.search(r"state=PlaybackState \{state=([A-Z_]+|\d+)", line)
        if m:
            state = m.group(1)
            states = {0: "NONE", 1: "STOPPED", 2: "PAUSED", 3: "PLAYING",
                      4: "FAST_FORWARDING", 5: "REWINDING", 6: "BUFFERING",
                      7: "ERROR", 8: "CONNECTING", 9: "SKIPPING_TO_PREVIOUS",
                      10: "SKIPPING_TO_NEXT", 11: "SKIPPING_TO_QUEUE_ITEM"}
            cur["state"] = states.get(int(state)) if state.isdigit() else state
        m = re.search(r"metadata: size=\d+, description=(.*)", line)
        if m:
            cur["title"] = m.group(1).strip()
    return sessions


def playing(sessions: list[dict]) -> list[str]:
    return sorted({s["package"] for s in sessions if s["state"] in PLAYING_STATES})


def parse_devices(text: str) -> dict[str, tuple[str, str]]:
    """Serial -> (state, whole line) from `adb devices -l`."""
    out = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 2 or line.startswith(("List of", "*")):
            continue
        out[parts[0]] = (parts[1], line)
    return out


def pick_tv(devices: dict[str, tuple[str, str]], wanted: str) -> str | None:
    """Use only the explicitly requested, authorized endpoint. Never fall back."""
    return wanted if devices.get(wanted, ("", ""))[0] == "device" else None


def parse_power(text: str) -> dict:
    """Wakefulness, last user activity and 'now', all on the uptime clock in ms.

    `lastUserActivityTime=X (Y ms ago)` gives the last key's own timestamp (X)
    and the current uptime (X + Y), the clock SurfaceFlinger also uses.
    """
    out = {"wakefulness": None, "last_activity_ms": None, "now_ms": None}
    m = re.search(r"mWakefulness=(\w+)", text)
    if m:
        out["wakefulness"] = m.group(1)
    m = re.search(r"lastUserActivityTime=(\d+) \((\d+) ms ago\)", text)
    if m:
        out["last_activity_ms"] = int(m.group(1))
        out["now_ms"] = int(m.group(1)) + int(m.group(2))
    return out


def layer_candidates(sf_list: str, pkg: str) -> list[str]:
    """Layers from `dumpsys SurfaceFlinger --list` that may hold pkg's UI pixels."""
    out = []
    for name in sf_list.splitlines():
        name = name.strip()
        if pkg in name and not any(s in name for s in LAYER_SKIP):
            out.append(name)
    return out


def parse_sf_latency(text: str) -> tuple[int | None, list[tuple[int, int, int]]]:
    """(refresh period ns, frames) from `dumpsys SurfaceFlinger --latency <layer>`.

    Each frame is (desired present, actual present, frame ready) in uptime ns.
    Empty slots (zeros) and frames still waiting on a fence (INT64_MAX) are dropped.
    """
    period, frames = None, []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 1 and parts[0].isdigit() and period is None:
            period = int(parts[0])
        elif len(parts) == 3 and all(p.isdigit() for p in parts):
            f = tuple(int(p) for p in parts)
            if f[0] and f[1] and f[1] != INT64_MAX:
                frames.append(f)
    return period, frames


FRAME_COLS = ("IntendedVsync", "InputEventId", "HandleInputStart", "FrameCompleted", "DisplayPresentTime")


def parse_framestats(text: str) -> list[dict[str, int]]:
    """Frames from `dumpsys gfxinfo <pkg> framestats` (uptime ns).

    Only apps drawn by Android's own UI toolkit appear here; Cobalt (YouTube TV)
    draws with its own GL, so it shows almost nothing. A non-zero InputEventId
    marks the first frame drawn after the app handled a key. Rows with Flags != 0
    are ones Android says to ignore.
    """
    rows, cols, inside = [], None, False
    for line in text.splitlines():
        if line.startswith("---PROFILEDATA---"):
            inside, cols = not inside, None
        elif inside and line.startswith("Flags,"):
            cols = line.rstrip(",").split(",")
        elif inside and cols and line[:1].isdigit():
            vals = line.rstrip(",").split(",")
            if len(vals) == len(cols) and all(v.isdigit() for v in vals):
                row = dict(zip(cols, map(int, vals)))
                if row.get("Flags") == 0:
                    rows.append({k: row.get(k, 0) for k in FRAME_COLS})
    return rows


def split_blocks(text: str) -> list[tuple[str, str, str]]:
    """Split trial output into (tag, argument, body) at lines starting with '@'."""
    blocks, tag, arg, body = [], None, "", []
    for line in text.splitlines():
        m = re.match(r"^@(\w+) ?(.*)$", line)
        if m:
            if tag:
                blocks.append((tag, arg, "\n".join(body)))
            tag, arg, body = m.group(1), m.group(2), []
        elif tag:
            body.append(line)
    if tag:
        blocks.append((tag, arg, "\n".join(body)))
    return blocks


def parse_am_start(text: str) -> dict:
    out = {}
    for key in ("TotalTime", "WaitTime"):
        m = re.search(rf"^{key}: (\d+)", text, re.M)
        if m:
            out[key] = int(m.group(1))
    m = re.search(r"^LaunchState: (\w+)", text, re.M)
    if m:
        out["LaunchState"] = m.group(1)
    m = re.search(r"^Status: (\w+)", text, re.M)
    if m:
        out["Status"] = m.group(1)
    return out


# ------------------------------------------------------------ measurement math

def percentile(values: list[float], q: float) -> float | None:
    """Nearest-rank percentile; q in 0..100."""
    if not values:
        return None
    s = sorted(values)
    return s[max(0, math.ceil(q / 100 * len(s)) - 1)]


def key_time_ms(p0: dict, p1: dict) -> tuple[int | None, str]:
    """When the key went in, on the uptime clock.

    Best: the key event's own time, which PowerManager records as the last user
    activity. Fallback: the clock read just before `input` ran (slightly early,
    so latency reads a little long).
    """
    before, after = p0.get("now_ms"), p1.get("last_activity_ms")
    if before is not None and after is not None and before - 50 <= after <= before + 3000:
        return after, "key-event"
    return before, "clock-before-input"


def sf_response(frames: list[tuple[int, int, int]], key_ms: int, window_s: float) -> dict:
    """First and last frame drawn after the key press, in ms from the press."""
    key_ns, end_ns = key_ms * 1_000_000, key_ms * 1_000_000 + int(window_s * 1e9)
    frames = sorted(set(frames), key=lambda f: f[1])
    busy = sum(1 for f in frames if key_ns - 1_000_000_000 <= f[0] < key_ns)
    after = [f for f in frames if key_ns <= f[0] <= end_ns]
    res = {"responded": bool(after), "first_ms": None, "settled_ms": None, "frames": len(after),
           "frames_second_before": busy, "busy": busy >= BUSY_FRAMES, "still_drawing": False}
    if after:
        res.update(first_ms=round((after[0][1] - key_ns) / 1e6, 1),
                   settled_ms=round((after[-1][1] - key_ns) / 1e6, 1),
                   still_drawing=end_ns - after[-1][0] < 300_000_000)
    return res


def input_response(rows: list[dict], key_ms: int, window_s: float) -> dict | None:
    """The first frame the app drew after handling the key, from input-tagged frames."""
    key_ns, end_ns = key_ms * 1_000_000, key_ms * 1_000_000 + int(window_s * 1e9)
    tagged = sorted({r["IntendedVsync"]: r for r in rows if r["InputEventId"]
                     and key_ns <= (r["HandleInputStart"] or r["IntendedVsync"]) <= end_ns}.values(),
                    key=lambda r: r["IntendedVsync"])
    if not tagged:
        return None
    r = tagged[0]
    shown = r["DisplayPresentTime"] or r["FrameCompleted"]
    return {"first_ms": round((shown - key_ns) / 1e6, 1),
            "handled_ms": round((r["HandleInputStart"] - key_ns) / 1e6, 1) if r["HandleInputStart"] else None}


def frame_response(frames: list[tuple[int, int, int]], rows: list[dict], key_ms: int, window_s: float) -> dict:
    """Combine both frame sources into one result.

    An input-tagged frame (normal apps) wins: it is tied to the key itself.
    Otherwise (Cobalt) the first SurfaceFlinger frame counts, but only if the
    screen was still before the press; on a screen that animates all the time a
    new frame proves nothing, so that press is marked unmeasured.
    """
    res = sf_response(frames, key_ms, window_s)
    res.update(source="sf", measured=True, handled_ms=None)
    hit = input_response(rows, key_ms, window_s)
    if hit:
        res.update(hit, responded=True, source="input-frame")
        if res["busy"]:
            res["settled_ms"] = None  # never goes quiet, so there is no settle point
    elif res["busy"]:
        res.update(responded=False, measured=False, first_ms=None, settled_ms=None, source="busy screen")
    return res


def capture_response(baselines: list[str], caps: list[tuple[int, int, str]], t0_ns: int) -> dict:
    """First and last screen change after the press from (start ns, end ns, hash) captures."""
    base = baselines[-1] if baselines else None
    first = settled = None
    prev_start = t0_ns
    for start, _, h in caps:
        if h != base:
            first = round(((prev_start + start) / 2 - t0_ns) / 1e6, 1)  # changed somewhere in between
            break
        prev_start = start
    if first is not None:
        # Settled: the first capture from which the picture stops changing.
        i = len(caps) - 1
        while i > 0 and caps[i - 1][2] == caps[-1][2]:
            i -= 1
        settled = round((caps[i][0] - t0_ns) / 1e6, 1)
    return {"responded": first is not None, "measured": True, "first_ms": first, "settled_ms": settled,
            "frames": len(caps), "busy": len(set(baselines)) > 1,
            "still_drawing": len(caps) >= 2 and caps[-1][2] != caps[-2][2],
            "capture_ms": round(statistics.median((e - s) / 1e6 for s, e, _ in caps)) if caps else None}


def summarize(trials: list[dict]) -> dict:
    """Per key: count, presses with no visible change, median and p90 of first response and settle."""
    out = {}
    for key in dict.fromkeys(t["key"] for t in trials):
        ts = [t for t in trials if t["key"] == key]
        measured = [t for t in ts if t.get("measured", True)]
        first = [t["first_ms"] for t in measured if t["responded"]]
        settled = [t["settled_ms"] for t in measured if t["responded"] and t["settled_ms"] is not None]
        out[key] = {"n": len(ts), "responded": len(first), "no_change": len(measured) - len(first),
                    "unmeasured": len(ts) - len(measured),
                    "busy_before": sum(1 for t in ts if t.get("busy")),
                    "first_median_ms": statistics.median(first) if first else None,
                    "first_p90_ms": percentile(first, 90),
                    "settled_median_ms": statistics.median(settled) if settled else None,
                    "settled_p90_ms": percentile(settled, 90)}
    return out


# -------------------------------------------------------------------- adb

class TV:
    def __init__(self, adb: str, serial: str, run=None):
        self.adb, self.serial = adb, serial
        self.run = run or subprocess.run  # swapped out in tests

    def sh2(self, script: str, timeout: int = 60) -> tuple[str, str]:
        r = self.run([self.adb, "-s", self.serial, "shell", script],
                     capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError(f"ADB read failed ({r.returncode}): {r.stderr.strip()[:200]}")
        return r.stdout, r.stderr

    def sh(self, script: str, timeout: int = 60) -> str:
        return self.sh2(script, timeout)[0]


def connect(args) -> TV:
    if not args.serial:
        raise ValueError("choose a device with --serial or ADB_SERIAL; see adb devices -l")
    result = subprocess.run([args.adb, "devices", "-l"], capture_output=True,
                            text=True, timeout=15, stdin=subprocess.DEVNULL)
    if result.returncode:
        raise RuntimeError("adb devices failed")
    serial = pick_tv(parse_devices(result.stdout), args.serial)
    if not serial:
        raise ValueError("the selected endpoint is absent, offline or unauthorized; reconnect it manually")
    tv = TV(args.adb, serial)
    sdk = tv.sh("getprop ro.build.version.sdk").strip()
    if not sdk.isdigit() or int(sdk) < 28:
        raise ValueError("this tool requires Android 9 or later; cannot verify the selected device")
    return tv


def save(workdir: Path, label: str, data: dict) -> Path:
    workdir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", label).strip("-") or "run"
    path = workdir / f"{time.strftime('%Y%m%d-%H%M%S')}-{time.time_ns() % 1_000_000_000:09d}-{safe}.json"
    path.write_text(json.dumps(data, indent=2) + "\n")
    return path


# ------------------------------------------------------------- snapshot

SNAPSHOT_STEPS = [  # (name, command, timeout); CPU is sampled before the heavy meminfo dump
    ("meminfo", "cat /proc/meminfo", 20),
    ("cores", "grep -c '^cpu[0-9]' /proc/stat", 20),
    ("activities", "dumpsys activity activities", 30),
    ("media_session", "dumpsys media_session", 30),
    ("thermal", "dumpsys thermalservice", 30),
    ("loadavg", "cat /proc/loadavg", 20),
    ("stat_before", "head -1 /proc/stat", 20),
    ("top", "top -b -n 3 -d 5 -m 40", 60),
    ("stat_after", "head -1 /proc/stat", 20),
    ("dumpsys_meminfo", "dumpsys -t 60 meminfo", 120),
    ("activities_end", "dumpsys activity activities", 30),
    ("media_session_end", "dumpsys media_session", 30),
]


def build_snapshot(raw: dict[str, str]) -> dict:
    """Turn raw command outputs into the snapshot record."""
    mem = parse_meminfo(raw["meminfo"])
    mb = lambda k: round(mem[k] / 1024) if k in mem else None  # noqa: E731
    sessions = parse_sessions(raw["media_session"])
    cores = int(raw["cores"].strip())
    if cores <= 0:
        raise ValueError("invalid CPU count")
    idle = idle_pct(parse_proc_stat(raw["stat_before"]), parse_proc_stat(raw["stat_after"]))
    thermal = parse_thermal(raw["thermal"])
    load = raw.get("loadavg", "").split()
    return {
        "foreground": parse_foreground(raw["activities"]),
        "foreground_end": parse_foreground(raw.get("activities_end", "")),  # someone may switch mid-snapshot
        "playing": playing(sessions),
        "playing_end": playing(parse_sessions(raw.get("media_session_end", ""))),
        "sessions": [{"package": s["package"], "state": s["state"]} for s in sessions],
        "memory": {"total_mb": mb("MemTotal"), "available_mb": mb("MemAvailable"),
                   "free_mb": mb("MemFree"), "cached_mb": mb("Cached"),
                   "swap_total_mb": mb("SwapTotal"), "swap_free_mb": mb("SwapFree"),
                   "swap_used_mb": (round((mem["SwapTotal"] - mem["SwapFree"]) / 1024)
                                    if "SwapTotal" in mem and "SwapFree" in mem else None)},
        "meminfo_summary": parse_meminfo_summary(raw["dumpsys_meminfo"]),
        "pss_top": parse_pss(raw["dumpsys_meminfo"]),
        "cpu": {"window_s": 10, "cores": cores, "idle_pct": idle, "busy_cores": round(cores * (100 - idle) / 100, 2) if idle is not None else None,
                "load1": float(load[0]) if load else None,
                "top": cpu_per_process(parse_top(raw["top"]))},
        "thermal": {"status": thermal["status"],
                    "cpu_c": thermal["temps_c"].get("CPU"),
                    "temps_c": thermal["temps_c"]},
    }


def short(name: str, width: int = 44) -> str:
    return name if len(name) <= width else name[: width - 1] + "…"


def print_snapshot(d: dict, path: Path) -> None:
    m, c, t = d["memory"], d["cpu"], d["thermal"]
    print(f"{d['label']}  {d['taken_at']}  -> {path}")
    moved = f" -> {d['foreground_end']}" if d.get("foreground_end") not in (None, d["foreground"]) else ""
    print(f"  on screen   {d['foreground']}{moved}; playing: {', '.join(d['playing']) or 'nothing'}")
    print(f"  memory      available {m['available_mb']} MB of {m['total_mb']}, "
          f"swap used {m['swap_used_mb']} of {m['swap_total_mb']} MB")
    print(f"  cpu         idle {c['idle_pct']}% over {c['window_s']} s "
          f"({c['busy_cores']} of {c['cores']} cores busy), load {c['load1']}")
    print(f"  thermal     status {t['status']}, CPU {t['cpu_c']} °C")
    print(f"  {'top cpu (% of one core)':<52}top memory (PSS MB)")
    for i in range(TOP_N):
        a = c["top"][i] if i < len(c["top"]) else None
        b = d["pss_top"][i] if i < len(d["pss_top"]) else None
        left = f"{a['pct_of_core']:6.1f}  {short(a['name'])}" if a else ""
        right = f"{b['mb']:6.1f}  {short(b['name'])}" if b else ""
        print(f"  {left:<52}{right}")


def cmd_snapshot(args) -> int:
    tv = connect(args)
    raw = {}
    for name, command, timeout in SNAPSHOT_STEPS:
        raw[name] = tv.sh(command, timeout=timeout)
    data = {"kind": "snapshot", "label": args.label, "taken_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            **build_snapshot(raw)}
    path = save(Path(args.workdir), args.label, data)
    if args.save_raw:  # explicitly requested; may include titles and device identifiers
        rawdir = path.with_suffix("")
        rawdir.mkdir(exist_ok=True)
        for name, text in raw.items():
            (rawdir / f"{name}.txt").write_text(text)
    print_snapshot(data, path)
    return 0


# -------------------------------------------------------------- latency

def live_state(tv: TV) -> dict:
    media = tv.sh("dumpsys media_session")
    if "MEDIA SESSION SERVICE" not in media:
        raise ValueError("unrecognized media-session output; refusing key presses")
    sessions = parse_sessions(media)
    power = parse_power(tv.sh("dumpsys power | grep -E 'mWakefulness=|lastUserActivityTime='"))
    fg = parse_foreground(tv.sh("dumpsys activity activities"))
    return {"playing": playing(sessions), "wakefulness": power["wakefulness"], "foreground": fg,
            "unknown_playback": any(s["package"] == fg and s["state"] in (None, "NONE") for s in sessions)}


def refuse_reason(state: dict) -> str | None:
    if state.get("unknown_playback"):
        return "the foreground app does not expose its playback state"
    if state["playing"]:
        return f"something is playing ({', '.join(state['playing'])}) — someone may be watching"
    if state["wakefulness"] != "Awake":
        return f"the TV is not awake ({state['wakefulness']}); a key press would turn it on"
    return None


def find_layers(tv: TV, pkg: str) -> list[str]:
    """pkg's layers that actually receive frames."""
    names = layer_candidates(tv.sh("dumpsys SurfaceFlinger --list"), pkg)
    if not names:
        return []
    keep = []
    for tag, arg, body in split_blocks(tv.sh(dump_script(names, None))):
        if tag == "L" and parse_sf_latency(body)[1]:
            keep.append(arg)
    return keep


def dump_script(layers: list[str], pkg: str | None) -> str:
    """Shell that prints each layer's SurfaceFlinger frames, then the app's input-tagged frames."""
    parts = [f"echo @L {shlex.quote(n)}; dumpsys SurfaceFlinger --latency {shlex.quote(n)}" for n in layers]
    if pkg:
        parts.append(f"echo @G; dumpsys gfxinfo {shlex.quote(pkg)} framestats")
    return "; ".join(parts)


def frame_trial(tv: TV, layers: list[str], pkg: str, key: str, window_s: float) -> dict:
    """One press, timed from frame timestamps. Runs on the TV in one shell call."""
    dump = dump_script(layers, pkg)
    steps = math.ceil(window_s / SF_POLL_S) + 1
    power = "dumpsys power | grep -m1 lastUserActivityTime="
    script = (f"{dump}; echo \"@P0 $({power})\"; echo \"@T0 $(date +%s%N)\"; "
              f"( input keyevent {key}; echo \"@T1 $(date +%s%N)\" >&2 ) & "
              f"i=0; while [ $i -lt {steps} ]; do sleep {SF_POLL_S}; {dump}; i=$((i+1)); done; wait; "
              f"echo \"@P1 $({power})\"")
    out, err = tv.sh2(script, timeout=int(window_s) + 30)
    return parse_frame_trial(out, err, key, window_s)


def parse_frame_trial(out: str, err: str, key: str, window_s: float) -> dict:
    frames, rows, p0, p1, t0 = [], [], {}, {}, None
    for tag, arg, body in split_blocks(out):
        if tag == "L":
            frames += parse_sf_latency(body)[1]
        elif tag == "G":
            rows += parse_framestats(body)
        elif tag == "P0":
            p0 = parse_power(arg)
        elif tag == "P1":
            p1 = parse_power(arg)
        elif tag == "T0":
            t0 = int(arg)
    m = re.search(r"@T1 (\d+)", err)
    key_ms, source = key_time_ms(p0, p1)
    if key_ms is None:
        raise RuntimeError("could not read the TV's clock from dumpsys power")
    res = frame_response(frames, rows, key_ms, window_s)
    res.update({"key": key, "method": "frames", "key_time": source,
                "input_cmd_ms": round((int(m.group(1)) - t0) / 1e6) if m and t0 else None})
    return res


def capture_trial(tv: TV, key: str, window_s: float) -> dict:
    """One press, timed by hashing raw screenshots on the TV until the picture changes."""
    cap = "s=$(date +%s%N); h=$(screencap | md5sum); e=$(date +%s%N); echo \"@C $s $e ${h%% *}\""
    script = (f"{cap.replace('@C', '@B')}; sleep 0.3; {cap.replace('@C', '@B')}; "
              f"echo \"@T0 $(date +%s%N)\"; end=$(( $(date +%s) + {math.ceil(window_s)} )); "
              f"( input keyevent {key} ) & "
              f"while [ $(date +%s) -le $end ]; do {cap}; done; wait")
    out, _ = tv.sh2(script, timeout=int(window_s) + 30)
    return parse_capture_trial(out, key)


def parse_capture_trial(out: str, key: str) -> dict:
    base, caps, t0 = [], [], None
    for line in out.splitlines():
        p = line.split()
        if p[:1] == ["@B"] and len(p) == 4:
            base.append(p[3])
        elif p[:1] == ["@C"] and len(p) == 4:
            caps.append((int(p[1]), int(p[2]), p[3]))
        elif p[:1] == ["@T0"] and len(p) == 2:
            t0 = int(p[1])
    res = capture_response(base, [c for c in caps if t0 and c[0] >= t0], t0 or 0)
    res.update({"key": key, "method": "screencap"})
    return res


def open_app(tv: TV, pkg: str, settle_timeout: float = 15.0) -> dict:
    """VISIBLE: launch pkg's TV activity and wait until its screen stops drawing.

    Some screens animate forever; then this gives up after settle_timeout.
    """
    resolved = tv.sh("cmd package resolve-activity --brief -a android.intent.action.MAIN "
                     f"-c android.intent.category.LEANBACK_LAUNCHER {shlex.quote(pkg)}")
    comp = next((l.strip() for l in reversed(resolved.splitlines()) if "/" in l), None)
    if not comp:
        raise SystemExit(f"{pkg} has no TV launcher activity")
    print(f"VISIBLE: opening {pkg} on the TV now.", flush=True)
    started = parse_am_start(tv.sh(f"am start -W -n {shlex.quote(comp)}", timeout=60))
    t_end, last_seen, quiet = time.time() + settle_timeout, None, 0
    while time.time() < t_end and quiet < 2:
        time.sleep(1.0)
        if live_state(tv)["foreground"] != pkg:
            continue
        layers = find_layers(tv, pkg)
        if not layers:
            continue
        frames = [f for _, _, body in split_blocks(tv.sh(dump_script(layers, None)))
                  for f in parse_sf_latency(body)[1]]
        newest = max((f[1] for f in frames), default=None)
        quiet = quiet + 1 if newest == last_seen else 0
        last_seen = newest
    return {"package": pkg, "activity": comp, **started, "settled": quiet >= 2}


def cmd_latency(args) -> int:
    if not args.i_know_nobody_is_watching:
        print("refusing: `latency` presses keys on the TV (visible). Re-run with "
              "--i-know-nobody-is-watching once nobody is watching.", file=sys.stderr)
        return 2
    key = KEYS.get(args.key.upper().replace("KEYCODE_", "").replace("DPAD_", ""))
    if not key or not 1 <= args.trials <= 50 or not 0.5 <= args.window <= 10:
        print(f"refusing: --key must be one of {', '.join(KEYS)} and --trials 1-50, --window 0.5-10", file=sys.stderr)
        return 2
    tv = connect(args)
    state = live_state(tv)
    reason = refuse_reason(state)
    if reason:
        print(f"refusing: {reason}. Nothing was sent to the TV.", file=sys.stderr)
        return 2
    app = None
    if args.app:
        app = open_app(tv, args.app)
        state = live_state(tv)
        if state["playing"]:
            print(f"stopping: {args.app} started playing on its own ({', '.join(state['playing'])}). "
                  "No keys were pressed; press Back or Home on the remote.", file=sys.stderr)
            return 3
    fg = state["foreground"]
    if not fg:
        raise ValueError("cannot identify the foreground app; refusing key presses")
    layers = find_layers(tv, fg) if fg and args.method in ("auto", "frames") else []
    method = "frames" if layers else "screencap"
    if args.method == "frames" and not layers:
        print(f"no SurfaceFlinger layer with frames for {fg}", file=sys.stderr)
        return 2
    print(f"VISIBLE: pressing {key} {args.trials}x on {fg} "
          f"(each followed by {'its opposite' if not args.no_return else 'nothing'}), method {method}",
          flush=True)
    sequence = []
    for _ in range(args.trials):
        sequence.append(key)
        if not args.no_return:
            sequence.append(OPPOSITE[key])
    trials, stopped = [], None
    for i, k in enumerate(sequence):
        # Re-check even the first press after collecting frame layers.
        now = live_state(tv)
        if refuse_reason(now) or now["foreground"] != fg:
            stopped = refuse_reason(now) or f"the screen changed to {now['foreground']}"
            break
        t = frame_trial(tv, layers, fg, k, args.window) if method == "frames" else capture_trial(tv, k, args.window)
        trials.append(t)
        if not t["measured"]:
            shown = "not measurable (screen animating, no input-tagged frame)"
        elif t["responded"]:
            shown = f"{t['first_ms']:.0f} ms, settled {fmt_ms(t['settled_ms'])} ms ({t.get('source', method)})"
        else:
            shown = "no change"
        print(f"  {i + 1:>2}/{len(sequence)} {k.replace('KEYCODE_DPAD_', ''):<5} {shown}", flush=True)
        time.sleep(0.5)
    data = {"kind": "latency", "label": args.label, "taken_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "foreground": fg, "app_opened": app, "method": method,
            "layers": layers, "window_s": args.window, "stopped_early": stopped,
            "trials": trials, "summary": summarize(trials)}
    path = save(Path(args.workdir), args.label, data)
    print_latency(data, path)
    return 0 if not stopped else 3


def fmt_ms(v) -> str:
    return "—" if v is None else f"{v:.0f}"


def print_latency(d: dict, path: Path) -> None:
    print(f"{d['label']}  {d['taken_at']}  {d['method']} on {d['foreground']}  -> {path}")
    if d.get("app_opened"):
        a = d["app_opened"]
        print(f"  opened {a['package']}: {a.get('LaunchState', '?')} start {fmt_ms(a.get('TotalTime'))} ms")
    if d.get("stopped_early"):
        print(f"  stopped early: {d['stopped_early']}")
    print(f"  {'key':<6}{'n':>3}{'no change':>11}{'unmeasured':>12}{'first med':>11}{'p90':>7}"
          f"{'settled med':>13}{'p90':>7}")
    for key, s in d["summary"].items():
        print(f"  {key.replace('KEYCODE_DPAD_', ''):<6}{s['n']:>3}{s['no_change']:>11}{s['unmeasured']:>12}"
              f"{fmt_ms(s['first_median_ms']):>11}{fmt_ms(s['first_p90_ms']):>7}"
              f"{fmt_ms(s['settled_median_ms']):>13}{fmt_ms(s['settled_p90_ms']):>7}")


# -------------------------------------------------------------- compare

def compare_rows(a: dict, b: dict) -> list[tuple[str, float | None, float | None, str]]:
    """(metric, A, B, which direction is better) rows for two records of the same kind."""
    if a.get("kind") != b.get("kind"):
        raise ValueError(f"cannot compare a {a.get('kind')} with a {b.get('kind')}")
    rows = []
    if a["kind"] == "snapshot":
        rows += [("memory available MB", a["memory"]["available_mb"], b["memory"]["available_mb"], "up"),
                 ("swap used MB", a["memory"]["swap_used_mb"], b["memory"]["swap_used_mb"], "down"),
                 ("cpu idle %", a["cpu"]["idle_pct"], b["cpu"]["idle_pct"], "up"),
                 ("cores busy", a["cpu"]["busy_cores"], b["cpu"]["busy_cores"], "down"),
                 ("CPU temp °C", a["thermal"]["cpu_c"], b["thermal"]["cpu_c"], "down")]
        for section, field, unit in (("cpu", "pct_of_core", "% core"), ("pss", "mb", "MB")):
            pick = (lambda d: d["cpu"]["top"]) if section == "cpu" else (lambda d: d["pss_top"])
            ta = {r["name"]: r[field] for r in pick(a)}
            tb = {r["name"]: r[field] for r in pick(b)}
            for name in sorted(set(ta) | set(tb), key=lambda n: -max(ta.get(n, 0), tb.get(n, 0))):
                rows.append((f"{unit:<6} {short(name, 38)}", ta.get(name), tb.get(name), "down"))
    else:
        for key in dict.fromkeys(list(a["summary"]) + list(b["summary"])):
            sa, sb = a["summary"].get(key, {}), b["summary"].get(key, {})
            k = key.replace("KEYCODE_DPAD_", "")
            for field, name in (("first_median_ms", "first ms (median)"), ("first_p90_ms", "first ms (p90)"),
                                ("settled_median_ms", "settled ms (median)"), ("settled_p90_ms", "settled ms (p90)"),
                                ("no_change", "no change"), ("unmeasured", "unmeasured")):
                rows.append((f"{k:<5} {name}", sa.get(field), sb.get(field), "down"))
    return rows


def cmd_compare(args) -> int:
    a, b = (json.loads(Path(p).read_text()) for p in (args.a, args.b))
    print(f"A = {a['label']} ({a['taken_at']})\nB = {b['label']} ({b['taken_at']})")
    print("Compare the same device, app, playback and thermal conditions; deltas are not causal proof.")
    for record in (a, b):
        if record.get("kind") == "snapshot" and (record.get("foreground") != record.get("foreground_end")
                or record.get("playing") != record.get("playing_end")):
            print(f"WARNING: workload changed during {record['label']}")
    if a.get("foreground") != b.get("foreground") or a.get("playing") != b.get("playing"):
        print("WARNING: foreground/playback differs between reports")
    print(f"  {'metric':<46}{'A':>9}{'B':>9}{'B-A':>9}")
    for name, va, vb, better in compare_rows(a, b):
        delta = vb - va if va is not None and vb is not None else None
        mark = ""
        # A metric delta does not establish a performance improvement.
        f = lambda v: "—" if v is None else f"{v:g}"  # noqa: E731
        print(f"  {name:<46}{f(va):>9}{f(vb):>9}{('—' if delta is None else f'{delta:+.1f}'):>9}{mark}")
    return 0


# ------------------------------------------------------------------- main

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--adb", default=shutil.which("adb") or "adb")
    p.add_argument("--serial", default=os.environ.get("ADB_SERIAL"), help="explicit endpoint from adb devices -l (or ADB_SERIAL)")
    p.add_argument("--workdir", default=str(WORKDIR))
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("snapshot", help="read-only: memory, CPU, thermal, what's on screen")
    s.add_argument("label")
    s.add_argument("--save-raw", action="store_true", help="also save private raw dumps (may contain viewing titles)")

    lat = sub.add_parser("latency", help="VISIBLE: press D-pad keys and time the screen's response")
    lat.add_argument("label")
    lat.add_argument("--i-know-nobody-is-watching", action="store_true",
                     help="required: you confirm the TV is free (it still refuses if anything plays)")
    lat.add_argument("--key", default="DOWN", help="UP, DOWN, LEFT or RIGHT (default DOWN)")
    lat.add_argument("--trials", type=int, default=10, help="presses of --key (default 10)")
    lat.add_argument("--no-return", action="store_true", help="don't press the opposite key after each press")
    lat.add_argument("--window", type=float, default=3.0, help="seconds to watch after each press")
    lat.add_argument("--method", choices=["auto", "frames", "screencap"], default="auto",
                     help="frames = SurfaceFlinger + input-tagged frames (default when available); "
                          "screencap = hash screenshots (coarse, ~0.3-2 s per grab)")
    lat.add_argument("--app", help="VISIBLE: open this package first and wait for it to settle")

    c = sub.add_parser("compare", help="before/after deltas between two JSON files")
    c.add_argument("a")
    c.add_argument("b")

    args = p.parse_args(argv)
    try:
        return {"snapshot": cmd_snapshot, "latency": cmd_latency, "compare": cmd_compare}[args.cmd](args)
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.TimeoutExpired) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
