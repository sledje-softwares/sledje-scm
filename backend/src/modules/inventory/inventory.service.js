import InventoryRepo from "./inventory.repository.js";
import { publishEvent } from "../../config/nats-streams.js";

export default {
  async getInventory(userId) {
    const retailer = await InventoryRepo.findRetailerIdByUserId(userId);
    if (!retailer) throw new Error("Retailer account not found");

    return InventoryRepo.getInventoryByRetailer(retailer.id);
  },

  async addVariant(userId, variantId) {
    const retailer = await InventoryRepo.findRetailerIdByUserId(userId);
    if (!retailer) throw new Error("Retailer not found");

    const variant = await InventoryRepo.findVariantById(variantId);
    if (!variant) throw new Error("Variant not found");

    const product = await InventoryRepo.findProduct(variant.productId);
    if (!product) throw new Error("Product not found");

    const existing = await InventoryRepo.findInventoryItem(retailer.id, variantId);

    if (existing) {
      return existing; // already added
    }

    const created = await InventoryRepo.createInventoryItem(retailer.id, variant, product);

    publishEvent("inventory.variant_added", {
      retailerId: retailer.id,
      variantId,
      productId: product.id
    });

    return created;
  },

  /**
   * DEPRECATED - retained only so a stale deployed client cannot corrupt stock.
   *
   * Delivery now applies every downstream effect (retailer shelf, distributor
   * stock, product bill, ledger) inside one transaction in
   * orders.service.js:completeOrder, gated on the delivery code. This endpoint
   * used to add the order quantities to the shelf a second time, so calling
   * both - as the UI did - double-counted every delivered item.
   *
   * It now reports the current shelf position without mutating anything.
   */
  async updateInventoryAfterOrder(userId, orderId) {
    const retailer = await InventoryRepo.findRetailerIdByUserId(userId);
    if (!retailer) throw new Error("Retailer not found");

    const order = await InventoryRepo.getOrder(orderId);
    if (!order) throw new Error("Order not found");

    if (order.status !== "completed")
      throw new Error("Order is not completed");

    console.warn(
      `[deprecated] POST /inventory/checkout called for order ${orderId}; ` +
      `stock was already applied at delivery confirmation. No changes made.`
    );

    return {
      deprecated: true,
      message:
        "Inventory is applied automatically when the delivery code is confirmed. This endpoint no longer modifies stock.",
      inventory: await InventoryRepo.getInventoryByRetailer(retailer.id),
    };
  }
};
