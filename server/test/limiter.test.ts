import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RateLimiter } from '../src/limiter.ts';

test('allows up to the limit then blocks with a retry hint', () => {
  let t = 0;
  const l = new RateLimiter(3, 1000, () => t);
  assert.equal(l.hit('a'), 0);
  assert.equal(l.hit('a'), 0);
  assert.equal(l.hit('a'), 0);
  assert.ok(l.hit('a') >= 1);
  assert.equal(l.hit('b'), 0, 'other keys are independent');
});

test('window resets', () => {
  let t = 0;
  const l = new RateLimiter(1, 1000, () => t);
  assert.equal(l.hit('a'), 0);
  assert.ok(l.hit('a') > 0);
  t = 1000;
  assert.equal(l.hit('a'), 0);
});

test('blocked() peeks without counting', () => {
  let t = 0;
  const l = new RateLimiter(2, 1000, () => t);
  assert.equal(l.blocked('a'), 0);
  l.hit('a');
  assert.equal(l.blocked('a'), 0);
  l.hit('a');
  assert.ok(l.blocked('a') > 0);
  t = 5000;
  assert.equal(l.blocked('a'), 0);
});
