import RetailersRepo from "./retailers.repository.js";
import { publishEvent } from "../../config/nats-streams.js";

export default {
  async getProfile(userId) {
    const profile = await RetailersRepo.findByUserId(userId);
    if (!profile) throw new Error("Retailer profile not found");

    return profile;
  },

  async updateProfile(userId, data) {
    const updated = await RetailersRepo.updateProfile(userId, data);
    return {
      message: "Profile updated",
      profile: updated,
    };
  }
};

export function publishRetailerUpdated(data) {
  return publishEvent("retailer.profile.updated", data);
}