import ConnectionsService from "../../modules/connections/connections.service.js";

export async function sendConnectionRequest(req, res, next) {
  try {
    const retailerUserId = req.user.id;
    const { distributorId, message } = req.body;
    const data = await ConnectionsService.sendRequest(retailerUserId, distributorId, message);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getRetailerRequests(req, res, next) {
  try {
    const retailerUserId = req.user.id;
    const data = await ConnectionsService.getRetailerRequests(retailerUserId);
    res.json({ requests: data });
  } catch (err) {
    next(err);
  }
}

export async function getConnectedDistributors(req, res, next) {
  try {
    const retailerUserId = req.user.id;
    const data = await ConnectionsService.getConnectedDistributors(retailerUserId);
    res.json({ distributors: data });
  } catch (err) {
    next(err);
  }
}

export async function getDistributorRequests(req, res, next) {
  try {
    const distributorUserId = req.user.id;
    const data = await ConnectionsService.getDistributorRequests(distributorUserId);
    res.json({ requests: data });
  } catch (err) {
    next(err);
  }
}

export async function getConnectedRetailers(req, res, next) {
  try {
    const distributorUserId = req.user.id;
    console.log("Distributor User ID:", distributorUserId);
    const data = await ConnectionsService.getConnectedRetailers(distributorUserId);
    res.json({ retailers: data });
  } catch (err) {
    next(err);
  }
}

export async function respondToRequest(req, res, next) {
  try {
    const distributorUserId = req.user.id;
    const { requestId } = req.params;
    const { action, rejectionReason } = req.body;
    const data = await ConnectionsService.respondToRequest(distributorUserId, requestId, action, rejectionReason);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function removeConnection(req, res, next) {
  try {
    const userId = req.user.id;
    const { distributorId } = req.params;
    const data = await ConnectionsService.removeConnection(userId, distributorId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function searchDistributors(req, res, next) {
  try {
    const retailerUserId = req.user.id;
    const filters = req.query;
    const data = await ConnectionsService.searchDistributors(retailerUserId, filters);
    res.json({ results: data });
  } catch (err) {
    next(err);
  }
}

export async function suggestedDistributors(req, res, next) {
  try {
    const retailerUserId = req.user.id;
    const data = await ConnectionsService.suggestedDistributors(retailerUserId);
    res.json({ distributors: data });
  } catch (err) {
    next(err);
  }
}

export async function searchRetailers(req, res, next) {
  try {
    const distributorUserId = req.user.id;
    const filters = req.query;
    const data = await ConnectionsService.searchRetailers(distributorUserId, filters);
    res.json({ retailers: data });
  } catch (err) {
    next(err);
  }
}

export async function suggestedRetailers(req, res, next) {
  try {
    const distributorUserId = req.user.id;
    const data = await ConnectionsService.suggestedRetailers(distributorUserId);
    res.json({ retailers: data });
  } catch (err) {
    next(err);
  }
}
