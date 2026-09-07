// src/utils/jwt.js
//
// Was an empty file; JWT signing and verification were independently
// inlined in modules/auth/auth.service.js AND realtime/socket.server.js,
// each with its own JWT_SECRET fallback (docs/03-architecture.md,
// docs/10-known-issues.md P3). One implementation, imported by both.

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "please_change_this";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export function signToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, ...options });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
