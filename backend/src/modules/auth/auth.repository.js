import { db } from "../../config/postgres.js";
import {
  users,
  retailers,
  distributors,
  otpCodes,
} from "../../db/schema.js";
import { sql, eq, and, gt } from "drizzle-orm";

// Mirrors delivery-code.repository.js's MAX_ATTEMPTS/LOCK_MINUTES shape
// (that constant isn't exported, so it's redefined here rather than reaching
// into a sibling module for a magic number).
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;


export default {
  // Users
  async createUser({ role, email, password, phone }) {
    const [row] = await db.insert(users).values({
      role,
      email,
      password,
      phone,
    }).returning();
    return row;
  },

  async findUserByEmail(email) {
    const [row] = await db.select().from(users).where(eq(users.email, email));;
    return row || null;
  },

  async findUserById(id) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row || null;
  },

  // Retailer
  async createRetailer({ userId, businessName, ownerName, gstNumber, businessType, pincode, location, address }) {
    const [row] = await db.insert(retailers).values({
      userId,
      businessName,
      ownerName,
      gstNumber,
      businessType,
      pincode,
      location,
      
      address,
    }).returning();
    return row;
  },

  async findRetailerByUserId(userId) {
    const [row] = await db.select().from(retailers).where(eq(retailers.userId, userId));
    return row || null;
  },

  // Distributor
  async createDistributor({ userId, companyName, ownerName, gstNumber, businessType, pincode, location, address }) {
    const [row] = await db.insert(distributors).values({
      userId,
      companyName,
      ownerName,
      gstNumber,
      businessType,
      pincode,
      location,
      address,
    }).returning();
    return row;
  },

  async findDistributorByUserId(userId) {
    const [row] = await db.select().from(distributors).where(eq(distributors.userId, userId));
    return row || null;
  },

  // OTP: one live row per email (uq_otp_email) - a new request always
  // replaces the previous code rather than accumulating several
  // simultaneously-valid ones (P5-5). Resets the attempt/lock state too, so
  // requesting a fresh OTP is also how a locked-out user gets unstuck.
  async saveOtp({ email, otp, expiresAt }) {
    const [row] = await db
      .insert(otpCodes)
      .values({ email, otp, expiresAt: new Date(expiresAt) })
      .onConflictDoUpdate({
        target: otpCodes.email,
        set: {
          otp,
          expiresAt: new Date(expiresAt),
          attempts: 0,
          lockedUntil: null,
          consumedAt: null,
          createdAt: new Date(),
        },
      })
      .returning();
    return row;
  },

  // Fetches the row by email regardless of whether the submitted code
  // matches, so the service layer can check lockedUntil/expiry/consumedAt
  // BEFORE ever comparing the code (mirrors delivery-code.repository.js's
  // get()).
  async getActiveOtp(email) {
    const [row] = await db.select().from(otpCodes).where(eq(otpCodes.email, email));
    return row || null;
  },

  // Increments attempts; once the count reaches MAX_ATTEMPTS, sets
  // lockedUntil to now+15min. Returns the updated row so the caller can
  // craft a "N attempts remaining" vs "locked" message, same shape as
  // delivery-code.repository.js's recordFailedAttempt.
  async recordFailedOtpAttempt(email, currentAttempts) {
    const attempts = currentAttempts + 1;
    const patch = { attempts };
    if (attempts >= MAX_ATTEMPTS) {
      patch.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
    }
    const [row] = await db
      .update(otpCodes)
      .set(patch)
      .where(eq(otpCodes.email, email))
      .returning();
    return row || patch;
  },

  // Marks the OTP used. Takes the transaction explicitly (like
  // delivery-code.repository.js's markConsumed) because it must be atomic
  // with resetPassword's password update and tokenVersion bump - a
  // successful reset is what invalidates the code, not a prior verifyOtp call.
  async consumeOtp(tx, email) {
    await tx.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.email, email));
  },

  async deleteOtp(email) {
    return db.execute(sql`DELETE FROM otp_codes WHERE email = ${email}`);
  },

  // update password + bump tokenVersion (session invalidation) atomically.
  // Kept as one call so resetPassword's transaction only has to make one
  // repository call for both effects.
  async updatePassword(tx, userId, newHashed) {
    const [row] = await tx
      .update(users)
      .set({ password: newHashed, tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId))
      .returning();
    return row;
  },
};
