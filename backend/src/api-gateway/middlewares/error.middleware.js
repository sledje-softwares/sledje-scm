// src/api-gateway/middlewares/error.middleware.js
//
// The codebase has no error taxonomy - every service throws a plain `Error`
// with a human-readable message (see `throw new Error("Not owner")`,
// `throw new Error("Order not found")`, etc. across src/modules/**). Rather
// than touch every one of those throw sites, this middleware classifies them
// by message shape. New code should prefer AppError with an explicit status.
//
// What this replaces: with no error middleware at all, every thrown error
// fell through to Express's default handler, which returns an HTML page
// containing the full stack trace - regardless of whether the error was a
// genuine crash or a routine "Forbidden" / "Not found". See
// docs/10-known-issues.md P1-5.

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const NOT_FOUND = /not found$/i;
const FORBIDDEN = /forbidden|not (the )?owner|only .*(allowed|can )|unauthorized/i;
const BAD_REQUEST =
  /required|invalid|already|must be|cannot|no items|no modifications|nothing to (pay|do)|not modifiable|not in .*state|expired|missing/i;

// Every intentional domain throw in this codebase is a plain `new Error(...)`
// (verified: no module throws TypeError/RangeError/ReferenceError on purpose).
// So a native error subtype reaching here is always a genuine bug, not a
// validation message that happens to contain a word like "cannot" - e.g.
// "Cannot convert undefined or null to object" must not be classified as a
// 400 the way "Cannot cancel at this stage" should be. This distinction is
// what makes the keyword classifier below safe to use.
const NATIVE_ERROR_TYPES = [TypeError, RangeError, ReferenceError, SyntaxError];

function classify(err) {
  if (err.status || err.statusCode) return err.status || err.statusCode;
  if (NATIVE_ERROR_TYPES.some((T) => err instanceof T)) return 500;

  const msg = err.message || "";
  if (NOT_FOUND.test(msg)) return 404;
  if (FORBIDDEN.test(msg)) return 403;
  if (BAD_REQUEST.test(msg)) return 400;
  return 500;
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = classify(err);

  if (status >= 500) {
    // Full detail server-side only. The client never sees a stack trace or
    // an internal error message that might describe schema/implementation
    // details.
    console.error(`❌ ${req.method} ${req.originalUrl} ->`, err);
    return res.status(500).json({ error: "Internal server error" });
  }

  res.status(status).json({ error: err.message });
}
