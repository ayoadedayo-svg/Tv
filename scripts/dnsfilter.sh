#!/usr/bin/env bash
# Builds the blocklist on this machine, pushes it to the TV and installs the
# filter that uses it. No root, no router access, no account. Ends with a reboot
# and a self-test. Usage: ./scripts/dnsfilter.sh [--dry-run] [-y]
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_flags "$@"
need_device
load_conf

if [[ $DNSFILTER == 0 ]]; then
  note "DNSFILTER=0 in dumbtv.conf — skipping. Re-run ./scripts/configure.sh to change that."
  exit 0
fi

PKG=dnsfilter.android
APK_URL=https://f-droid.org/repo/dnsfilter.android_1506103.apk
# Pinned: F-Droid keeps one file per version, so this is stable. Update the hash
# deliberately when the version above changes.
APK_SHA256=3ddd0db322d1ca5fe950ea29dc1788af6e6581bb5f34694085fb4aa2e77b68ad
CONF_URL=https://raw.githubusercontent.com/IngoZenz/personaldnsfilter/master/app/src/main/assets/dnsfilter.conf
HAGEZI_URL=https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/native.amazon-onlydomains.txt
# Private work dir: fixed paths under /tmp can be pre-seeded by another local user.
WORK=$(mktemp -d "${TMPDIR:-/tmp}/dumbtv.XXXXXX") || die "could not create a temp dir"
trap 'rm -rf "$WORK"' EXIT
APK=$WORK/dnsfilter.apk
CONF_OUT=$WORK/dnsfilter.conf
RAW=$WORK/hagezi.txt
LIST=$WORK/blocklist.txt
DIR=/sdcard/Android/data/$PKG/files/PersonalDNSFilter

GW=$(gateway)
[[ -n $GW ]] || die "could not read the default gateway from 'ip route'"

step "plan"
note "filter         personalDNSfilter, runs as a local VPN on the TV"
note "gateway        $GW (put inside the tunnel so apps cannot bypass the filter)"
note "list           HaGeZi Amazon trackers + data/blocklists/extra-hosts.txt"
if [[ $PRIME == 1 ]]; then
  note "prime video    kept: the video CDN stays out of the list"
else
  note "prime video    blocked (aiv-delivery / aiv-cdn); YouTube is unaffected"
fi
if [[ $DRY_RUN == 0 ]]; then confirm "Install the on-device DNS filter on $SERIAL?" || die "cancelled"; fi

step "blocklist"
if [[ $DRY_RUN == 1 ]]; then
  note "[dry-run] download, compose and push a blocklist"
else
  curl -fsSL -o "$RAW" "$HAGEZI_URL" || die "could not download the tracker list"
  grep -v '^#' "$RAW" | awk 'NF' > "$LIST"
  if [[ $PRIME == 1 ]]; then
    # grep exits 1 when it selects nothing; that must not skip the rename.
    grep -viE 'aiv-delivery|aiv-cdn' "$LIST" > "$LIST.noprime" || true
    mv "$LIST.noprime" "$LIST"
  fi
  grep -v '^#' "$DATA/blocklists/extra-hosts.txt" | awk 'NF' >> "$LIST"
  note "$(grep -c . "$LIST") entries"
fi

step "app"
if [[ $DRY_RUN == 0 ]]; then
  curl -fsSL -o "$APK" "$APK_URL" || die "could not download $APK_URL"
  if command -v sha256sum >/dev/null; then got=$(sha256sum "$APK" | awk '{print $1}')
  else got=$(shasum -a 256 "$APK" | awk '{print $1}'); fi
  [[ $got == "$APK_SHA256" ]] || die "checksum mismatch for $APK_URL (got $got) — not installing"
  note "checksum ok"
  out=$("$ADB" -s "$SERIAL" install -r "$APK" 2>&1 | tail -1)
  printf '  %s\n' "$out"
  case $out in
    *Success*) ;;
    *) die "adb install failed: $out" ;;
  esac
fi

# The VPN consent dialog renders phone-sized on TVs and often ignores the
# remote. Pre-granting the app-op skips it entirely.
acmd appops set $PKG ACTIVATE_VPN allow >/dev/null
acmd dumpsys deviceidle whitelist +$PKG >/dev/null

