import { publishEvent } from "../../config/nats-streams.js";

/* Small helpers for event publishing */
export const publishOrderCreated = async (payload) => publishEvent("orders.created", payload);
export const publishOrderModified = async (payload) => publishEvent("orders.modified", payload);
export const publishOrderCancelled = async (payload) => publishEvent("orders.cancelled", payload);
export const publishOrderAccepted = async (payload) => publishEvent("orders.accepted", payload);
export const publishOrderStatusUpdated = async (payload) => publishEvent("orders.status.updated", payload);
export const publishOrderCompleted = async (payload) => publishEvent("orders.completed", payload);
