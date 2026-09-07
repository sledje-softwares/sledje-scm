// src/utils/deliveryCode.js
//
// Retailer-held delivery confirmation codes (docs/15-delivery-confirmation.md).
//
// Stored ENCRYPTED, not hashed: the retailer must be able to read the code
// back days after order creation (GET /orders/retailer/orders/:id), which a
// one-way hash cannot support. AES-256-GCM keyed by DELIVERY_CODE_KEY, so a
// database dump alone does not yield a usable code.

import crypto from "crypto";

const ALGO = "aes-256-gcm";

function key() {
  const k = process.env.DELIVERY_CODE_KEY;
  if (!k) {
    throw new Error(
      "DELIVERY_CODE_KEY is not set. Generate one with: " +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const buf = Buffer.from(k, "hex");
  if (buf.length !== 32) {
    throw new Error("DELIVERY_CODE_KEY must be 32 bytes of hex (64 hex characters).");
  }
  return buf;
}

export function generateCode() {
  // 6 digits, cryptographically random, zero-padded.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

// Encrypts a code for storage. Returns base64 strings, ready for a text column.
export function encryptCode(code) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    codeEnc: enc.toString("base64"),
    codeIv: iv.toString("base64"),
    codeTag: tag.toString("base64"),
  };
}

// Reverses encryptCode() from the base64 strings read back from storage.
export function decryptCode({ codeEnc, codeIv, codeTag }) {
  const decipher = crypto.createDecipheriv(
    ALGO,
    key(),
    Buffer.from(codeIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(codeTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(codeEnc, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export function codesMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
