import OrdersService from "../../modules/orders/orders.service.js";

export async function createOrder(req, res, next) {
  try {
    const user = req.user;
    const payload = req.body;
    const result = await OrdersService.createOrder(user, payload);
    res.status(201).json({ message: "Order created successfully", order: result });
  } catch (err) { next(err); }
}

export async function getRetailerOrders(req, res, next) {
  try {
    const user = req.user;
    const orders = await OrdersService.getRetailerOrders(user);
    res.json({ data: orders });
  } catch (err) { next(err); }
}

export async function getRetailerOrder(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const order = await OrdersService.getRetailerOrder(user, orderId);
    res.json({ data: order });
  } catch (err) { next(err); }
}

export async function modifyOrder(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const payload = req.body;
    const order = await OrdersService.modifyOrder(user, orderId, payload);
    res.json({ message: "Order modified", order });
  } catch (err) { next(err); }
}

export async function cancelOrder(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const { reason } = req.body;
    const order = await OrdersService.cancelOrder(user, orderId, reason);
    res.json({ message: "Order cancelled", order });
  } catch (err) { next(err); }
}

export async function completeOrder(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const { code } = req.body;
    const order = await OrdersService.completeOrder(user, orderId, code);
    res.json({ message: "Order completed", order });
  } catch (err) { next(err); }
}

export async function approveModifiedOrder(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const { approved } = req.body;
    const order = await OrdersService.approveModifiedOrder(user, orderId, approved);
    res.json({ message: "Order approval updated", order });
  } catch (err) { next(err); }
}

/* Distributor controllers */

export async function getDistributorOrders(req, res, next) {
  try {
    const user = req.user;
    const orders = await OrdersService.getDistributorOrders(user);
    res.json({ data: orders });
  } catch (err) { next(err); }
}

export async function getDistributorOrder(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const order = await OrdersService.getDistributorOrder(user, orderId);
    res.json({ data: order });
  } catch (err) { next(err); }
}

export async function processDistributorOrder(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const payload = req.body; // { action: 'accept'|'reject'|'modify', ... }
    const order = await OrdersService.processDistributorOrder(user, orderId, payload);
    res.json({ message: "Order processed", order });
  } catch (err) { next(err); }
}

/** Distributor marks the goods as having left the warehouse. */
export async function dispatchOrder(req, res, next) {
  try {
    const order = await OrdersService.dispatchOrder(req.user, req.params.orderId);
    res.json({ message: "Order dispatched", order });
  } catch (err) { next(err); }
}

export async function updateOrderStatus(req, res, next) {
  try {
    const user = req.user;
    const { orderId } = req.params;
    const { status } = req.body;
    const order = await OrdersService.updateOrderStatus(user, orderId, status);
    res.json({ message: "Order status updated", order });
  } catch (err) { next(err); }
}
