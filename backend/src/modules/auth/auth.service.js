import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../../config/postgres.js";
import AuthRepo from "./auth.repository.js";
import { sendOtpEmail } from "./email.service.js";
import { publishUserRegistered, publishPasswordReset } from "./auth.events.js";
import { eq } from "drizzle-orm";
import { signToken, verifyToken } from "../../utils/jwt.js";
import { generateOtp, otpExpiryDate } from "../../utils/otp.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

import {
  users,
  retailers,
  distributors,
  outbox,
  otpCodes,
} from "../../db/schema.js";

const SALT_ROUNDS = 10;

// Must match auth.repository.js's MAX_ATTEMPTS - used only for the
// "N attempts remaining" message, not for the lock decision itself (that's
// made by recordFailedOtpAttempt, which is the source of truth on lockedUntil).
const MAX_OTP_ATTEMPTS = 5;

/**
 * Shared by the standalone /auth/verify-otp endpoint AND resetPassword, so a
 * wrong attempt on either one increments the same cumulative counter (they
 * share one row per email - P5-5). Checks lock/expiry/consumed BEFORE ever
 * comparing the submitted code, mirrors deliveries.service.js's confirmDelivery.
 *
 * Does NOT consume the OTP - only resetPassword's success does that, in the
 * same transaction as the password change, so a successful reset is what
 * actually invalidates the code.
 */
async function checkOtpAndRecordAttempt(email, otp) {
  const row = await AuthRepo.getActiveOtp(email);
  if (!row || row.consumedAt || new Date(row.expiresAt) <= new Date()) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  if (row.lockedUntil && new Date(row.lockedUntil) > new Date()) {
    throw new AppError("Too many incorrect attempts. Try again later.", 429);
  }

  if (String(otp).trim() !== row.otp) {
    const patch = await AuthRepo.recordFailedOtpAttempt(email, row.attempts);
    const remaining = Math.max(0, MAX_OTP_ATTEMPTS - patch.attempts);
    throw new AppError(
      patch.lockedUntil
        ? "Too many incorrect attempts. Locked for 15 minutes."
        : `Incorrect OTP. ${remaining} attempt(s) remaining.`,
      patch.lockedUntil ? 429 : 400
    );
  }

  return row;
}

