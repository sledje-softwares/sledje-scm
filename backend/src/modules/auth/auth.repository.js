import { db } from "../../config/postgres.js";
import {
  users,
  retailers,
  distributors,
  otpCodes,
} from "../../db/schema.js";
import { sql, eq, and, gt } from "drizzle-orm";


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

  // OTP: raw SQL - expects otp_codes table present
  async saveOtp({ email, otp, expiresAt }) {
    const [row] = await db
      .insert(otpCodes)
      .values({ email, otp, expiresAt: new Date(expiresAt) })
      .returning();
    return row;
  },

  async getValidOtp(email, otp) {
    const [row] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.email, email),
          eq(otpCodes.otp, otp),
          gt(otpCodes.expiresAt, new Date())
        )
      );
    return row || null;
  },

  async deleteOtp(email) {
    return db.execute(sql`DELETE FROM otp_codes WHERE email = ${email}`);
  },

  // update password
  async updatePassword(userId, newHashed) {
    const [row] = await db.update(users).set({ password: newHashed }).where(eq(users.id, userId)).returning();
    return row;
  }
};
