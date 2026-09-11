// src/modules/inventory/distributor-inventory.service.js
import DistributorInventoryRepo from "./distributor-inventory.repository.js";
import DistributorshipsService from "../distributorships/distributorships.service.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

export default {
  async listForCurrentDistributor(user) {
    if (!user || user.role !== "distributor") throw new AppError("Forbidden", 403);
    const dist = await DistributorInventoryRepo.findDistributorByUserId(user.id);
    if (!dist) throw new AppError("Distributor profile not found", 404);
    return DistributorInventoryRepo.listForDistributor(dist.id);
  },

  /**
   * Phase 2b enforcement: importing a variant into the distributor's own
   * inventory requires ACTIVE membership in the distributorship the
   * variant's product belongs to - resolved here before the upsert runs.
   */
  async importVariant(user, { variantId, stock, costPrice, sellingPrice, expiry, lowStockThreshold }) {
    if (!user || user.role !== "distributor") throw new AppError("Forbidden", 403);
    const dist = await DistributorInventoryRepo.findDistributorByUserId(user.id);
    if (!dist) throw new AppError("Distributor profile not found", 404);

    const variantInfo = await DistributorInventoryRepo.findVariantProductInfo(variantId);
    if (!variantInfo) throw new AppError("Variant not found", 404);

    await DistributorshipsService.requireActiveMembership(
      dist.id,
      variantInfo.distributorshipId
    );

    return DistributorInventoryRepo.upsertInventory(dist.id, variantId, {
      stock,
      costPrice,
      sellingPrice,
      expiry: expiry ? new Date(expiry) : null,
      lowStockThreshold,
    });
  },
};
