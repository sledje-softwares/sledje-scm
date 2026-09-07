// src/modules/products/products.service.js
import ProductsRepo from "./products.repository.js";
import DistributorInventoryRepo from "../inventory/distributor-inventory.repository.js";
import { publishEvent } from "../../config/nats-streams.js";

export default {
  // list catalog for UI carousel
  async getCatalog({ distributorshipId, search, page, limit }) {
    return ProductsRepo.findProducts({ distributorshipId, search, page, limit });
  },

  /**
   * Catalogue a retailer can actually buy from: only distributors they are
   * connected to, and only variants those distributors stock.
   */
  async getProductsFromConnectedDistributors(retailerUserId) {
    const retailer = await ProductsRepo.findRetailerByUserId(retailerUserId);
    if (!retailer) throw new Error("Retailer profile not found");

    const distributorIds =
      await ProductsRepo.getConnectedDistributorIdsForRetailer(retailer.id);
    if (!distributorIds.length) return [];

    return ProductsRepo.findSellableItemsForDistributors(distributorIds);
  },

  async getProductById(productId) {
    return ProductsRepo.findProductById(productId);
  },

  // allow distributor to create catalog entries if you want
  async createCatalogProduct(user, payload) {
    if (!user || user.role !== "distributor") throw new Error("Forbidden");

    if (!payload.distributorshipId) {
      throw new Error("distributorshipId is required");
    }

    const product = await ProductsRepo.createProductInCatalog({
      distributorshipId: payload.distributorshipId,
      name: payload.name,
      imageUrl: payload.imageUrl,
      category: payload.category,
      subcategory: payload.subcategory,
      variants: payload.variants,
    });

    publishEvent("products.created", { product }).catch(() => {});
    return product;
  },

  async updateCatalogProduct(user, productId, payload) {
    if (!user || user.role !== "distributor") throw new Error("Forbidden");

    const updated = await ProductsRepo.updateProductInCatalog(productId, payload);
    if (!updated) throw new Error("Product not found");

    publishEvent("products.updated", { productId, updated }).catch(() => {});
    return updated;
  },

  async deleteCatalogProduct(user, productId) {
    if (!user || user.role !== "distributor") throw new Error("Forbidden");

    await ProductsRepo.deleteProductFromCatalog(productId);
    publishEvent("products.deleted", { productId }).catch(() => {});
  },

  // ------------- BULK IMPORT -------------
  /**
   * CSV structure (example):
   * distributorshipName,productName,variantName,sku,mrp,unit,hsnCode,gstRate,stock,costPrice,sellingPrice,expiry
   */
  async bulkImportForDistributor(distributorUserId, rows) {
    const distributor = await ProductsRepo.findDistributorByUserId(distributorUserId);
    if (!distributor) throw new Error("Distributor profile not found");

    for (const r of rows) {
      const distributorshipName = r.distributorshipName?.trim();
      if (!distributorshipName) continue;

      // 1) find or create distributorship
      let ds = await ProductsRepo.findDistributorshipByName(distributorshipName);
      if (!ds) {
        ds = await ProductsRepo.createDistributorship(distributorshipName);
      }

      // 2) find or create product in that distributorship
      const productName = r.productName?.trim();
      if (!productName) continue;

      let product = await ProductsRepo.findProductByNameInDistributorship(
        productName,
        ds.id,
      );

      if (!product) {
        product = (
          await ProductsRepo.createProductInCatalog({
            distributorshipId: ds.id,
            name: productName,
            imageUrl: r.imageUrl || null,
            category: r.category || null,
            subcategory: r.subcategory || null,
            variants: [],
          })
        );
      }

      // 3) find or create variant
      const sku = r.sku?.trim();
      const variantName = r.variantName?.trim() || "Default";
      let variant = sku
        ? await ProductsRepo.findVariantBySkuInProduct(sku, product.id)
        : null;

      if (!variant) {
        variant = await ProductsRepo.createVariant({
          productId: product.id,
          name: variantName,
          sku: sku || `${product.id}-${Date.now()}`,
          mrp: r.mrp ?? "0",
          unit: r.unit || null,
          hsnCode: r.hsnCode || null,
          gstRate: r.gstRate ?? "0",
          isTaxInclusive: r.isTaxInclusive ?? false,
        });
      }

      // 4) add/update distributor inventory for this variant
      await DistributorInventoryRepo.upsertInventory(distributor.id, variant.id, {
        stock: Number(r.stock ?? 0),
        costPrice: r.costPrice ?? "0",
        sellingPrice: r.sellingPrice ?? r.mrp ?? "0",
        expiry: r.expiry ? new Date(r.expiry) : null,
      });
    }
  },
};
