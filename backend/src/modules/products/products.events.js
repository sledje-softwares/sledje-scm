import { publishEvent } from "../../config/nats-streams.js";

export function publishProductCreated(payload) {
  return publishEvent("products.created", payload);
}

export function publishProductUpdated(payload) {
  return publishEvent("products.updated", payload);
}

export function publishProductDeleted(payload) {
  return publishEvent("products.deleted", payload);
}
