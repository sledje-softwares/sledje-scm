// src/modules/products/products.service.js
import ProductsRepo from "./products.repository.js";
import DistributorInventoryRepo from "../inventory/distributor-inventory.repository.js";
import DistributorshipsRepo from "../distributorships/distributorships.repository.js";
import DistributorshipsService from "../distributorships/distributorships.service.js";
import { db } from "../../config/postgres.js";
import { publishEvent } from "../../config/nats-streams.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

async function resolveDistributor(user) {
  if (!user || user.role !== "distributor") throw new AppError("Forbidden", 403);
  const distributor = await ProductsRepo.findDistributorByUserId(user.id);
  if (!distributor) throw new AppError("Distributor profile not found", 404);
  return distributor;
}

/**
 * Phase 2c curation gate for update/delete. Beyond active membership
 * (Phase 2b), a product may only be mutated/removed by its creator among
 * active members - UNLESS a DIFFERENT distributor has already stocked it (a
 * distributor_inventory row exists on one of its variants), in which case it
 * becomes append-only for everyone: only adding a brand-new variant is still
 * allowed; editing the product's own fields or touching an existing variant
 * is rejected outright.
 *
 * Returns the (possibly variant-merged) payload to pass to the repository,
 * or throws AppError.
 */
async function applyCurationGate(distributor, product, payload) {
  const variantIds = product.variants.map(v => v.id);
  const stockedByOther = variantIds.length
    ? await ProductsRepo.hasInventoryFromOtherDistributor(
        variantIds,
        product.createdByDistributorId
      )
    : false;

  if (!stockedByOther) {
    // Not yet append-only: only the creator may mutate/remove, among active
    // members. A null createdByDistributorId (pre-existing/backfilled
    // product with no recorded creator) is not restricted.
    if (
      product.createdByDistributorId &&
      product.createdByDistributorId !== distributor.id
    ) {
      throw new AppError(
        "Only the distributor who created this product may modify it",
        403
      );
    }
    return payload;
  }

  // Append-only from here on.
  if (
    payload &&
    (payload.name !== undefined ||
      payload.imageUrl !== undefined ||
      payload.category !== undefined ||
      payload.subcategory !== undefined)
  ) {
    throw new AppError(
      "This product has been stocked by another distributor; its name/image/category can no longer be edited",
      400
    );
  }

  if (payload && payload.variants) {
    const existingIds = new Set(product.variants.map(v => v.id));
    const existingSkus = new Set(product.variants.map(v => v.sku));
    const touchesExisting = payload.variants.some(
      v => (v.id && existingIds.has(v.id)) || (!v.id && v.sku && existingSkus.has(v.sku))
    );
    if (touchesExisting) {
      throw new AppError(
        "This product has been stocked by another distributor; existing variants can no longer be modified or removed - only new variants may be added",
        400
      );
    }
    // Safe append: merge the untouched existing variants back in so the
    // repository's reconcile-by-id (2a) does not treat un-mentioned existing
    // variants as removal candidates.
    return { ...payload, variants: [...product.variants, ...payload.variants] };
  }

  return payload;
}

