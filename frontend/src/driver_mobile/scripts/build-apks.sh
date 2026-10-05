#!/usr/bin/env bash
# Builds two standalone (release) APKs of the driver app, with the JavaScript bundled in, so they run
# without Metro:
#   WayPath-server.apk  talks to the gateway at SERVER_URL (default http://13.234.125.157)
#   WayPath-local.apk   talks to http://localhost: plug the phone in and run `adb reverse tcp:80 tcp:80`
# Each has its own app id and name, so both can be installed side by side. Both are signed with the
# debug keystore (fine for testing, not for the Play Store).
#
# Usage: frontend/src/driver_mobile/scripts/build-apks.sh [output dir]   (needs the Android SDK)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(realpath -m "${1:-build/apks}")"
SERVER_URL="${SERVER_URL:-http://13.234.125.157}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
GATEWAY=src/api/gateway.ts
APK=android/app/build/outputs/apk/release/app-release.apk

cp "$GATEWAY" "$GATEWAY.bak"
trap 'mv "$GATEWAY.bak" "$GATEWAY"' EXIT
mkdir -p "$OUT"

build() { # name url idSuffix label
  sed -i "s|^export const GATEWAY_URL = .*|export const GATEWAY_URL = '$2';|" "$GATEWAY"
  echo "== $1: $2 (com.driver_mobile$3, \"$4\")"
  (cd android && ./gradlew assembleRelease -PappIdSuffix="$3" -PappLabel="$4" --console=plain -q)
  cp "$APK" "$OUT/WayPath-$1.apk"
}

build server "$SERVER_URL" "" "WayPath"
build local "http://localhost" ".local" "WayPath (local)"
ls -la "$OUT"
