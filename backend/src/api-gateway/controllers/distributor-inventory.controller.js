// src/api-gateway/controllers/distributor-inventory.controller.js
import DistributorInventoryService from "../../modules/inventory/distributor-inventory.service.js";

export async function getMyDistributorInventory(req, res, next) {
  try {
    const data = await DistributorInventoryService.listForCurrentDistributor(
      req.user,
    );
    res.json({ items: data });
  } catch (err) {
    next(err);
  }
}

export async function importVariantToInventory(req, res, next) {
  try {
    const { variantId, stock, costPrice, sellingPrice, expiry, lowStockThreshold } = req.body;
    const item = await DistributorInventoryService.importVariant(req.user, {
      variantId,
      stock,
      costPrice,
      sellingPrice,
      expiry,
      lowStockThreshold,
    });
    res.status(201).json({ message: "Variant imported to inventory", item });
  } catch (err) {
    next(err);
  }
}
