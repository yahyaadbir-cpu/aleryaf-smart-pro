import test from "node:test";
import assert from "node:assert/strict";
import { resolveGoogleEmailAccess } from "./lib/google-auth";

test("google access lookup treats configured emails case-insensitively", () => {
  const access = resolveGoogleEmailAccess("YAHYAADBIR@GMAIL.COM");
  assert.equal(typeof access.allowed, "boolean");
  assert.equal(access.email, "yahyaadbir@gmail.com");
});
