// test/auth.otp.test.js
//
// Pins P5-5: OTP is brute-forceable today. auth.repository.js's saveOtp
// INSERTs (never replaces), so many codes are simultaneously valid for one
// email; verifyOtp never consumes a code or counts attempts, so there is no
// lockout at all.
//
// Fixed by Phase 3, mirroring the existing delivery-code pattern
// (delivery-code.repository.js + deliveries.service.js): attempts/
// locked_until columns on otp_codes, a 5-attempt cap (429 on the 6th wrong
// try), saveOtp replacing rather than accumulating, and resetPassword
// consuming the code it used.
//
// NOTE per the task brief: this worktree may or may not already have Phase 3
// landed (it hasn't, as of writing this file - auth.repository.js still does
// a plain INSERT with no attempts/locked_until columns, and auth.service.js's
// verifyOtp still just returns !!row with no consumption). These assertions
// target the INTENDED fixed behaviour regardless, per the Phase 6 brief -
// expect this file RED until Phase 3 lands, except possibly the "replay
// after successful reset" case, which resetPassword's existing
// getValidOtp + deleteOtp(email) may already satisfy incidentally.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../src/config/postgres.js";
import { otpCodes } from "../src/db/schema.js";
import { startTestServer, stopTestServer, resetDb, apiRequest, seedRetailer } from "./helpers.js";

let server;
let baseUrl;

before(async () => {
  await resetDb();
  ({ server, baseUrl } = await startTestServer());
});

after(async () => {
  await stopTestServer(server);
});

async function otpRowsFor(email) {
  return db.select().from(otpCodes).where(eq(otpCodes.email, email));
}

/** Returns the row(s) present in `after` but not in `before`, by id. */
function newRows(before, after) {
  const beforeIds = new Set(before.map((r) => r.id));
  return after.filter((r) => !beforeIds.has(r.id));
}

test("six consecutive wrong OTPs lock the email out with 429 (P5-5)", async () => {
  const { user } = await seedRetailer();

  const forgot = await apiRequest(baseUrl, {
    method: "POST",
    path: "/auth/forgot-password",
    body: { email: user.email },
  });
  assert.equal(forgot.status, 200, `forgot-password should always 200, got ${forgot.status}`);

  let last;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await apiRequest(baseUrl, {
      method: "POST",
      path: "/auth/verify-otp",
      body: { email: user.email, otp: "000000" },
    });
  }

  assert.equal(
    last.status,
    429,
    `expected the 6th consecutive wrong OTP to be locked out (429), got ${last.status}: ` +
      `${JSON.stringify(last.body)}`
  );
});

test("a correct OTP cannot be replayed after a successful reset (P5-5)", async () => {
  const { user } = await seedRetailer();

  const before1 = await otpRowsFor(user.email);
  await apiRequest(baseUrl, {
    method: "POST",
    path: "/auth/forgot-password",
    body: { email: user.email },
  });
  const after1 = await otpRowsFor(user.email);
  const [issued] = newRows(before1, after1);
  assert.ok(issued, "expected an OTP row to have been saved by forgot-password");

  const first = await apiRequest(baseUrl, {
    method: "POST",
    path: "/auth/reset-password",
    body: { email: user.email, otp: issued.otp, newPassword: "new-pass-123" },
  });
  assert.equal(
    first.status,
    200,
    `the first reset with the correct OTP should succeed, got ${first.status}: ` +
      `${JSON.stringify(first.body)}`
  );

  const replay = await apiRequest(baseUrl, {
    method: "POST",
    path: "/auth/reset-password",
    body: { email: user.email, otp: issued.otp, newPassword: "another-pass-456" },
  });
  assert.notEqual(
    replay.status,
    200,
    `a used OTP must not be replayable, but the second reset-password call returned ` +
      `${replay.status}: ${JSON.stringify(replay.body)}`
  );
});

test("requesting a new OTP invalidates the previously issued one (P5-5)", async () => {
  const { user } = await seedRetailer();

  const before1 = await otpRowsFor(user.email);
  await apiRequest(baseUrl, {
    method: "POST",
    path: "/auth/forgot-password",
    body: { email: user.email },
  });
  const after1 = await otpRowsFor(user.email);
  const [firstOtp] = newRows(before1, after1);
  assert.ok(firstOtp, "expected the first OTP to have been saved");

  await apiRequest(baseUrl, {
    method: "POST",
    path: "/auth/forgot-password",
    body: { email: user.email },
  });
  const after2 = await otpRowsFor(user.email);
  const [secondOtp] = newRows(after1, after2);
  assert.ok(secondOtp, "expected the second OTP to have been saved");

  const res = await apiRequest(baseUrl, {
    method: "POST",
    path: "/auth/reset-password",
    body: { email: user.email, otp: firstOtp.otp, newPassword: "should-not-work-789" },
  });

  assert.notEqual(
    res.status,
    200,
    `the old OTP should have been invalidated by the new forgot-password request, but ` +
      `reset-password succeeded with it (status ${res.status}) - today saveOtp INSERTs so ` +
      `multiple codes stay simultaneously valid for one email`
  );
});
