// The API gateway this build talks to. scripts/build-apks.sh rewrites this file for each APK it
// builds and puts it back afterwards; the committed value is the development default.
//
// http://localhost works on a phone plugged in over USB after `adb reverse tcp:80 tcp:80` (the
// phone's localhost:80 is then the gateway on the development machine). On the Android emulator
// without adb reverse, use http://10.0.2.2.
export const GATEWAY_URL = 'http://localhost';
