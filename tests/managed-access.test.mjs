import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { isAllowedAccessCode, resolveAccessUser } from "../api/_lib/managed.js";

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
