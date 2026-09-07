import DistributorsRepo from "./distributors.repository.js";
import { publishEvent } from "../../config/nats-streams.js";

export default {
  async getProfile(userId) {
    const profile = await DistributorsRepo.findByUserId(userId);
    if (!profile) throw new Error("Distributor profile not found");

    return profile;
  },

  async updateProfile(userId, data) {
    const updated = await DistributorsRepo.updateProfile(userId, data);
    return {
      message: "Profile updated",
      profile: updated,
    };
  }

  
};

export function publishDistributorUpdated(data) {
  return publishEvent("distributor.profile.updated", data);
}