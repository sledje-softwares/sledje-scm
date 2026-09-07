import OrdersRepo from "./orders.repository.js";
import DeliveryCodeRepo from "./delivery-code.repository.js";
import DeliveriesRepo from "../deliveries/deliveries.repository.js";
import DistributorInventoryRepo from "../inventory/distributor-inventory.repository.js";
import RetailerInventoryRepo from "../inventory/inventory.repository.js";
import ProductBillsRepo from "../product-bills/product-bills.repository.js";
import {
  notifyOrderCreated,
  notifyOrderAccepted,
  notifyOrderRejected,
  notifyOrderDispatched,
} from "../notifications/notifications.writer.js";
import { db } from "../../config/postgres.js";
import { v4 as uuidv4 } from "uuid";
import { publishEvent } from "../../config/nats-streams.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";
import { generateCode, encryptCode, decryptCode } from "../../utils/deliveryCode.js";
import {
  publishOrderCreated,
  publishOrderModified,
  publishOrderCancelled,
  publishOrderAccepted,
  publishOrderStatusUpdated,
} from "./orders.events.js";

import { productVariants, inventory, distributorInventory } from "../../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Business logic:
 * - createOrder: validate distributor ownership, compute totals, write order + items inside tx and outbox.
 * - modifyOrder: allowed when status pending; updates items and status -> modified
 * - cancelOrder: allowed by retailer before processing
 * - completeOrder: retailer confirms delivery with code
 * - approveModifiedOrder: retailer approves or rejects modifications
 * - distributor flows: get orders, accept/reject/modify (processDistributorOrder)
 *
 * NOTE: All writes that must produce events insert a row into outbox inside the same transaction.
 */

/**
 * Resolve catalogue variants together with the price the given distributor sells them at.
 *
 * Prices do NOT live on product_variants (migration 0001 moved stock/pricing to
 * distributor_inventory), so the selling price must be joined per distributor.
 * Returns a map keyed by variant id.
 */
async function resolveVariantsForDistributor(variantIds, distributorId) {
  if (!variantIds.length) return {};
  const rows = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      name: productVariants.name,
      unit: productVariants.unit,
      sellingPrice: distributorInventory.sellingPrice,
    })
    .from(productVariants)
    .leftJoin(
      distributorInventory,
      and(
        eq(distributorInventory.variantId, productVariants.id),
        eq(distributorInventory.distributorId, distributorId)
      )
    )
    .where(inArray(productVariants.id, variantIds));
  return Object.fromEntries(rows.map((v) => [v.id, v]));
}

function priceFor(item, variant) {
  const price = item.sellingPrice ?? variant.sellingPrice;
  if (price === null || price === undefined) {
    throw new Error(`Variant not stocked by this distributor: ${variant.id}`);
  }
  return Number(price);
}

function computeTotals(items) {
  // items: [{ variantId, quantity, unit }]
  // we expect calling code to fetch variant sellingPrice
  let total = 0;
  const computed = items.map((it) => {
    const price = Number(it.sellingPrice || 0);
    const qty = Number(it.quantity || 0);
    const line = price * qty;
    total += line;
    return { ...it, lineAmount: line };
  });
  return { total, items: computed };
}

