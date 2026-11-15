import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';

test('defaults are local-only and need no key', () => {
  const c = loadConfig({});
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.port, 8787);
  assert.equal(c.defaultCountry, 'IN');
  assert.equal(c.accessKey, null);
});

test('binding beyond loopback works without ACCESS_KEY (the phone confirms every call)', () => {
  assert.equal(loadConfig({ HOST: '0.0.0.0' }).accessKey, null);
  assert.equal(loadConfig({ HOST: '100.64.0.1' }).accessKey, null);
});

test('non-loopback bind works with a key', () => {
  const c = loadConfig({ HOST: '0.0.0.0', ACCESS_KEY: 'a-long-enough-secret', ALLOWED_HOSTS: 'Box.example, 100.64.0.1' });
  assert.deepEqual(c.allowedHosts, ['box.example', '100.64.0.1']);
});

test('short keys, bad ports and unknown countries are rejected', () => {
  assert.throws(() => loadConfig({ ACCESS_KEY: 'short' }), /at least 12/);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /Invalid PORT/);
  assert.throws(() => loadConfig({ DEFAULT_COUNTRY: 'ZZ' }), /Invalid DEFAULT_COUNTRY/);
});

test('empty DATA_FILE means memory only', () => {
  assert.equal(loadConfig({ DATA_FILE: '' }).dataFile, null);
  assert.equal(loadConfig({ DATA_FILE: './x.json' }).dataFile, './x.json');
});
