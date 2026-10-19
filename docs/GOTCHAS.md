# Gotchas

Everything here cost real time to work out. Read it before debugging anything.

## The DNS filter

**`am force-stop dnsfilter.android` breaks filtering silently.** The app comes
back (always-on VPN), the VPN network re-registers, and DNS stops going through
it: every lookup goes straight to the router. The traffic log goes quiet, which
is the tell. Recovery is a reboot, not a restart. Never force-stop it — the one
exception is `scripts/dnsfilter.sh`, which stops it during setup and reboots
immediately afterwards so the pushed list is the one that loads.

**Without storage permission the blocklist import writes a 234-byte header.**
This only matters for the `filterAutoUpdateURL` + `file://` route, which an
easier version of this repo used. The current script avoids it: the list is
composed on the computer and pushed as `FILTERHOSTS.TXT`, with auto-update
disabled. If you do go back to `file://` imports, grant `READ_EXTERNAL_STORAGE`
and `WRITE_EXTERNAL_STORAGE` first — a sideloaded app gets no permission prompt.

**`detectDNS = true` stops capturing DNS after a network change.** Pin
`detectDNS = false`, give an explicit `fallbackDNS` (the router) and set
`routeIPs = <gateway>`. The `routeIPs` line is what puts the router's resolver
inside the tunnel.

**The list is only rebuilt at boot**, and only when `FILTERHOSTS.TXT` is missing,
the configured interval has passed, or `filterAutoUpdateURL` is set. The script
sidesteps all of that by pushing the file itself and disabling auto-update; when
you edit the list, push it again and reboot.

**`additionalHosts.txt` is ignored** on at least Fire OS 7.7 builds — entries
there never take effect. Custom hosts belong in the pushed list
(`data/blocklists/extra-hosts.txt`, merged by `dnsfilter.sh`), not in that file.

**The VPN consent dialog is phone-sized on TVs** and often ignores directional
keys and taps. Pre-granting `appops ... ACTIVATE_VPN allow` skips it entirely.

## The launcher

**The accessibility service is the only hook, and it can be cleared.** If HOME
lands on Amazon's home screen, check:

```sh
adb shell settings get secure enabled_accessibility_services   # empty = broken
adb shell settings get secure accessibility_enabled             # 0 = broken
```

Re-run `scripts/launcher.sh`. Toggling the service off and on again is what
actually rebinds it. Force-stopping the launcher (`am force-stop tv.dumbtv.home`,
which any test harness and any APK update does) is enough to lose the binding:
the setting still reads enabled, and HOME silently goes back to Amazon's home.

**Enabled is not the same as bound.** `scripts/verify.sh` also reads
`dumpsys accessibility` and looks for `dumbtv home button` in the current
user's bound services. Android 9 labels this section `services`; newer builds
use `Bound services`. A service appearing only under `Enabled services` or
`Binding services` is not a running hook. Unknown dump formats fail verification
instead of reporting success. These dumps expose labels rather than component
IDs, so this check also requires the exact Guard component in the enabled list.
It does not press HOME or prove the physical remote works.

On the [TCL G08 build in the catalog](../catalog/devices/androidtv-tcl-g08.yaml),
an enabled but unbound companion service was blocked by `TclAppBoot` with
`callee doesn't have OP_AUTO_START permission`. Granting that app's `AUTO_START`
app-op and rebinding its service resolved it, including after reboot. This is
a TCL-specific observation, not a permission to grant on every TV. Preserve
other enabled accessibility services when rebinding. The verifier only reports
the failure; it never changes permissions or restarts services.

**Amazon's home for ~5 s on every HOME press** means
`alarm_manager_constants` lost `min_futurity=0` (an update or a settings reset).
Check with `adb shell settings get global alarm_manager_constants` and re-run
`scripts/launcher.sh`. With it set, HOME shows ~0.3 s of black, then the home
screen.

**The HOME key never reaches an accessibility key filter on Fire OS** — D-pad
keys do, HOME does not. Do not build on `onKeyEvent` for HOME; react to Amazon's
home window instead, as `launcher/` does.

**`android.settings.SETTINGS` reopens Amazon's home** on Fire OS: it resolves to a
stub (`CTSDummySettingsHandler`) that forwards to `HomeActivity_vNext`, which the
launcher then replaces. Open settings with `MAIN` +
`android.intent.category.LEANBACK_SETTINGS` instead.

**Injected keys skip accessibility filters.** `adb shell input keyevent HOME`
proves nothing about a real remote; to test like a remote, write to the remote's
input device: `sendevent /dev/input/eventN 1 172 1` (shell is in the `input`
group; find N with `getevent -pl`).

**After every boot the home screen takes ~15 s to appear**; until then Android shows
`com.amazon.tv.settings.v2/.system.FallbackHome`, a blank screen. That is startup
order, not damage.

## Packages

**A disabled package can still be running.** Persistent priv-apps ignore
`pm disable-user` for the *running process*: the state changes, the process
stays, and `am force-stop` is accepted but does not kill it. `debloat.sh` has a
second pass that denies such packages background work and data.

**`com.amazon.vizzini` must not be disabled.** It is persistent, and while
disabled it draws a non-focusable "Unable to Detect Your Remote" window over
everything that no tap can dismiss — taps go to the focused window underneath.
It is in `never-disable.txt`; block its endpoints instead.

**Protected lists change per build.** A package that disables on Fire OS 7.7.1.7
may be protected on another build, and vice versa. Trust the output, not the
file.

## Updates

**An Amazon update re-enables a lot of this.** The OTA packages are protected, so
the only defence is DNS: `softwareupdates.amazon.com` and the payload CDN must not
resolve. That is what `extra-hosts.txt` does. If the user ever unblocks them, or
factory-resets, re-run the pass.

## What never works

- `adb root` / `adb remount` — `user` build, `ro.secure=1`.
- Writing `/system/etc/hosts` — dm-verity, and the documented brick path.
- `pm hide`, `pm suspend`, `pm clear` on protected packages — missing permissions.
- Disabling the launcher — protected, and it leaves the TV with no home screen.
