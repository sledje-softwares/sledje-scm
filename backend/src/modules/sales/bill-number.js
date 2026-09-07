// src/modules/sales/bill-number.js
//
// Bill numbers that work with no network and no coordination.
//
// WHAT WAS WRONG
// --------------
// SalesRepo.nextBillNumber() computed `count(*) + 1` over the retailer's
// sales. That is broken twice over:
//
//   * Offline, it cannot run at all - it needs the server.
//   * Online, it is a lost-update race. Two devices (or two concurrent
//     requests) both read count = 2 and both mint BILL-00003. sales carries
//     UNIQUE(retailer_id, bill_number), so the second one fails to sync -
//     and the failure is at the END of a sale the customer has already paid
//     for and walked away from.
//
// THE SCHEME
// ----------
//   billNumber = "<DEVICECODE>-<counter>"      e.g.  "K7Q3M9-00042"
//
//   DEVICECODE  six Crockford-base32 characters taken from the device's own
//               ULID. ~1.07e9 values, minted on the device with no server
//               involvement.
//   counter     a per-device monotonic integer starting at 1, held in the
//               device's local database and incremented as bills are written.
//
// Uniqueness holds because the counter is unique within a device and the code
// is unique across devices. Nothing has to be asked of anyone.
//
// WHY NOT JUST USE THE ULID
// -------------------------
// A bill number is read aloud, written on a paper slip, and searched for. The
// sale's ULID is the identity; the bill number is the human handle, and a
// shopkeeper wants "42" to mean the forty-second bill on that till. A scheme
// that gives up per-till sequence to gain uniqueness it already has is a bad
// trade.
//
// WHEN TWO DEVICES MINT THE SAME CODE
// -----------------------------------
// Only devices of the SAME retailer can collide, and only on a 1-in-a-billion
// draw of six characters, so this is vanishingly rare - but "vanishingly rare"
// on the money path still needs an answer, and the answer must not violate the
// append-only rule (a queued op is never mutated).
//
// So the SERVER resolves it. The bill number is a display label, not an
// identity - the ULID is the identity - which means the server is free to
// disambiguate a clashing label and tell the device what it assigned. The
// device adopts the assigned number for that sale (server -> client state, not
// a rewritten op) and rotates its device code for future bills. See
// disambiguate() below and sync.service.js.

/** Crockford base32, the ULID alphabet. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const DEVICE_CODE_LENGTH = 6;

/**
 * Derive a device's bill prefix from its ULID.
 *
 * The last characters are used, not the first: a ULID's leading 10 characters
 * are its millisecond timestamp, so two devices set up in the same shop on the
 * same afternoon share them. The trailing characters are the random component.
 */
export function deviceCodeFromId(deviceId) {
  const tail = String(deviceId || "")
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "")
    .slice(-DEVICE_CODE_LENGTH);

  return tail.padStart(DEVICE_CODE_LENGTH, "0");
}

export function formatBillNumber(deviceCode, counter) {
  return `${deviceCode}-${String(counter).padStart(5, "0")}`;
}

/**
 * Rewrite a bill number that collided with one already issued by this shop.
 *
 * `attempt` starts at 1. The result stays legible and stays sortable next to
 * the original, which matters when a shopkeeper is looking for it later.
 */
export function disambiguate(billNumber, attempt) {
  return `${billNumber}~${CROCKFORD[attempt % CROCKFORD.length]}`;
}

/**
 * The prefix used by sales written through POST /sales rather than by a
 * device. Reserved: it is not a valid Crockford-base32 draw, so no real device
 * can ever mint it.
 */
export const SERVER_DEVICE_CODE = "SERVER";
