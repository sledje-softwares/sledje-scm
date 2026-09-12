// src/modules/deliveries/deliveries.service.js
//
// The delivery agent is a third party: neither the retailer nor the
// distributor can complete a delivery alone. The agent asserts they delivered;
// the retailer's code proves they received. See docs/15-delivery-confirmation.md.

import { db } from "../../config/postgres.js";
import DeliveriesRepo from "./deliveries.repository.js";
import DeliveryCodeRepo from "../orders/delivery-code.repository.js";
import OrdersRepo from "../orders/orders.repository.js";
import OrdersService from "../orders/orders.service.js";
import AgentsRepo from "../delivery-agents/delivery-agents.repository.js";
import { notifyOrderDelivered } from "../notifications/notifications.writer.js";
import { decryptCode, codesMatch } from "../../utils/deliveryCode.js";
import { publishEvent } from "../../config/nats-streams.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

const MAX_ATTEMPTS = 5;

/**
 * Resolve a delivery that belongs to the calling agent, or throw.
 * Module-scoped rather than a method so it cannot be reached through the
 * exported service surface.
 */
async function agentOwnedDelivery(user, deliveryId) {
  if (user.role !== "delivery_agent") throw new Error("Only delivery agents allowed");
  const agent = await DeliveriesRepo.findAgentByUserId(user.id);
  if (!agent) throw new Error("Delivery agent profile not found");

  const delivery = await DeliveriesRepo.findById(deliveryId);
  if (!delivery) throw new Error("Delivery not found");
  if (delivery.agentId !== agent.id) throw new Error("Forbidden");

  return { delivery, agent };
}

const DeliveriesService = {
  /** Distributor assigns an available agent to a dispatched order. */
  async assignAgent(user, deliveryId, agentId) {
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    const distributor = await OrdersRepo.findDistributorByUserId(user.id);
    if (!distributor) throw new Error("Distributor profile not found");

    const delivery = await DeliveriesRepo.findById(deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    const order = await OrdersRepo.findOrderById(delivery.orderId);
    if (!order || order.distributorId !== distributor.id) throw new Error("Forbidden");

    const agent = await AgentsRepo.findById(agentId);
    if (!agent || !agent.active) throw new Error("Delivery agent not found");

    return DeliveriesRepo.update(db, deliveryId, {
      agentId,
      status: "assigned",
      assignedAt: new Date(),
    });
  },

  async listForAgent(user, statuses) {
    if (user.role !== "delivery_agent") throw new Error("Only delivery agents allowed");
    const agent = await DeliveriesRepo.findAgentByUserId(user.id);
    if (!agent) throw new Error("Delivery agent profile not found");
    return DeliveriesRepo.listForAgent(agent.id, statuses);
  },

  async listForDistributor(user) {
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    const distributor = await OrdersRepo.findDistributorByUserId(user.id);
    if (!distributor) throw new Error("Distributor profile not found");
    return DeliveriesRepo.listPendingForDistributor(distributor.id);
  },

  /** Agent has collected the goods and is en route. */
  async markPickedUp(user, deliveryId) {
    const { delivery } = await agentOwnedDelivery(user, deliveryId);
    if (delivery.status !== "assigned") {
      throw new Error("Delivery is not in an assignable state");
    }

    return db.transaction(async (tx) => {
      const updated = await DeliveriesRepo.update(tx, deliveryId, {
        status: "picked_up",
        pickedUpAt: new Date(),
      });
      await OrdersRepo.updateOrder(tx, delivery.orderId, { status: "out_for_delivery" });
      return updated;
    });
  },

  /**
   * The trust boundary. The agent submits the code the RETAILER was given at
   * order creation. Only on a match does anything downstream happen - stock
   * moves, and the product bill takes on the goods as consignment.
   *
   * Rate limited: 5 attempts then a 15-minute lock, counted per order so
   * switching agent accounts does not reset it.
   */
  async confirmDelivery(user, deliveryId, code) {
    const { delivery, agent } = await agentOwnedDelivery(user, deliveryId);

    if (delivery.status === "delivered") throw new AppError("Delivery already confirmed", 409);
    if (!["assigned", "picked_up"].includes(delivery.status)) {
      throw new AppError("Delivery is not in a confirmable state", 409);
    }
    if (!code) throw new AppError("Delivery code required", 400);

    const order = await OrdersRepo.findOrderWithItems(delivery.orderId);
    if (!order) throw new Error("Order not found");

    const codeRow = await DeliveryCodeRepo.get(order.id);
    if (!codeRow) throw new Error("No delivery code on record for this order");
    if (codeRow.consumedAt) throw new AppError("Delivery already confirmed", 409);
    if (codeRow.lockedUntil && new Date(codeRow.lockedUntil) > new Date()) {
      throw new AppError("Too many incorrect attempts. Try again later.", 429);
    }

    const actual = decryptCode(codeRow);
    if (!codesMatch(String(code).trim(), actual)) {
      const patch = await DeliveryCodeRepo.recordFailedAttempt(order.id, codeRow.attempts);
      const remaining = Math.max(0, MAX_ATTEMPTS - patch.attempts);
      throw new AppError(
        patch.lockedUntil
          ? "Too many incorrect attempts. Locked for 15 minutes."
          : `Incorrect delivery code. ${remaining} attempt(s) remaining.`,
        patch.lockedUntil ? 429 : 400
      );
    }

    const result = await db.transaction(async (tx) => {
      const updatedOrder = await OrdersRepo.updateOrder(tx, order.id, {
        status: "delivered",
        deliveredAt: new Date(),
      });

      // Stock, shelf and the product bill (as consignment, not debt).
      await OrdersService.applyDeliveryEffects(tx, order, order.items);

      await DeliveriesRepo.update(tx, deliveryId, {
        status: "delivered",
        deliveredAt: new Date(),
      });
      await DeliveryCodeRepo.markConsumed(tx, order.id);
      await notifyOrderDelivered(tx, order);

      return updatedOrder;
    });

    publishEvent("orders.delivered", { order: result }).catch(() => {});
    return result;
  },

  /** Retailer refused, or nobody was there. No code, no billing. */
  async markFailed(user, deliveryId, reason) {
    const { delivery } = await agentOwnedDelivery(user, deliveryId);
    if (delivery.status === "delivered") throw new Error("Delivery already confirmed");

    return DeliveriesRepo.update(db, deliveryId, {
      status: "failed",
      failureReason: reason || null,
    });
  },

};

export default DeliveriesService;
