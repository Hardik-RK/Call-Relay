# Security notes

A model of who can do what, so you can judge whether the defaults fit your situation.

## Trust model

| Actor | Gets | How |
| --- | --- | --- |
| Anyone who can reach the server's web API | Can queue calls, mint pairing codes, unpair phones | Nothing by default on loopback. `ACCESS_KEY` header when configured. |
| A paired phone | Can fetch its own commands and report on its own calls | Bearer token from pairing. |
| Anyone else on the network | Can try to pair or hit the API | Needs a live 8-character code; rate limited. |

There are no user accounts. The access key is one shared secret for the web page.

## What is protected, and how

- **Pairing code:** 8 characters from a 31-character alphabet without look-alikes (about 40 bits), generated with `crypto.randomInt`. One live code at a time, 10 minute expiry, single use, burned after 5 wrong guesses, compared via SHA-256 and `timingSafeEqual`.
- **Device token:** 256 random bits, shown to the phone once. The server stores only its SHA-256, and the state file is written with mode 0600 where the OS supports it. Unpairing from either side invalidates it immediately.
- **Rate limits (in memory, per remote address):** pairing 5 per minute, calls 10 per minute, codes 5 per minute, general web API 240 per minute, long polls 120 per minute per device, and a lockout after 10 failed access-key or token attempts in a minute (the lockout applies even to a correct credential until the window passes).
- **Browser attacks on a localhost server:** the API rejects any request carrying a foreign `Origin`, requires `application/json` on writes (so a cross-site HTML form cannot post), and checks `Host` against an allow-list to defeat DNS rebinding. No CORS headers are ever sent.
- **Phone side:** commands are accepted only as `dial` with a UUID-shaped id and a strict E.164 number. The call always needs a tap. The lock-screen notification hides the number.

## What is not protected

- **No TLS.** Tokens and the access key cross the wire in the clear over `http://`. Use a private network that encrypts (WireGuard-based overlays do) or a TLS reverse proxy.
- **Shared access key.** Anyone holding it can queue calls. Rotate it by changing `ACCESS_KEY` and restarting; existing phone tokens keep working until unpaired.
- **Per-address limits behind a proxy.** `X-Forwarded-For` is ignored on purpose (it is spoofable), so clients behind one proxy share a bucket.
- **Restarts reset limits and open codes.** Limits and pairing codes are in memory only. Devices and recent calls persist in `DATA_FILE`.
- **Rooted or backed-up phones.** The token sits in private app storage unencrypted; backups are disabled.
- **Abuse of the call itself.** Validation checks number shape, not intent. There is no blocklist or premium-rate filter; the confirmation tap is the control.

## Reporting a problem

This is a personal portfolio project. Open an issue on the repository if you find a hole.
