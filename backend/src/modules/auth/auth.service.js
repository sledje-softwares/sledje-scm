import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../../config/postgres.js";
import AuthRepo from "./auth.repository.js";
import { sendOtpEmail } from "./email.service.js";
import { publishUserRegistered, publishPasswordReset } from "./auth.events.js";
import { eq } from "drizzle-orm";
import { signToken, verifyToken } from "../../utils/jwt.js";
import { generateOtp, otpExpiryDate } from "../../utils/otp.js";

import {
  users,
  retailers,
  distributors,
  outbox,
  otpCodes,
} from "../../db/schema.js";

const SALT_ROUNDS = 10;

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

    const token = signToken({ id: created.user.id, role: "retailer" });

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

    const token = signToken({ id: user.id, role: user.role });

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

    const token = signToken({ id: user.id, role: user.role });

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
  async verifyOtp(email, otp) {
    // uses AuthRepo.getValidOtp — returns row if OTP exists and not expired
    const row = await AuthRepo.getValidOtp(email, otp);
    return !!row;
  },

  // ---------- RESET PASSWORD ----------
  async resetPassword(email, otp, newPassword) {
    const row = await AuthRepo.getValidOtp(email, otp);
    if (!row) throw new Error("Invalid or expired OTP");

    // find user
    const user = await AuthRepo.findUserByEmail(email);
    if (!user) throw new Error("User not found");

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await AuthRepo.updatePassword(user.id, hashed);
    await AuthRepo.deleteOtp(email);

    // publish event
    publishPasswordReset({ userId: user.id, email }).catch((e) => console.warn(e.message));
  },

  // ---------- helper: verify token (used by middleware) ----------
  verifyToken,
};            