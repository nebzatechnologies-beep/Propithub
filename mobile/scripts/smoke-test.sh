#!/usr/bin/env bash
# Runs inside an Android emulator: installs the APK, cold-starts the app and fails if it crashes.
set -u
PKG="com.propithub.rentalhub"
APK="${1:?apk path}"
OUT="${2:-smoke-output}"
mkdir -p "$OUT"

adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb install -r "$APK" || { echo "SMOKE FAIL: install failed"; exit 1; }
adb logcat -c

fail=0
for round in 1 2; do
  echo "== cold start #$round =="
  adb shell am force-stop "$PKG"
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  sleep 35
  adb exec-out screencap -p > "$OUT/screen-$round.png" || true
  pid="$(adb shell pidof "$PKG" | tr -d '\r')"
  if [ -z "$pid" ]; then echo "SMOKE FAIL: app process is not running after start #$round"; fail=1; fi
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/ui-$round.xml" >/dev/null 2>&1 || true
done

adb logcat -d > "$OUT/logcat.txt"
if grep -E "FATAL EXCEPTION|Process: $PKG.*(died|crash)|ANR in $PKG|java.lang.UnsatisfiedLinkError|ClassNotFoundException|NoSuchMethodError" "$OUT/logcat.txt" > "$OUT/crashes.txt"; then
  echo "SMOKE FAIL: crash signatures in logcat:"; head -30 "$OUT/crashes.txt"; fail=1
fi
grep -E "ReactNativeJS" "$OUT/logcat.txt" | grep -iE "error|exception|invariant|undefined is not" | head -15 > "$OUT/js-errors.txt" || true
if [ -s "$OUT/js-errors.txt" ]; then echo "JS errors seen at startup (informational):"; cat "$OUT/js-errors.txt"; fi

# The first screen must contain some visible text (login/welcome), proving the JS bundle rendered.
for f in "$OUT"/ui-*.xml; do
  [ -f "$f" ] || continue
  n="$(grep -o 'text="[^"]\+"' "$f" | wc -l)"
  echo "$f: $n text nodes on screen"
  if [ "$n" -lt 2 ]; then echo "SMOKE FAIL: nothing rendered on screen ($f)"; fail=1; fi
done

[ "$fail" = 0 ] && echo "SMOKE PASSED: app installed, started twice, stayed alive, rendered UI" || exit 1
