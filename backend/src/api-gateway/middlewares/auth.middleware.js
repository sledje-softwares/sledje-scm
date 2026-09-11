import AuthService from "../../modules/auth/auth.service.js";
import { db } from "../../config/postgres.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "Unauthorized" });

    const token = auth.split(" ")[1];
    const payload = AuthService.verifyToken(token);
    if (!payload) return res.status(401).json({ message: "Invalid token" });

    // Session revocation (P5-8): resetPassword bumps users.tokenVersion, which
    // must invalidate every token minted before it even though the JWT itself
    // stays cryptographically valid until its 7-day expiry - otherwise "reset
    // your password to evict the attacker" doesn't actually evict them.
    //
    // Only retailer/distributor tokens carry tokenVersion today (this phase
    // deliberately left delivery-agents.service.js's signing untouched, since
    // it's a different module out of scope here) - so the check is skipped
    // for a payload with no tokenVersion at all, rather than failing every
    // request from a token shape this phase didn't touch. A token that DOES
    // carry tokenVersion must match the current DB value exactly.
    if (payload.tokenVersion !== undefined) {
      const [user] = await db
        .select({ tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, payload.id));
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        return res.status(401).json({ message: "Invalid token" });
      }
    }

    req.user = payload; // { id, role, tokenVersion?, iat, exp }
    next();
  } catch (err) {
    next(err);
  }
}
