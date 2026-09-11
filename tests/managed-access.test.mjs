import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  enforceRateLimit,
  isAllowedAccessCode,
  resolveAccessUser,
  sanitizeFirecrawlBody,
} from "../api/_lib/managed.js";

function hash(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

test("named managed user is resolved", () => {
  const code = "HRP-test-alice";
  process.env.MANAGED_ACCESS_USERS_JSON = JSON.stringify([
    { user: "alice", hash: hash(code), enabled: true },
  ]);
  process.env.MANAGED_ACCESS_CODE_HASHES = "";

  assert.equal(resolveAccessUser(code), "alice");
  assert.equal(isAllowedAccessCode(code), true);
  assert.equal(isAllowedAccessCode("HRP-wrong"), false);
});

test("disabled named user is rejected", () => {
  const code = "HRP-test-bob";
  process.env.MANAGED_ACCESS_USERS_JSON = JSON.stringify([
    { user: "bob", hash: hash(code), enabled: false },
  ]);
  process.env.MANAGED_ACCESS_CODE_HASHES = "";

  assert.equal(resolveAccessUser(code), null);
});

test("legacy hash remains supported", () => {
  const code = "HRP-test-legacy";
  process.env.MANAGED_ACCESS_USERS_JSON = "";
  process.env.MANAGED_ACCESS_CODE_HASHES = hash(code);

  assert.equal(resolveAccessUser(code), "legacy");
});

test("Firecrawl search is server-side capped", () => {
  const sanitized = sanitizeFirecrawlBody("search", {
    query: "x".repeat(900),
    limit: 9999,
    includeDomains: Array.from({ length: 30 }, (_, i) => `example${i}.ru`),
    sources: ["web", "news", "images", "extra"],
    dangerousOption: true,
  });

  assert.equal(sanitized.query.length, 500);
  assert.equal(sanitized.limit, 50);
  assert.equal(sanitized.includeDomains.length, 20);
  assert.equal(sanitized.sources.length, 3);
  assert.equal("dangerousOption" in sanitized, false);
});

test("Firecrawl crawl is server-side capped", () => {
  const sanitized = sanitizeFirecrawlBody("crawl", {
    url: "https://example.org",
    limit: 5000,
    maxDiscoveryDepth: 99,
    crawlEntireDomain: true,
    includePaths: Array.from({ length: 80 }, (_, i) => `/p/${i}`),
  });

  assert.equal(sanitized.limit, 100);
  assert.equal(sanitized.maxDiscoveryDepth, 6);
  assert.equal(sanitized.includePaths.length, 50);
});

test("rate limiter rejects requests above per-user budget", () => {
  const req = { hrPomoshnikUser: `rate-test-${Date.now()}` };
  const state = { status: 0, payload: null, headers: {} };
  const res = {
    setHeader(name, value) { state.headers[name] = value; },
    status(value) { state.status = value; return this; },
    json(value) { state.payload = value; return this; },
  };

  assert.equal(enforceRateLimit(req, res, "unit", 2, 60_000), true);
  assert.equal(enforceRateLimit(req, res, "unit", 2, 60_000), true);
  assert.equal(enforceRateLimit(req, res, "unit", 2, 60_000), false);
  assert.equal(state.status, 429);
  assert.match(state.payload.error, /слишком много/i);
});
