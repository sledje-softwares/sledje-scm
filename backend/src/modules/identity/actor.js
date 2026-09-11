import IdentityRepo from "./identity.repository.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

// Closes the authorization fall-through (P5-2, P5-3): the codebase's
// ownership checks were written as `if (role === "retailer") {...}` then
// `if (role === "distributor") {...}` with no else/default-deny branch, so a
// third role (e.g. the self-registerable `delivery_agent`) fell through both
// checks and reached the return statement unfiltered.
//
// resolveActor has no path that returns without either a valid
// { role, id, profile } or a thrown AppError - a future role added to the
// system fails closed by construction, rather than depending on every call
// site remembering to add another `else`.

export async function resolveActor(user) {
  let profile = null;

  if (user?.role === "retailer") {
    profile = await IdentityRepo.findRetailerByUserId(user.id);
  } else if (user?.role === "distributor") {
    profile = await IdentityRepo.findDistributorByUserId(user.id);
  }

  if (!profile) {
    throw new AppError("Forbidden", 403);
  }

  return { role: user.role, id: profile.id, profile };
}

// Replaces the repeated "if retailer check ownership, if distributor check
// ownership" boilerplate at each call site with one comparison. `row` is any
// DB row carrying retailerId/distributorId columns (a bill, invoice, ledger
// entry, ...).
export function assertParty(actor, row) {
  const owns =
    (actor.role === "retailer" && row?.retailerId === actor.id) ||
    (actor.role === "distributor" && row?.distributorId === actor.id);

  if (!owns) {
    throw new AppError("Forbidden", 403);
  }
}
