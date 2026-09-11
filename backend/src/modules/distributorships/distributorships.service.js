// src/modules/distributorships/distributorships.service.js
//
// Phase 2b: a distributorship is a shared catalogue namespace, not an owned
// one. A distributor needs ACTIVE membership (distributorship_members) before
// they can write to its catalogue. The grant flow mirrors
// connections.service.js's sendRequest/respondToRequest (pending ->
// approved/rejected there; pending -> active/rejected here).
import DistributorshipsRepo from "./distributorships.repository.js";
import { db } from "../../config/postgres.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

export default {
  /**
   * Bootstrap: creating a brand-new distributorship auto-activates the
   * caller as its first member - there is no one else yet to approve them.
   * If the name already exists, this must NOT silently hand back the
   * existing distributorship (that would let someone "join" with no request
   * and no approval); it goes through the join-request path instead.
   */
  async create(user, { name, description }) {
    if (!user) throw new AppError("Unauthorized", 401);
    if (user.role !== "distributor") throw new AppError("Forbidden", 403);
    if (!name) throw new AppError("Name is required", 400);

    const distributor = await DistributorshipsRepo.findDistributorByUserId(user.id);
    if (!distributor) throw new AppError("Distributor profile not found", 404);

    const existing = await DistributorshipsRepo.findByName(name);
    if (existing) {
      // Name collision: route through the join-request path rather than
      // handing back access to an existing namespace.
      const joinResult = await this.joinRequest(user.id, existing.id);
      return {
        requestSubmitted: true,
        distributorship: existing,
        membership: joinResult.membership,
      };
    }

    return db.transaction(async (tx) => {
      const created = await DistributorshipsRepo.createDistributorship(
        { name, description },
        tx
      );
      await DistributorshipsRepo.createMembership(
        {
          distributorId: distributor.id,
          distributorshipId: created.id,
          status: "active",
          invitedBy: null,
        },
        tx
      );
      return created;
    });
  },

  async list({ search }) {
    return DistributorshipsRepo.listAll({ search });
  },

  async getDetails(id) {
    return DistributorshipsRepo.getWithProducts(id);
  },

  /**
   * A distributor requesting access to an existing distributorship. Mirrors
   * POST /connections/request: rejects outright if a non-rejected request
   * already exists for this pair, rather than silently reusing it.
   */
  async joinRequest(distributorUserId, distributorshipId) {
    const distributor = await DistributorshipsRepo.findDistributorByUserId(
      distributorUserId
    );
    if (!distributor) throw new AppError("Distributor profile not found", 404);

    const ds = await DistributorshipsRepo.findById(distributorshipId);
    if (!ds) throw new AppError("Distributorship not found", 404);

    const existing = await DistributorshipsRepo.findMembership(
      distributor.id,
      distributorshipId
    );

    if (existing && existing.status !== "rejected") {
      throw new AppError(
        `A membership request already exists for this distributorship (status: ${existing.status})`,
        400
      );
    }

    const membership = existing
      ? await DistributorshipsRepo.updateMembershipStatus(existing.id, "pending")
      : await DistributorshipsRepo.createMembership({
          distributorId: distributor.id,
          distributorshipId,
          status: "pending",
          invitedBy: null,
        });

    return { message: "Join request submitted", membership };
  },

  /**
   * An existing ACTIVE member approves or rejects a pending join request.
   * Mirrors PUT /connections/respond/:requestId. There is no admin tier in
   * this system - "an existing active member vouches for a new one" is the
   * complete trust model, same as retailer<->distributor connections.
   */
  async respondToMembership(user, distributorshipId, requestId, action) {
    if (!user || user.role !== "distributor") throw new AppError("Forbidden", 403);

    const distributor = await DistributorshipsRepo.findDistributorByUserId(user.id);
    if (!distributor) throw new AppError("Distributor profile not found", 404);

    // Only an active member of THIS distributorship may approve/reject.
    await this.requireActiveMembership(distributor.id, distributorshipId);

    const request = await DistributorshipsRepo.findMembershipById(requestId);
    if (!request || request.distributorshipId !== distributorshipId) {
      throw new AppError("Membership request not found", 404);
    }
    if (request.status !== "pending") {
      throw new AppError("Request is not pending", 400);
    }

    if (action === "approve") {
      const updated = await DistributorshipsRepo.updateMembershipStatus(
        requestId,
        "active"
      );
      return { message: "Membership approved", membership: updated };
    }

    if (action === "reject") {
      const updated = await DistributorshipsRepo.updateMembershipStatus(
        requestId,
        "rejected"
      );
      return { message: "Membership rejected", membership: updated };
    }

    throw new AppError("Invalid action", 400);
  },

  /**
   * The enforcement primitive other modules (products, distributor-inventory)
   * call before allowing a distributor to write to a distributorship's
   * catalogue. Throws 403 unless the caller has an ACTIVE membership row.
   */
  async requireActiveMembership(distributorId, distributorshipId) {
    const membership = await DistributorshipsRepo.findMembership(
      distributorId,
      distributorshipId
    );
    if (!membership || membership.status !== "active") {
      throw new AppError(
        "Forbidden: not an active member of this distributorship",
        403
      );
    }
    return membership;
  },
};
