// src/modules/inventory/distributor-inventory.service.js
import DistributorInventoryRepo from "./distributor-inventory.repository.js";

export default {
  async listForCurrentDistributor(user) {
    if (!user || user.role !== "distributor") throw new Error("Forbidden");
    const dist = await DistributorInventoryRepo.findDistributorByUserId(user.id);
    if (!dist) throw new Error("Distributor profile not found");
    return DistributorInventoryRepo.listForDistributor(dist.id);
  },

  async importVariant(user, { variantId, stock, costPrice, sellingPrice, expiry, lowStockThreshold }) {
    if (!user || user.role !== "distributor") throw new Error("Forbidden");
    const dist = await DistributorInventoryRepo.findDistributorByUserId(user.id);
    if (!dist) throw new Error("Distributor profile not found");

    return DistributorInventoryRepo.upsertInventory(dist.id, variantId, {
      stock,
      costPrice,
      sellingPrice,
      expiry: expiry ? new Date(expiry) : null,
      lowStockThreshold,
    });
  },
};
