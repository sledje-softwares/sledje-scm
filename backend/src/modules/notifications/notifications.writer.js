// src/modules/notifications/notifications.writer.js
//
// Until now *nothing in the running system wrote a notifications row*. The
// table existed, the read endpoints existed, and the only code that ever
// inserted one lived in the unreachable consumers1/ directory
// (docs/10-known-issues.md P3-11). These writers close that gap.
//
// Every function takes a transaction so the notification is committed with the
// state change that caused it - a notification for an event that got rolled
// back is worse than no notification.

import { notifications, retailers, distributors } from "../../db/schema.js";
import { eq } from "drizzle-orm";

/** Resolve the users.id behind a retailer/distributor profile id. */
async function retailerUserId(tx, retailerId) {
  const [row] = await tx
    .select({ userId: retailers.userId })
    .from(retailers)
    .where(eq(retailers.id, retailerId));
  return row?.userId || null;
}

async function distributorUserId(tx, distributorId) {
  const [row] = await tx
    .select({ userId: distributors.userId })
    .from(distributors)
    .where(eq(distributors.id, distributorId));
  return row?.userId || null;
}

async function write(tx, userId, { title, message, type, entityId }) {
  if (!userId) return; // profile with no user account - nothing to notify
  await tx.insert(notifications).values({ userId, title, message, type, entityId });
}

export async function notifyOrderCreated(tx, order) {
  await write(tx, await distributorUserId(tx, order.distributorId), {
    title: "New order received",
    message: `Order ${order.orderNumber} was placed.`,
    type: "order.created",
    entityId: order.id,
  });
}

export async function notifyOrderAccepted(tx, order) {
  await write(tx, await retailerUserId(tx, order.retailerId), {
    title: "Order accepted",
    message: `Your order ${order.orderNumber} was accepted and is being prepared.`,
    type: "order.accepted",
    entityId: order.id,
  });
}

export async function notifyOrderRejected(tx, order, reason) {
  await write(tx, await retailerUserId(tx, order.retailerId), {
    title: "Order rejected",
    message: `Your order ${order.orderNumber} was rejected.${reason ? ` Reason: ${reason}` : ""}`,
    type: "order.rejected",
    entityId: order.id,
  });
}

export async function notifyOrderDispatched(tx, order) {
  await write(tx, await retailerUserId(tx, order.retailerId), {
    title: "Order dispatched",
    message: `Order ${order.orderNumber} has left the distributor. Keep your delivery code ready.`,
    type: "order.dispatched",
    entityId: order.id,
  });
  await write(tx, await distributorUserId(tx, order.distributorId), {
    title: "Order dispatched",
    message: `Order ${order.orderNumber} was marked as dispatched.`,
    type: "order.dispatched",
    entityId: order.id,
  });
}

export async function notifyOrderDelivered(tx, order) {
  await write(tx, await retailerUserId(tx, order.retailerId), {
    title: "Delivery confirmed",
    message: `Order ${order.orderNumber} was delivered and added to your shelf.`,
    type: "order.delivered",
    entityId: order.id,
  });
  await write(tx, await distributorUserId(tx, order.distributorId), {
    title: "Delivery confirmed",
    message: `Order ${order.orderNumber} was delivered to the retailer.`,
    type: "order.delivered",
    entityId: order.id,
  });
}
