// test/profile.patch.test.js
//
// Pins P5-14: uploading a profile picture NULLs the rest of a distributor's
// profile. distributors.repository.js's updateProfile does an unconditional
// full-record .set() built from `data.companyName`, `data.gstNumber`, etc -
// upload.routes.js's profile-picture handler calls it with only
// `{ profilePictureUrl }`, so every other field the caller didn't pass comes
// through as `undefined` and gets written as NULL.
//
// This exercises DistributorsRepo.updateProfile directly rather than going
// through POST /api/upload/profile-picture: that HTTP route calls the real
// Google Drive API (uploadFileToDrive) before it ever reaches the repository
// call this test targets, which would make the test depend on Drive
// credentials that have nothing to do with P5-14.
//
// Fixed by Phase 5: build the .set() object from defined keys only.
// Expected RED until then - today this test observes companyName/gstNumber/
// address getting wiped to NULL by a profile-picture-only update.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, seedDistributor } from "./helpers.js";
import DistributorsRepo from "../src/modules/distributors/distributors.repository.js";

let server;

before(async () => {
  await resetDb();
  ({ server } = await startTestServer());
});

after(async () => {
  await stopTestServer(server);
});

test("updating only profilePictureUrl must not wipe the rest of the distributor's profile (P5-14)", async () => {
  const { user, profile } = await seedDistributor({
    companyName: "Known Company Pvt Ltd",
    gstNumber: "29ABCDE1234F1Z5",
    address: "123 Known Street, Bengaluru",
  });

  // Sanity on the seed itself before we touch anything.
  assert.equal(profile.companyName, "Known Company Pvt Ltd");
  assert.equal(profile.gstNumber, "29ABCDE1234F1Z5");
  assert.equal(profile.address, "123 Known Street, Bengaluru");

  await DistributorsRepo.updateProfile(user.id, {
    profilePictureUrl: "https://drive.example/pic.jpg",
  });

  const after = await DistributorsRepo.findByUserId(user.id);

  assert.equal(
    after.companyName,
    profile.companyName,
    "companyName was wiped to NULL by a profile-picture-only update"
  );
  assert.equal(
    after.gstNumber,
    profile.gstNumber,
    "gstNumber was wiped to NULL by a profile-picture-only update"
  );
  assert.equal(
    after.address,
    profile.address,
    "address was wiped to NULL by a profile-picture-only update"
  );
  assert.equal(after.profilePictureUrl, "https://drive.example/pic.jpg");
});
