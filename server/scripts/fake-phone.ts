// A stand-in for the Android app, for trying the web page without a phone.
//   node scripts/fake-phone.ts <server-url> <pairing-code> [accept|decline]
// It pairs, long-polls for dial commands and reports back, exactly like the real app would.
const [base = 'http://127.0.0.1:8787', code = '', mode = 'accept'] = process.argv.slice(2);
if (!code) {
  console.error('usage: node scripts/fake-phone.ts <server-url> <pairing-code> [accept|decline]');
  process.exit(1);
}

const json = { 'content-type': 'application/json' };
const paired = await fetch(`${base}/api/pair`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ code, deviceName: 'Fake phone' }),
});
if (!paired.ok) {
  console.error('pairing failed:', paired.status, await paired.text());
  process.exit(1);
}
const { token } = (await paired.json()) as { token: string };
console.log('paired; polling for commands (Ctrl+C to stop)');

const auth = { authorization: `Bearer ${token}` };
for (;;) {
  const res = await fetch(`${base}/api/device/commands?wait=25`, { headers: auth });
  if (!res.ok) {
    console.error('poll failed:', res.status);
    process.exit(1);
  }
  const { commands } = (await res.json()) as { commands: { id: string; number: string }[] };
  for (const c of commands) {
    console.log(`dial command for ${c.number} -> ${mode}`);
    await new Promise((r) => setTimeout(r, 1500));
    const body = mode === 'decline' ? { state: 'failed', reason: 'declined on phone' } : { state: 'dialing' };
    await fetch(`${base}/api/device/calls/${c.id}/status`, { method: 'POST', headers: { ...json, ...auth }, body: JSON.stringify(body) });
  }
}