export default {
  async createOrder(user, payload) {
    // user is { id, role }
    if (user.role !== "retailer") throw new Error("Only retailers can create orders");

    // find retailer row
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer) throw new Error("Retailer not found");

    // validate distributorId in payload
    const distributorId = payload.distributorId;
    if (!distributorId) throw new Error("distributorId required");

    // Resolve each variant price by querying productVariants
    const variantIds = (payload.items || []).map(i => i.variantId);
    if (!variantIds.length) throw new Error("No items provided");

    const variantMap = await resolveVariantsForDistributor(variantIds, distributorId);

    // enrich incoming items with price, name
    const enriched = payload.items.map(it => {
      const v = variantMap[it.variantId];
      if (!v) throw new Error(`Variant not found: ${it.variantId}`);
      return {
        variantId: it.variantId,
        productId: v.productId,
        sku: v.sku,
        productName: null,
        variantName: v.name,
        quantity: Number(it.quantity || 0),
        unit: it.unit || v.unit,
        sellingPrice: priceFor(it, v),
      };
    });

    const { total, items: computedItems } = computeTotals(enriched);

    // Build order payload
    const orderNumber = `ORD-${Date.now()}`; // simple; replace with better generator if needed
    const orderRow = {
      orderNumber,
      retailerId: retailer.id,
      distributorId,
      status: "pending",
      totalAmount: total,
      notes: payload.notes || null,
      expectedDelivery: payload.expectedDelivery || null
    };

    // Start transaction: insert order, items, and outbox
    // Delivery confirmation code (docs/15-delivery-confirmation.md): generated
    // now, shown to the retailer exactly once in this response, and required
    // to complete the order later. Stored encrypted, never in plaintext.
    const deliveryCode = generateCode();
    const encrypted = encryptCode(deliveryCode);

    const result = await db.transaction(async (tx) => {
      const createdOrder = await OrdersRepo.createOrderRow(tx, orderRow);

      // prepare order items array for insertion
      const itemsToInsert = computedItems.map(it => ({
        orderId: createdOrder.id,
        variantId: it.variantId,
        productName: it.productName,
        variantName: it.variantName,
        sku: it.sku,
        quantity: it.quantity,
        unit: it.unit,
        variantSellingPrice: it.sellingPrice
      }));

      const insertedItems = await OrdersRepo.insertOrderItems(tx, itemsToInsert);

      await DeliveryCodeRepo.create(tx, createdOrder.id, encrypted);

      // write outbox entry for guaranteed publish
      await OrdersRepo.insertOutbox(tx, "orders.created", {
        order: createdOrder,
        items: insertedItems
      });

      await notifyOrderCreated(tx, createdOrder);

      return { order: createdOrder, items: insertedItems };
    });

    // try immediate publish (best-effort)
    publishOrderCreated({ order: result.order, items: result.items }).catch((e) => console.warn("publishOrderCreated failed", e.message));

    return { ...result.order, items: result.items, deliveryCode };
  },

  async getRetailerOrders(user) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer) throw new Error("Retailer not found");
    const rows = await OrdersRepo.findOrdersByRetailerId(retailer.id);
    // Optionally join items
    const results = [];
    for (const r of rows) {
      const items = await OrdersRepo.getOrderItems(r.id);
      results.push({ ...r, items });
    }
    return results;
  },

  async getRetailerOrder(user, orderId) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    const order = await OrdersRepo.findOrderWithItems(orderId);
    if (!order) throw new Error("Order not found");
    if (order.retailerId !== retailer.id) throw new Error("Not owner of order");

    // The delivery code is only ever surfaced to the retailer who owns the
    // order, and only while it has not been consumed - never to a
    // distributor, never in a notification or log line.
    let deliveryCode = null;
    if (order.status !== "completed") {
      const codeRow = await DeliveryCodeRepo.get(orderId);
      if (codeRow && !codeRow.consumedAt) {
        deliveryCode = decryptCode(codeRow);
      }
    }

    return { ...order, deliveryCode };
  },

  async modifyOrder(user, orderId, payload) {
    // allowed if status === 'pending'
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    const order = await OrdersRepo.findOrderWithItems(orderId);
    if (!order) throw new Error("Order not found");
    if (order.retailerId !== retailer.id) throw new Error("Not owner");

    if (order.status !== "pending") throw new Error("Order not modifiable");

    // compute new items & totals (similar to create)
    const variantIds = (payload.items || []).map(i => i.variantId);
    const variantMap = await resolveVariantsForDistributor(variantIds, order.distributorId);

    const enriched = payload.items.map(it => {
      const v = variantMap[it.variantId];
      if (!v) throw new Error(`Variant not found: ${it.variantId}`);
      return {
        variantId: it.variantId,
        productId: v.productId,
        sku: v.sku,
        variantName: v.name,
        quantity: Number(it.quantity || 0),
        unit: it.unit || v.unit,
        sellingPrice: priceFor(it, v),
      };
    });

    const { total, items: computedItems } = computeTotals(enriched);

    const result = await db.transaction(async (tx) => {
      // update order: status -> modified, totalAmount
      const updatedOrder = await OrdersRepo.updateOrder(tx, orderId, { status: "modified", totalAmount: total, notes: payload.notes || order.notes });

      // delete existing items and insert new
      await OrdersRepo.deleteOrderItemsByOrderId(tx, orderId);
      const itemsToInsert = computedItems.map(it => ({
        orderId,
        variantId: it.variantId,
        productName: it.productName,
        variantName: it.variantName,
        sku: it.sku,
        quantity: it.quantity,
        unit: it.unit,
        variantSellingPrice: it.sellingPrice
      }));
      const inserted = await OrdersRepo.insertOrderItems(tx, itemsToInsert);

      // outbox entry
      await OrdersRepo.insertOutbox(tx, "orders.modified", { order: updatedOrder, items: inserted });

      return { order: updatedOrder, items: inserted };
    });

    publishOrderModified({ order: result.order, items: result.items }).catch(e => console.warn("publishOrderModified failed", e.message));
    return result;
  },

  async cancelOrder(user, orderId, reason) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    const order = await OrdersRepo.findOrderById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.retailerId !== retailer.id) throw new Error("Not owner");

    // allowed if pending/modified
    if (!["pending", "modified"].includes(order.status)) throw new Error("Cannot cancel at this stage");

    const result = await db.transaction(async (tx) => {
      const updated = await OrdersRepo.updateOrder(tx, orderId, { status: "cancelled", notes: `${order.notes || ""}\nCANCEL_REASON:${reason || ""}` });
      await OrdersRepo.insertOutbox(tx, "orders.cancelled", { order: updated });
      return updated;
    });

    publishOrderCancelled({ order: result }).catch(e => console.warn("publishOrderCancelled failed", e.message));
    return result;
  },

  /**
   * Delivery -> stock -> product bill -> ledger, as ONE transaction.
   *
   * This replaces the NATS consumer chain (orders.completed ->
   * inventory.consumer -> productBill.consumer -> ledger.consumer), which
   * was broken at every hop and depended on infrastructure this single
   * process doesn't need (docs/14-simplification.md). Delivery is now the
   * single trigger for every downstream effect, applied atomically.
   */
  async applyDeliveryEffects(tx, order, items) {
    for (const item of items) {
      const unitCost = Number(item.variantSellingPrice || 0);
      const qty = Number(item.quantity || 0);

      // Release the reservation taken at accept, and take the stock off the
      // distributor's hands for real.
      await DistributorInventoryRepo.releaseReservation(tx, order.distributorId, item.variantId, qty);
      await DistributorInventoryRepo.decrementStock(tx, order.distributorId, item.variantId, qty);
      await RetailerInventoryRepo.addToShelf(tx, order.retailerId, item.variantId, qty);

      let bill = await ProductBillsRepo.findBillByVariant(order.retailerId, order.distributorId, item.variantId);
      if (!bill) {
        bill = await ProductBillsRepo.createBill({
          retailerId: order.retailerId,
          distributorId: order.distributorId,
          variantId: item.variantId,
        });
      }

      // Consignment, not debt: the goods are on the retailer's shelf but they
      // do not owe for them until they sell them. No ledger debit here - the
      // debit is written when a sale accrues (sales.service.js).
      await ProductBillsRepo.recordReceipt(tx, {
        productBillId: bill.id,
        orderId: order.id,
        variantId: item.variantId,
        qty,
        unitCost,
      });
    }
  },

  /**
   * Distributor marks the goods as having left the warehouse. Creates the
   * delivery record an agent can then be assigned to.
   */
  async dispatchOrder(user, orderId) {
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    const distributor = await OrdersRepo.findDistributorByUserId(user.id);
    if (!distributor) throw new Error("Distributor profile not found");

    const order = await OrdersRepo.findOrderById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.distributorId !== distributor.id) throw new Error("Not owner");
    if (order.status !== "processing") {
      throw new Error("Only an accepted order can be dispatched");
    }

    const result = await db.transaction(async (tx) => {
      const updated = await OrdersRepo.updateOrder(tx, orderId, {
        status: "dispatched",
        dispatchedAt: new Date(),
      });
      await DeliveriesRepo.createForOrder(tx, orderId);
      await OrdersRepo.insertOutbox(tx, "orders.dispatched", { order: updated });
      await notifyOrderDispatched(tx, order);
      return updated;
    });

    publishEvent("orders.dispatched", { order: result }).catch(() => {});
    return result;
  },

  /**
   * REMOVED - the retailer no longer completes their own order.
   *
   * Delivery is confirmed by the delivery agent, who must present the code the
   * retailer received at order creation (deliveries.service.js:confirmDelivery).
   * Neither party can complete a delivery alone, which is what makes the code a
   * real two-party attestation rather than a formality
   * (docs/15-delivery-confirmation.md).
   */
  async completeOrder() {
    // 410 Gone: the endpoint existed and was deliberately retired, which is
    // more useful to an old client than a 404 or a generic failure.
    throw new AppError(
      "Retailers no longer confirm their own deliveries. Give your delivery code to the delivery agent, who confirms it on arrival.",
      410
    );
  },

  async approveModifiedOrder(user, orderId, approved) {
    // retailer approves or rejects modifications proposed by distributor
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    const order = await OrdersRepo.findOrderById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.retailerId !== retailer.id) throw new Error("Not owner");
    if (order.status !== "modified") throw new Error("Order is not in modified state");

    const status = approved ? "processing" : "cancelled"; // or 'pending' depending on your flow
    const updated = await db.transaction(async (tx) => {
      const u = await OrdersRepo.updateOrder(tx, orderId, { status });
      await OrdersRepo.insertOutbox(tx, "orders.modified.approval", { order: u, approved });
      return u;
    });

    publishOrderModified({ order: updated }).catch(e => console.warn("publishOrderModified failed", e.message));
    return updated;
  },

  /* Distributor flows */

  async getDistributorOrders(user) {
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    const dist = await OrdersRepo.findDistributorByUserId(user.id);
    const rows = await OrdersRepo.findOrdersByDistributorId(dist.id);
    const results = [];
    for (const r of rows) {
      const items = await OrdersRepo.getOrderItems(r.id);
      results.push({ ...r, items });
    }
    return results;
  },

  async getDistributorOrder(user, orderId) {
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    const dist = await OrdersRepo.findDistributorByUserId(user.id);
    const order = await OrdersRepo.findOrderWithItems(orderId);
    if (!order) throw new Error("Order not found");
    if (order.distributorId !== dist.id) throw new Error("Not owner");
    return order;
  },

  async processDistributorOrder(user, orderId, payload) {
    // payload.action = accept/reject/modify
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    const dist = await OrdersRepo.findDistributorByUserId(user.id);
    const order = await OrdersRepo.findOrderWithItems(orderId);
    if (!order) throw new Error("Order not found");
    if (order.distributorId !== dist.id) throw new Error("Not owner");

    if (payload.action === "accept") {
      // set status to processing
      const result = await db.transaction(async (tx) => {
        const updated = await OrdersRepo.updateOrder(tx, orderId, {
          status: "processing",
          acceptedAt: new Date(),
        });

        // Commit the stock: it stays on the distributor's books but is no
        // longer available to sell to anyone else. Released at delivery.
        for (const item of order.items) {
          await DistributorInventoryRepo.reserveForDelivery(
            tx, order.distributorId, item.variantId, Number(item.quantity || 0)
          );
        }

        await OrdersRepo.insertOutbox(tx, "orders.accepted", { order: updated });
        await notifyOrderAccepted(tx, order);
        return updated;
      });
      publishOrderAccepted({ order: result }).catch(e => console.warn("publishOrderAccepted failed", e.message));
      return result;
    }

    if (payload.action === "reject") {
      const result = await db.transaction(async (tx) => {
        const updated = await OrdersRepo.updateOrder(tx, orderId, { status: "cancelled", notes: payload.rejectionReason || null });
        await OrdersRepo.insertOutbox(tx, "orders.rejected", { order: updated });
        await notifyOrderRejected(tx, order, payload.rejectionReason);
        return updated;
      });
      publishOrderCancelled({ order: result }).catch(e => console.warn("publishOrderCancelled failed", e.message));
      return result;
    }

    if (payload.action === "modify") {
      // Distributor suggests modifications: modify items but keep status 'modified' then retailer must approve
      // Validate modifications
      const variants = payload.modifications?.items || [];
      if (!variants.length) throw new Error("No modifications provided");

      const variantIds = variants.map(i => i.variantId);
      const map = await resolveVariantsForDistributor(variantIds, order.distributorId);

      const enriched = variants.map(it => {
        const v = map[it.variantId];
        if (!v) throw new Error(`Variant not found: ${it.variantId}`);
        return {
          variantId: it.variantId,
          sku: v.sku,
          variantName: v.name,
          quantity: Number(it.newQuantity || it.quantity || 0),
          unit: it.unit || v.unit,
          sellingPrice: priceFor(it, v)
        };
      });

      const { total, items: computedItems } = computeTotals(enriched);

      const result = await db.transaction(async (tx) => {
        // update order to modified status and replace items
        const updatedOrder = await OrdersRepo.updateOrder(tx, orderId, { status: "modified", totalAmount: total, notes: payload.modifications?.notes || order.notes });
        await OrdersRepo.deleteOrderItemsByOrderId(tx, orderId);

        const itemsToInsert = computedItems.map(it => ({
          orderId,
          variantId: it.variantId,
          productName: null,
          variantName: it.variantName,
          sku: it.sku,
          quantity: it.quantity,
          unit: it.unit,
          variantSellingPrice: it.sellingPrice
        }));

        const inserted = await OrdersRepo.insertOrderItems(tx, itemsToInsert);

        await OrdersRepo.insertOutbox(tx, "orders.modified.by_distributor", { order: updatedOrder, items: inserted });

        return { order: updatedOrder, items: inserted };
      });

      publishOrderModified({ order: result.order, items: result.items }).catch(e => console.warn("publishOrderModified failed", e.message));
      return result;
    }

    throw new Error("Invalid action");
  },

  async updateOrderStatus(user, orderId, status) {
    // only distributor may update status to things like 'sent', 'delivered' depending on your allowed statuses
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    const dist = await OrdersRepo.findDistributorByUserId(user.id);
    const order = await OrdersRepo.findOrderById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.distributorId !== dist.id) throw new Error("Not owner");

    const allowed = ["processing", "sent", "delivered", "completed", "cancelled"];
    if (!allowed.includes(status)) throw new Error("Invalid status");

    const updated = await db.transaction(async (tx) => {
      const u = await OrdersRepo.updateOrder(tx, orderId, { status });
      await OrdersRepo.insertOutbox(tx, "orders.status.updated", { order: u });
      return u;
    });

    publishOrderStatusUpdated({ order: updated }).catch(e => console.warn("publishOrderStatusUpdated failed", e.message));
    return updated;
  }
};
