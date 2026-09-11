// src/api-gateway/controllers/distributorships.controller.js
import DistributorshipsService from "../../modules/distributorships/distributorships.service.js";

export async function createDistributorship(req, res, next) {
  try {
    const result = await DistributorshipsService.create(req.user, req.body);

    // Name collision: create() routed the caller through the join-request
    // path instead of granting access - tell the client that happened,
    // rather than responding as if a new distributorship (with the caller
    // already a member) was created.
    if (result?.requestSubmitted) {
      return res.status(202).json({
        message:
          "A distributorship with this name already exists; a membership request was submitted for approval",
        distributorship: result.distributorship,
        membership: result.membership,
      });
    }

    res.status(201).json({ message: "Distributorship created", distributorship: result });
  } catch (err) {
    next(err);
  }
}

export async function listDistributorships(req, res, next) {
  try {
    const { search } = req.query;
    const list = await DistributorshipsService.list({ search });
    res.json({ distributorships: list });
  } catch (err) {
    next(err);
  }
}

export async function getDistributorshipDetails(req, res, next) {
  try {
    const { id } = req.params;
    const data = await DistributorshipsService.getDetails(id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function requestToJoinDistributorship(req, res, next) {
  try {
    const { id } = req.params;
    const result = await DistributorshipsService.joinRequest(req.user.id, id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function respondToMembershipRequest(req, res, next) {
  try {
    const { id, requestId } = req.params;
    const { action } = req.body;
    const result = await DistributorshipsService.respondToMembership(
      req.user,
      id,
      requestId,
      action
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
