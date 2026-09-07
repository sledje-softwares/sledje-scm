// src/modules/distributorships/distributorships.service.js
import DistributorshipsRepo from "./distributorships.repository.js";

export default {
  async create(user, { name, description }) {
    // for now: allow both retailer & distributor or only distributor
    if (!user) throw new Error("Unauthorized");
    if (!name) throw new Error("Name is required");

    const existing = await DistributorshipsRepo.findByName(name);
    if (existing) return existing;

    return DistributorshipsRepo.createDistributorship({ name, description });
  },

  async list({ search }) {
    return DistributorshipsRepo.listAll({ search });
  },

  async getDetails(id) {
    return DistributorshipsRepo.getWithProducts(id);
  },
};
