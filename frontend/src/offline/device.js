// src/offline/device.js
//
// This device's identity and its bill-number allocator.
//
// Both are minted locally, on first use, with no server involvement - which is
// the point. A till that has to ask permission before it can identify itself
// cannot open for business on a morning when the line is down.
//
// See backend/src/modules/sales/bill-number.js for the scheme and why it is
// collision-free without coordination.

import { ulid } from "ulid";
import { db, getMeta, setMeta } from "./db.js";

export const DEVICE_CODE_LENGTH = 6;

/**
 * Six Crockford-base32 characters from the tail of the device's ULID.
 *
 * The tail, not the head: a ULID's leading 10 characters are its millisecond
 * timestamp, so two tills set up in the same shop on the same afternoon would
 * share them.
 */
export function deviceCodeFromId(deviceId) {
  return String(deviceId || "")
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "")
    .slice(-DEVICE_CODE_LENGTH)
    .padStart(DEVICE_CODE_LENGTH, "0");
}

let cached = null;

/** The device's id and bill prefix, minting them on first call. */
export async function getDevice() {
  if (cached) return cached;

  let id = await getMeta("deviceId");
  if (!id) {
    id = ulid();
    await setMeta("deviceId", id);
  }

  let code = await getMeta("deviceCode");
  if (!code) {
    code = deviceCodeFromId(id);
    await setMeta("deviceCode", code);
  }

  const label = await getMeta("deviceLabel");
  cached = { id, code, label };
  return cached;
}

/**
 * Adopt a bill prefix the server assigned us because another device of this
 * shop already had ours.
 *
 * Only future bills are affected. Bills already queued keep the numbers they
 * were written with - those ops are append-only, and the server disambiguates
 * any that genuinely clash.
 */
export async function adoptDeviceCode(code) {
  if (!code) return;
  await setMeta("deviceCode", code);
  if (cached) cached.code = code;
}

export async function setDeviceLabel(label) {
  await setMeta("deviceLabel", label);
  if (cached) cached.label = label;
}

/**
 * The next bill number for this till.
 *
 * MUST be called inside the same Dexie transaction as the sale it numbers,
 * which is why it takes no lock of its own - Dexie's transaction is the lock.
 * Otherwise two rapid sales on one device could read the same counter.
 */
export async function nextBillNumber(deviceCode) {
  const row = await db.meta.get("billCounter");
  const next = Number(row?.value || 0) + 1;
  await db.meta.put({ key: "billCounter", value: next });
  return `${deviceCode}-${String(next).padStart(5, "0")}`;
}

/** Forget the in-memory cache (after a logout / user switch). */
export function forgetDevice() {
  cached = null;
}
