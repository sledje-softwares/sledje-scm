// src/api-gateway/controllers/deliveries.controller.js
import DeliveriesService from "../../modules/deliveries/deliveries.service.js";
import AgentsService from "../../modules/delivery-agents/delivery-agents.service.js";

/* ---------- agent account ---------- */

export async function registerAgent(req, res, next) {
  try {
    res.status(201).json(await AgentsService.register(req.body));
  } catch (e) { next(e); }
}

export async function loginAgent(req, res, next) {
  try {
    res.json(await AgentsService.login(req.body));
  } catch (e) { next(e); }
}

export async function getAgentProfile(req, res, next) {
  try {
    res.json({ agent: await AgentsService.getProfile(req.user) });
  } catch (e) { next(e); }
}

export async function setAvailability(req, res, next) {
  try {
    res.json({ agent: await AgentsService.setAvailability(req.user, req.body.isAvailable) });
  } catch (e) { next(e); }
}

/** Distributor-facing: available agents to assign. */
export async function listAvailableAgents(req, res, next) {
  try {
    res.json({ agents: await AgentsService.listAvailable(req.user, { pincode: req.query.pincode }) });
  } catch (e) { next(e); }
}

/* ---------- deliveries ---------- */

export async function listMyDeliveries(req, res, next) {
  try {
    const statuses = req.query.status ? String(req.query.status).split(",") : null;
    res.json({ deliveries: await DeliveriesService.listForAgent(req.user, statuses) });
  } catch (e) { next(e); }
}

export async function listDistributorDeliveries(req, res, next) {
  try {
    res.json({ deliveries: await DeliveriesService.listForDistributor(req.user) });
  } catch (e) { next(e); }
}

export async function assignAgent(req, res, next) {
  try {
    const delivery = await DeliveriesService.assignAgent(
      req.user, req.params.deliveryId, req.body.agentId
    );
    res.json({ message: "Agent assigned", delivery });
  } catch (e) { next(e); }
}

export async function markPickedUp(req, res, next) {
  try {
    const delivery = await DeliveriesService.markPickedUp(req.user, req.params.deliveryId);
    res.json({ message: "Marked as picked up", delivery });
  } catch (e) { next(e); }
}

export async function confirmDelivery(req, res, next) {
  try {
    const order = await DeliveriesService.confirmDelivery(
      req.user, req.params.deliveryId, req.body.code
    );
    res.json({ message: "Delivery confirmed", order });
  } catch (e) { next(e); }
}

export async function markFailed(req, res, next) {
  try {
    const delivery = await DeliveriesService.markFailed(
      req.user, req.params.deliveryId, req.body.reason
    );
    res.json({ message: "Delivery marked as failed", delivery });
  } catch (e) { next(e); }
}
