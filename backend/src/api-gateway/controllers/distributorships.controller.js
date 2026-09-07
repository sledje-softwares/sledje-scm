// src/api-gateway/controllers/distributorships.controller.js
import DistributorshipsService from "../../modules/distributorships/distributorships.service.js";

export async function createDistributorship(req, res, next) {
  try {
    const ds = await DistributorshipsService.create(req.user, req.body);
    res.status(201).json({ message: "Distributorship created", distributorship: ds });
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
