import { publishEvent } from "../../config/nats-streams.js";

export const publishConnectionRequested = (payload) =>
  publishEvent("connections.requested", payload);

export const publishConnectionApproved = (payload) =>
  publishEvent("connections.approved", payload);

export const publishConnectionRejected = (payload) =>
  publishEvent("connections.rejected", payload);

export const publishConnectionDeleted = (payload) =>
  publishEvent("connections.deleted", payload);
