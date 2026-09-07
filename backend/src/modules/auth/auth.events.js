import { publishEvent } from "../../config/nats-streams.js";

/**
 * Simple event helpers for auth module.
 * Keep events small but include useful info.
 */

export const publishUserRegistered = async (payload) => {
  // payload should include: userId, role, email, createdAt, profile (retailer/distributor snapshot)
  await publishEvent("users.registered", payload);
};

export const publishPasswordReset = async (payload) => {
  await publishEvent("users.password_reset", payload);
};
