# Android constraints and what to expect

This app asks Android to do things it deliberately makes awkward: stay connected in the background, put something in front of you, and place a phone call. This page says what the code does about each, and how sure we are.

**Verification level.** Everything below describes design intent grounded in Android's documented rules. The code compiles, the pure-Kotlin parts have unit tests, and lint is clean. The runtime behaviour has **not** been run on a device or emulator. Nothing here should be read as "confirmed on hardware".

## 1. Receiving commands in the background

There is no push provider. The app runs a foreground service (`PollService`) that long-polls `GET /api/device/commands?wait=25`. The server holds each request open for up to 25 seconds and answers the moment a call is queued.

- **Foreground service type.** Declared as `specialUse` with a justification property. The obvious alternatives were rejected: `phoneCall` needs the default-dialer role or a self-managed `ConnectionService` on Android 14 and throws a `SecurityException` otherwise, and `dataSync` gets a hard time limit on Android 15 (about six hours in 24) after which the system stops the service. `specialUse` has neither problem, but it requires a declared subtype and would need Google Play review if the app were ever published there. For a self-built APK that is irrelevant.
- **Notification.** A foreground service must show a persistent notification. On Android 13 and later the user can deny the notification permission; the service still runs, but the prompt notification for incoming calls cannot be shown, so calls would be missed while the app is closed. The app asks for the permission after pairing.
- **Battery optimisation and OEM task killers.** Stock Android keeps a foreground service alive. Some manufacturers (aggressive "battery savers", "app sleeping" lists) kill it anyway. The home screen has a button that opens the system battery settings; allowing unrestricted use is the best mitigation, and it is a per-device manual step. See https://dontkillmyapp.com for the zoo.
- **After a reboot or force-stop.** There is no boot receiver. Android 15 restricts which foreground service types may start from boot, and a force-stopped app cannot start anything until the user opens it. Open the app once to resume listening.
- **Restart after being killed.** The service returns `START_STICKY`. Android may restart it, but starting a foreground service from the background is restricted on Android 12 and later and can throw. The code catches that and stops instead of crashing; the status line then asks you to open the app.
- **Doze.** While the phone is idle in Doze, network access is deferred and the long-poll can stall until a maintenance window. Expect delays of minutes, not seconds, on an idle unplugged phone. High-priority push (FCM) is the platform's answer to this and was deliberately left out; it is the main thing you give up by having no Google dependency.

## 2. Showing the "Call this number?" prompt

- **App on screen:** an in-app dialog.
- **App in the background:** a high-importance notification with three actions: tap it (opens the confirm dialog), **Call** (opens the app and places the call straight away), **Decline** (reports failure, starts nothing). The lock screen shows a redacted version that hides the number until unlock.
- **Full-screen intent.** The notification also sets a full-screen intent so it can take over an idle or locked screen. This is a best effort. On Android 14 and later the `USE_FULL_SCREEN_INTENT` permission is granted by default only to apps whose primary purpose is calling or alarms, and it can be revoked; this app is neither. If the system declines, the notification falls back to a heads-up banner, which is why the actions exist. A settings shortcut for it is on the home screen.
- **No trampolines.** Since Android 12 a notification tap may not go through a service or broadcast receiver to start an activity. The Call and tap actions therefore point directly at `MainActivity`. Only Decline uses a broadcast receiver, because it starts nothing.

## 3. Placing the call

- **Background activity launch limits.** An app in the background cannot just open the dialer. The system silently blocks it, with no exception. A foreground service does not lift the restriction. That is why the service never calls `startActivity`: dialing happens only from the activity, after a tap.
- **ACTION_CALL needs `CALL_PHONE`.** The first time a call is placed the app requests it. If granted, `ACTION_CALL` starts the call immediately. If denied, the app falls back to `ACTION_DIAL`, which opens the dialer with the number filled in and needs one more press. `ACTION_DIAL` needs no permission.
- **Locked phone.** The activity asks to show over the lock screen, but the telephony stack still wants the device unlocked for a normal call. Expect to unlock.
- **What "Dialing" means.** The app reports `dialing` when `startActivity` returned without throwing. It does not read the call log or telephony state, so it cannot tell whether the call connected, rang out or was cancelled in the dialer. The page says "Dialing", not "Connected".
- **Dual SIM and carrier apps.** The system picks the SIM per its default. Third-party dialers and some OEM dialers may behave differently. Not handled.

## 4. Network

- **Cleartext HTTP is allowed** (`usesCleartextTraffic`), because the realistic targets are LAN and private-network addresses without certificates. HTTPS URLs work too. Android cannot restrict cleartext to "private ranges only", so the manifest is permissive; weigh that for your own use.
- **Emulator:** the host machine is `10.0.2.2`.
- **Cellular vs home network:** a server on `127.0.0.1` or a home LAN address is reachable from the phone only when the phone can route to it. Use a private network overlay for the away-from-home case.

## 5. Things that would strengthen it (not done)

- Firebase Cloud Messaging as a wake-up signal, for Doze reliability.
- Keystore-backed token storage.
- A self-managed `ConnectionService` for tighter call state.
- Instrumented tests on an emulator for the service, notification and permission flows.