step "config"
if [[ $DRY_RUN == 0 ]]; then
  curl -fsSL -o "$CONF_OUT" "$CONF_URL" || die "could not download the upstream config"
  # No filterAutoUpdateURL: the list is pushed by this script, so the TV never
  # downloads a blocklist and cannot end up with a half-written one.
  sed -i.dumbtv \
    -e 's|^filterAutoUpdateURL = |#filterAutoUpdateURL = |' \
    -e 's|^detectDNS = .*|detectDNS = false|' \
    -e "s|^fallbackDNS = .*|fallbackDNS = \\#router; [$GW]::53::UDP|" \
    -e "s|^routeIPs =.*|routeIPs = $GW|" \
    -e 's|^routeUnderlyingDNS = .*|routeUnderlyingDNS = true|' \
    -e 's|^showInitialInfoPopUp = .*|showInitialInfoPopUp = false|' \
    -e 's|^reloadIntervalDays = .*|reloadIntervalDays = 3650|' \
    -e 's|^filterHostsFile = .*|filterHostsFile = FILTERHOSTS.TXT|' \
    "$CONF_OUT"
  for want in '^#filterAutoUpdateURL' '^detectDNS = false' '^routeUnderlyingDNS = true'; do
    grep -Eq "$want" "$CONF_OUT" || die "config template changed upstream (missing: $want) — update scripts/dnsfilter.sh"
  done
  grep -Fqx "routeIPs = $GW" "$CONF_OUT" ||
    die "config template changed upstream (routeIPs did not take) — update scripts/dnsfilter.sh"
  note "patched; no list downloads on the TV"
fi

step "push"
if [[ $DRY_RUN == 0 ]]; then
  # The first launch creates DIR and writes a default config; the app is stopped
  # afterwards so it cannot write that default over the config we push next.
  # Being stopped here is harmless because the reboot below is what reloads it.
  dev "am start -n $PKG/.DNSProxyActivity" >/dev/null 2>&1
  for i in 1 2 3 4 5; do
    dev "test -d $DIR" >/dev/null 2>&1 && break
    sleep 4
  done
  dev "test -d $DIR" >/dev/null 2>&1 || die "the app did not create $DIR — is it installed?"
  dev "am force-stop $PKG" >/dev/null 2>&1
  sleep 2
  "$ADB" -s "$SERIAL" push "$CONF_OUT" "$DIR/dnsfilter.conf" | tail -1 || die "push of dnsfilter.conf failed"
  # A stale index makes the app keep serving the previous list.
  dev "rm -rf $DIR/FILTERHOSTS.TXT.idx $DIR/IDX_OUTDATED" >/dev/null 2>&1
  "$ADB" -s "$SERIAL" push "$LIST" "$DIR/FILTERHOSTS.TXT" | tail -1 || die "push of FILTERHOSTS.TXT failed"
  # Without a download-info file, the first boot after setup sees no
  # FILTERHOSTS.TXT.DLD_CNT and schedules an immediate "update ASAP" from the
  # (empty) update-URL list, replacing the pushed blocklist with a stub.
  # Writing it here marks the pushed list as fresh. Format mirrors
  # DNSFilterManager.writeDownloadInfoFile: "<entries>\n<millis>\n".
  # %s000 avoids %N, which macOS date(1) lacks.
  printf '%s\n%s000\n' "$(grep -c . "$LIST")" "$(date +%s)" > "$WORK/dld_cnt.txt"
  "$ADB" -s "$SERIAL" push "$WORK/dld_cnt.txt" "$DIR/FILTERHOSTS.TXT.DLD_CNT" | tail -1 \
    || die "push of FILTERHOSTS.TXT.DLD_CNT failed"
fi

acmd settings put secure always_on_vpn_app $PKG >/dev/null

if [[ $DRY_RUN == 1 ]]; then
  note "[dry-run] reboot, then check that blocked hosts answer 0.0.0.0"
  exit 0
fi

step "reboot and wait"
reboot_wait
sleep 20

step "self-test"
fail=0
# The VPN takes a moment to come up after boot; give it three chances before
# calling it broken.
line=""
for attempt in 1 2 3; do
  line=$(dev "ping -c1 -W2 softwareupdates.amazon.com" | head -1)
  case $line in
    *0.0.0.0*|*127.0.0.1*) break ;;
    *) [[ $attempt -lt 3 ]] && sleep 10 ;;
  esac
done
case $line in
  *0.0.0.0*|*127.0.0.1*) ;;
  *) printf '  %-34s NOT BLOCKED after 30s: %s\n' softwareupdates.amazon.com "$line"; fail=1 ;;
esac
while read -r h; do
  line=$(dev "ping -c1 -W2 $h" | head -1)
  case $line in
    *0.0.0.0*|*127.0.0.1*) printf '  %-34s blocked\n' "$h" ;;
    *) printf '  %-34s NOT BLOCKED: %s\n' "$h" "$line"; fail=1 ;;
  esac
done < <(list_of "$DATA/blocklists/verify-blocked.txt")

line=$(dev "ping -c1 -W2 www.youtube.com" | head -1)
case $line in
  *0.0.0.0*|*127.0.0.1*) printf '  %-34s WRONGLY BLOCKED\n' www.youtube.com; fail=1 ;;
  *) printf '  %-34s allowed\n' www.youtube.com ;;
esac

if [[ $fail == 1 ]]; then
  note "the filter is not in the DNS path. Do not force-stop the app — reboot the TV,"
  note "then run ./scripts/verify.sh. See docs/GOTCHAS.md."
  exit 1
fi
note "filter is live"
