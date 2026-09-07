import { publishEvent } from "../../config/nats-streams.js";

export const publishVariantAdded = (payload) =>
  publishEvent("inventory.variant_added", payload);

export const publishInventoryUpdated = (payload) =>
  publishEvent("inventory.updated", payload);