export default {
  // ---------- REGISTER RETAILER ----------
  async registerRetailer(data) {
    const {
      email,
      password,
      phone,
      businessName,
      ownerName,
      gstNumber,
      businessType,
      pincode,
      location,
      address
    } = data;

    const existing = await AuthRepo.findUserByEmail(email);
    if (existing) throw new Error("Email already registered");

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const created = await db.transaction(async (tx) => {
      // 1) Create user
      const [userRow] = await tx
        .insert(users)
        .values({
          role: "retailer",      // ⚠ ensure this field exists in schema
          email,
          password: hashed,
          phone,
        })
        .returning();

      // 2) Create retailer
      const [retailerRow] = await tx
        .insert(retailers)
        .values({
          userId: userRow.id,          // ⚠ confirm: is this userId or user_id?
          businessName,                // ⚠ confirm schema field names
          ownerName,
          gstNumber,
          businessType,
          pincode,
          location,
          address,

        })
        .returning();

      // 3) Insert outbox entry
      await tx.insert(outbox).values({
        eventType: "users.registered",      // ⚠ confirm schema uses camelCase or snake_case
        payload: {
          userId: userRow.id,
          role: "retailer",
          email,
          retailer: retailerRow,
          createdAt: userRow.createdAt,     // ⚠ confirm field name
        },
      });

      return { user: userRow, retailer: retailerRow };
    });

    const token = signToken({
      id: created.user.id,
      role: "retailer",
      tokenVersion: created.user.tokenVersion,
    });

    publishUserRegistered({
      userId: created.user.id,
      role: "retailer",
      email,
      retailer: created.retailer,
      createdAt: created.user.createdAt,
    }).catch((e) =>
      console.warn("publishUserRegistered failed:", e.message)
    );

    return {
      message: "Registration successful",
      token,
      user: { id: created.user.id, email, role: "retailer" },
    };
  },

  // ---------- LOGIN RETAILER ----------
  async loginRetailer({ email, password }) {
    const user = await AuthRepo.findUserByEmail(email);
    if (!user) throw new Error("Invalid credentials");

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error("Invalid credentials");

    if (user.role !== "retailer")
      throw new Error("Not a retailer account");

    const [retailerRow] = await db
      .select()
      .from(retailers)
      .where(eq(retailers.userId, user.id));

    const token = signToken({ id: user.id, role: user.role, tokenVersion: user.tokenVersion });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        retailer: retailerRow,
      },
    };
  },

  // ---------- REGISTER DISTRIBUTOR ----------
  async registerDistributor(data) {
    const {
      email,
      password,
      phone,
      companyName,
      ownerName,
      gstNumber,
      businessType,
      pincode,
      location,
      address
    } = data;

    const existing = await AuthRepo.findUserByEmail(email);
    if (existing) throw new Error("Email already registered");

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const created = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({
          role: "distributor",
          email,
          password: hashed,
          phone,
        })
        .returning();

      const [distRow] = await tx
        .insert(distributors)
        .values({
          userId: userRow.id,        // ⚠ confirm field
          companyName,
          ownerName,
          gstNumber,
          businessType,
          pincode,
          location,
          address,
        })
        .returning();

      await tx.insert(outbox).values({
        eventType: "users.registered",
        payload: {
          userId: userRow.id,
          role: "distributor",
          email,
          distributor: distRow,
          createdAt: userRow.createdAt,
        },
      });

      return { user: userRow, distributor: distRow };
    });

    const token = signToken({
      id: created.user.id,
      role: "distributor",
      tokenVersion: created.user.tokenVersion,
    });

    publishUserRegistered({
      userId: created.user.id,
      role: "distributor",
      email,
      distributor: created.distributor,
      createdAt: created.user.createdAt,
    }).catch((e) => console.warn("publishUserRegistered failed:", e.message));

    return {
      message: "Registration successful",
      token,
      user: { id: created.user.id, email, role: "distributor" },
    };
  },

  // ---------- LOGIN DISTRIBUTOR ----------
  async loginDistributor({ email, password }) {
    const user = await AuthRepo.findUserByEmail(email);
    if (!user) throw new Error("Invalid credentials");

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error("Invalid credentials");

    if (user.role !== "distributor")
      throw new Error("Not a distributor account");

    const [distRow] = await db
      .select()
      .from(distributors)
      .where(eq(distributors.userId, user.id));

    const token = signToken({ id: user.id, role: user.role, tokenVersion: user.tokenVersion });

    return {
      token,
      user: { id: user.id, email: user.email, role: user.role, distributor: distRow },
    };
  },

  // ---------- FORGOT PASSWORD (generate OTP) ----------
  async forgotPassword(email) {
    const user = await AuthRepo.findUserByEmail(email);
    if (!user) {
      // do not reveal whether email exists
      return;
    }

    // Cryptographically-random OTP with a TTL from OTP_TTL_MINUTES, rather
    // than Math.random() (not a CSPRNG) and a hardcoded 10-minute window.
    const otp = generateOtp(6);
    const expiresAt = otpExpiryDate();

    // save OTP (simple insert into otp_codes table)
    await AuthRepo.saveOtp({ email, otp, expiresAt });

    // send email (async)
    sendOtpEmail(email, otp).catch((e) => console.warn("sendOtpEmail failed:", e.message));
  },

  // ---------- VERIFY OTP ----------
  // Used by the standalone /auth/verify-otp endpoint (if the frontend calls
  // it separately from reset). Checks lock/expiry and records a failed
  // attempt on a wrong code, but does NOT consume the OTP - resetPassword
  // re-verifies and is the only thing that consumes it, so a bad guess here
  // can't be used to "pre-clear" a code that a subsequent reset call skips
  // re-checking.
  async verifyOtp(email, otp) {
    await checkOtpAndRecordAttempt(email, otp);
    return true;
  },

  // ---------- RESET PASSWORD ----------
  // Re-verifies the OTP server-side (does not trust a prior verifyOtp call -
  // preserves the one thing the audit found already correct here). On
  // success, the password hash update, the tokenVersion bump (session
  // invalidation - P5-8) and consuming the OTP (P5-5) all happen in the same
  // transaction, so a reset is atomically "new password + old sessions dead +
  // code can't be replayed."
  async resetPassword(email, otp, newPassword) {
    await checkOtpAndRecordAttempt(email, otp);

    const user = await AuthRepo.findUserByEmail(email);
    if (!user) throw new Error("User not found");

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await db.transaction(async (tx) => {
      await AuthRepo.updatePassword(tx, user.id, hashed);
      await AuthRepo.consumeOtp(tx, email);
    });

    // publish event
    publishPasswordReset({ userId: user.id, email }).catch((e) => console.warn(e.message));
  },

  // ---------- helper: verify token (used by middleware) ----------
  verifyToken,
};            