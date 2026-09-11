import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyApiFailure,
  retryDelayMs,
  shouldRetryRateLimit,
  waitSeconds,
} from '../static/js/retry-policy.js';

test('HTTP 429 is classified as rate limit and retried', () => {
  const error = Object.assign(new Error('Too Many Requests'), { status: 429, retryAfterSeconds: 12 });
  assert.equal(classifyApiFailure(error), 'rate_limit');
  assert.equal(shouldRetryRateLimit(error, 0, 4), true);
  assert.equal(shouldRetryRateLimit(error, 4, 4), false);
  assert.equal(retryDelayMs(error, 0), 12_250);
  assert.equal(waitSeconds(retryDelayMs(error, 0)), 13);
});

test('credit exhaustion is not treated as a transient rate limit', () => {
  const error = Object.assign(new Error('Insufficient credits'), { status: 402 });
  assert.equal(classifyApiFailure(error), 'credits');
  assert.equal(shouldRetryRateLimit(error, 0, 4), false);
});

test('unknown errors remain other', () => {
  const error = Object.assign(new Error('Upstream unavailable'), { status: 502 });
  assert.equal(classifyApiFailure(error), 'other');
});
