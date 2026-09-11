// src/utils/jwt.js
//
// Was an empty file; JWT signing and verification were independently
// inlined in modules/auth/auth.service.js AND realtime/socket.server.js,
// each with its own JWT_SECRET fallback (docs/03-architecture.md,
// docs/10-known-issues.md P3). One implementation, imported by both.
//
// JWT_SECRET has no fallback: a hardcoded default would sign and verify
// every token in the system with a value visible in source, and boot
// silently on a misconfigured deploy. Same shape as utils/deliveryCode.js's
// key() - lazy (checked on use, not at import) so a missing env var doesn't
// crash an unrelated import chain, e.g. `node -e "import('./src/app.js')"`.

import jwt from "jsonwebtoken";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error(
      "JWT_SECRET is not set. Generate one with: " +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (s.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
  }
  return s;
}

export function signToken(payload, options = {}) {
  return jwt.sign(payload, secret(), { expiresIn: JWT_EXPIRES_IN, ...options });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}