export default {
  // list catalog for UI carousel
  async getCatalog({ distributorshipId, search, page, limit }) {
    return ProductsRepo.findProducts({ distributorshipId, search, page, limit });
  },

  /**
   * Catalogue a retailer can actually buy from: only distributors they are
   * connected to, and only variants those distributors stock. Deliberately
   * UNCHANGED by the Phase 2b membership model - see products.repository.js.
   */
  async getProductsFromConnectedDistributors(retailerUserId) {
    const retailer = await ProductsRepo.findRetailerByUserId(retailerUserId);
    if (!retailer) throw new AppError("Retailer profile not found", 404);

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
    const distributor = await resolveDistributor(user);

    if (!payload.distributorshipId) {
      throw new AppError("distributorshipId is required", 400);
    }

    await DistributorshipsService.requireActiveMembership(
      distributor.id,
      payload.distributorshipId
    );

    const product = await ProductsRepo.createProductInCatalog({
      distributorshipId: payload.distributorshipId,
      name: payload.name,
      imageUrl: payload.imageUrl,
      category: payload.category,
      subcategory: payload.subcategory,
      variants: payload.variants,
      createdByDistributorId: distributor.id,
    });

    publishEvent("products.created", { product }).catch(() => {});
    return product;
  },

  async updateCatalogProduct(user, productId, payload) {
    const distributor = await resolveDistributor(user);

    const product = await ProductsRepo.findProductById(productId);
    if (!product) throw new AppError("Product not found", 404);

    await DistributorshipsService.requireActiveMembership(
      distributor.id,
      product.distributorshipId
    );

    const gatedPayload = await applyCurationGate(distributor, product, payload);

    const updated = await ProductsRepo.updateProductInCatalog(productId, gatedPayload);
    if (!updated) throw new AppError("Product not found", 404);

    publishEvent("products.updated", { productId, updated }).catch(() => {});
    return updated;
  },

  async deleteCatalogProduct(user, productId) {
    const distributor = await resolveDistributor(user);

    const product = await ProductsRepo.findProductById(productId);
    if (!product) throw new AppError("Product not found", 404);

    await DistributorshipsService.requireActiveMembership(
      distributor.id,
      product.distributorshipId
    );

    // Deleting is a stricter case of the curation gate: applyCurationGate
    // throws on stockedByOther for ANY payload with variants/fields, but a
    // delete has no payload to check - if the product is append-only at all,
    // it can no longer be deleted by anyone.
    const variantIds = product.variants.map(v => v.id);
    const stockedByOther = variantIds.length
      ? await ProductsRepo.hasInventoryFromOtherDistributor(
          variantIds,
          product.createdByDistributorId
        )
      : false;

    if (stockedByOther) {
      throw new AppError(
        "This product has been stocked by another distributor and can no longer be deleted",
        400
      );
    }
    if (
      product.createdByDistributorId &&
      product.createdByDistributorId !== distributor.id
    ) {
      throw new AppError(
        "Only the distributor who created this product may delete it",
        403
      );
    }

    await ProductsRepo.deleteProductFromCatalog(productId);
    publishEvent("products.deleted", { productId }).catch(() => {});
  },

  // ------------- BULK IMPORT (Phase 2d) -------------
  /**
   * CSV structure (example):
   * distributorshipName,productName,variantName,sku,mrp,unit,hsnCode,gstRate,stock,costPrice,sellingPrice,expiry
   *
   * Two things this fixes vs. the old implementation:
   *  1. It no longer find-or-creates a distributorship by name. Under the
   *     membership model an unknown name is rejected outright, and a known
   *     one requires the caller to already have ACTIVE membership in it -
   *     a CSV cannot silently grant itself catalogue access.
   *  2. product_variants.sku is globally unique, but the old code looked up
   *     SKUs scoped to one product row, so a SKU already used under a
   *     DIFFERENT product (another distributor's catalogue entry) would hit
   *     the unique constraint and throw mid-loop, with earlier rows already
   *     committed (nothing wrapped the loop in a transaction). Now: each row
   *     gets its own transaction, a global SKU lookup attaches to an
   *     existing variant (via the caller's own distributor_inventory row)
   *     instead of trying to create a duplicate, and every row reports its
   *     own verdict - mirrors sync.service.js's per-op results.
   */
  async bulkImportForDistributor(distributorUserId, rows) {
    const distributor = await ProductsRepo.findDistributorByUserId(distributorUserId);
    if (!distributor) throw new AppError("Distributor profile not found", 404);

    const results = [];

    for (const r of rows) {
      try {
        const outcome = await db.transaction(async (tx) => {
          const distributorshipName = r.distributorshipName?.trim();
          if (!distributorshipName) {
            return { status: "rejected", reason: "distributorshipName is required" };
          }

          const ds = await ProductsRepo.findDistributorshipByName(distributorshipName, tx);
          if (!ds) {
            return {
              status: "rejected",
              reason: `Distributorship "${distributorshipName}" does not exist`,
            };
          }

          const membership = await DistributorshipsRepo.findMembership(
            distributor.id,
            ds.id,
            tx
          );
          if (!membership || membership.status !== "active") {
            return {
              status: "rejected",
              reason: `Not an active member of distributorship "${distributorshipName}"`,
            };
          }

          const productName = r.productName?.trim();
          if (!productName) {
            return { status: "rejected", reason: "productName is required" };
          }

          const sku = r.sku?.trim();

          // Global SKU lookup first: a hit means this SKU already belongs to
          // some product row, possibly under a different distributor/
          // distributorship. Attach the caller's own inventory to it instead
          // of trying (and failing) to create a duplicate.
          if (sku) {
            const existingVariant = await ProductsRepo.findVariantBySkuGlobal(sku, tx);
            if (existingVariant) {
              const owningProduct = await ProductsRepo.findProductByIdRaw(
                existingVariant.productId,
                tx
              );
              if (!owningProduct) {
                return { status: "error", reason: "Existing variant has no owning product" };
              }

              const skuMembership = await DistributorshipsRepo.findMembership(
                distributor.id,
                owningProduct.distributorshipId,
                tx
              );
              if (!skuMembership || skuMembership.status !== "active") {
                return {
                  status: "rejected",
                  reason: `SKU "${sku}" already exists under a distributorship you are not an active member of`,
                };
              }

              await DistributorInventoryRepo.upsertInventory(
                distributor.id,
                existingVariant.id,
                {
                  stock: Number(r.stock ?? 0),
                  costPrice: r.costPrice ?? "0",
                  sellingPrice: r.sellingPrice ?? r.mrp ?? "0",
                  expiry: r.expiry ? new Date(r.expiry) : null,
                },
                tx
              );

              return {
                status: "ok",
                reason: "Attached existing variant to your inventory",
                variantId: existingVariant.id,
              };
            }
          }

          // find or create the product within this distributorship (the
          // caller is confirmed to have active membership above).
          let product = await ProductsRepo.findProductByNameInDistributorship(
            productName,
            ds.id,
            tx
          );

          if (!product) {
            product = await ProductsRepo.createProductInCatalog(
              {
                distributorshipId: ds.id,
                name: productName,
                imageUrl: r.imageUrl || null,
                category: r.category || null,
                subcategory: r.subcategory || null,
                variants: [],
                createdByDistributorId: distributor.id,
              },
              tx
            );
          }

          const variantName = r.variantName?.trim() || "Default";
          const variant = await ProductsRepo.createVariant(
            {
              productId: product.id,
              name: variantName,
              sku: sku || `${product.id}-${Date.now()}`,
              mrp: r.mrp ?? "0",
              unit: r.unit || null,
              hsnCode: r.hsnCode || null,
              gstRate: r.gstRate ?? "0",
              isTaxInclusive: r.isTaxInclusive ?? false,
            },
            tx
          );

          await DistributorInventoryRepo.upsertInventory(
            distributor.id,
            variant.id,
            {
              stock: Number(r.stock ?? 0),
              costPrice: r.costPrice ?? "0",
              sellingPrice: r.sellingPrice ?? r.mrp ?? "0",
              expiry: r.expiry ? new Date(r.expiry) : null,
            },
            tx
          );

          return { status: "ok", variantId: variant.id };
        });

        results.push({ row: r, ...outcome });
      } catch (err) {
        // One bad row's failure never aborts rows already processed - each
        // row has its own transaction above, and the loop itself never stops.
        results.push({ row: r, status: "error", reason: err.message || "Unknown error" });
      }
    }

    return results;
  },
};
