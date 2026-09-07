// src/modules/delivery-agents/delivery-agents.service.js
//
// Delivery agents are a platform-level pool: they self-register as a third
// account type and any distributor may assign an available one. Vetting,
// ratings and dispute handling are deliberately out of scope for now.

import bcrypt from "bcrypt";
import { db } from "../../config/postgres.js";
import { users } from "../../db/schema.js";
import AgentsRepo from "./delivery-agents.repository.js";
import AuthRepo from "../auth/auth.repository.js";
import { signToken } from "../../utils/jwt.js";

const SALT_ROUNDS = 10;

const AgentsService = {
  async register({ email, password, phone, name, vehicleNumber, operatingPincode }) {
    if (!email || !password) throw new Error("email and password are required");
    if (!name) throw new Error("name is required");

    const existing = await AuthRepo.findUserByEmail(email);
    if (existing) throw new Error("Email already registered");

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ role: "delivery_agent", email, password: hashed, phone: phone || "" })
        .returning();

      const agent = await AgentsRepo.create(tx, {
        userId: user.id,
        name,
        phone: phone || "",
        vehicleNumber,
        operatingPincode,
      });

      return { user, agent };
    });

    const token = signToken({ id: created.user.id, role: "delivery_agent" });

    return {
      token,
      user: {
        id: created.user.id,
        email: created.user.email,
        role: "delivery_agent",
        agent: created.agent,
      },
    };
  },

  async login({ email, password }) {
    const user = await AuthRepo.findUserByEmail(email);
    if (!user) throw new Error("Invalid credentials");

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error("Invalid credentials");

    if (user.role !== "delivery_agent") throw new Error("Not a delivery agent account");

    const agent = await AgentsRepo.findByUserId(user.id);
    const token = signToken({ id: user.id, role: user.role });

    return { token, user: { id: user.id, email: user.email, role: user.role, agent } };
  },

  async getProfile(user) {
    const agent = await AgentsRepo.findByUserId(user.id);
    if (!agent) throw new Error("Delivery agent profile not found");
    return agent;
  },

  async setAvailability(user, isAvailable) {
    return AgentsRepo.updateByUserId(user.id, { isAvailable: Boolean(isAvailable) });
  },

  /** Distributor-facing: who can I hand this run to? */
  async listAvailable(user, filters) {
    if (user.role !== "distributor") throw new Error("Only distributors allowed");
    return AgentsRepo.listAvailable(filters);
  },
};

export default AgentsService;
