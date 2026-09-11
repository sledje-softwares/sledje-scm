// Shared CORS origin-list parsing.
//
// Extracted from backend/src/app.js (its inline CORS setup, ~line 32-45) so
// Socket.IO's CORS policy can match Express's exactly instead of diverging
// (docs/10-known-issues.md-adjacent finding P5-12: the socket server used to
// default to `origin: "*"` and never comma-split CLIENT_ORIGIN the way
// app.js does).
//
// app.js now imports corsOriginHandler from here too (reconciled after the
// helmet/rate-limiting/trust-proxy change landed) - there is exactly one
// implementation of CLIENT_ORIGIN parsing/matching in the codebase.

let warnedUnset = false;

/**
 * Parse CLIENT_ORIGIN into a list of allowed origins. Comma-separated,
 * trimmed, empty entries dropped. An empty result means "no explicit
 * allowlist configured" - callers decide what that means for them; this
 * module never falls back to a literal "*".
 */
export function getAllowedOrigins() {
  return (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * CORS origin handler usable both by Express's `cors()` package (its
 * `origin` option accepts `(origin, callback)`) and by Socket.IO's
 * `cors.origin` option, which calls its function option the same way.
 *
 * Behavior mirrors app.js: reflect the request origin when it's in the
 * allowlist, reject with a 403 (not a bare 500) when it isn't, and reflect
 * unconditionally - while warning once - when CLIENT_ORIGIN isn't set at
 * all, matching the "opt-in and logged, not a silent unrestricted default"
 * intent app.js already documents.
 */
export function corsOriginHandler(origin, callback) {
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.length === 0) {
    if (!warnedUnset) {
      warnedUnset = true;
      console.warn(
        "⚠️  CLIENT_ORIGIN is not set - CORS is reflecting all origins. Set CLIENT_ORIGIN in .env for production."
      );
    }
    // No explicit allowlist configured - reflect the request origin, the
    // same effective behaviour as an unconfigured cors() call.
    return callback(null, true);
  }

  // origin is undefined for same-origin/non-browser requests (curl, mobile apps).
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);

  const err = new Error(`Origin ${origin} is not allowed by CORS (set CLIENT_ORIGIN)`);
  err.status = 403;
  callback(err);
}
