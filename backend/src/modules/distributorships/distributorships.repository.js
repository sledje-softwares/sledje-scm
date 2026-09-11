// src/modules/distributorships/distributorships.repository.js
import { db } from "../../config/postgres.js";
import {
  distributorships,
  distributorshipMembers,
  distributors,
  products,
  productVariants,
} from "../../db/schema.js";
import { eq, ilike, inArray, and } from "drizzle-orm";

export default {
  async createDistributorship({ name, description }, txOrDb = db) {
    const [row] = await txOrDb
      .insert(distributorships)
      .values({ name, description: description || null })
      .returning();
    return row;
  },

  async findByName(name) {
    const [row] = await db
      .select()
      .from(distributorships)
      .where(eq(distributorships.name, name));
    return row || null;
  },

  async findById(id) {
    const [row] = await db
      .select()
      .from(distributorships)
      .where(eq(distributorships.id, id));
    return row || null;
  },

  async listAll({ search } = {}) {
    let q = db.select().from(distributorships);
    if (search) {
      q = q.where(ilike(distributorships.name, `%${search}%`));
    }
    return q.orderBy(distributorships.createdAt);
  },

  async getWithProducts(id) {
    const [ds] = await db
      .select()
      .from(distributorships)
      .where(eq(distributorships.id, id));
    if (!ds) return null;

    const prods = await db
      .select()
      .from(products)
      .where(eq(products.distributorshipId, id));

    const productIds = prods.map(p => p.id);
    let variants = [];
    if (productIds.length) {
      variants = await db
        .select()
        .from(productVariants)
        .where(inArray(productVariants.productId, productIds));
    }

    const variantMap = Object.fromEntries(productIds.map(id => [id, []]));
    for (const v of variants) {
      if (!variantMap[v.productId]) variantMap[v.productId] = [];
      variantMap[v.productId].push(v);
    }

    return {
      ...ds,
      products: prods.map(p => ({
        ...p,
        variants: variantMap[p.id] || [],
      })),
    };
  },

  // --------- Distributor mapping ---------

  async findDistributorByUserId(userId) {
    const [row] = await db
      .select()
      .from(distributors)
      .where(eq(distributors.userId, userId));
    return row || null;
  },

  // --------- Membership (Phase 2b) ---------
  // Mirrors connections.repository.js's createRequest/findExistingRequest/
  // approveRequest/rejectRequest shape, collapsed onto one table since
  // membership doubles as both the "request" and the "grant" (there is no
  // separate approved-connections table here).

  async findMembership(distributorId, distributorshipId, txOrDb = db) {
    const [row] = await txOrDb
      .select()
      .from(distributorshipMembers)
      .where(
        and(
          eq(distributorshipMembers.distributorId, distributorId),
          eq(distributorshipMembers.distributorshipId, distributorshipId)
        )
      );
    return row || null;
  },

  async findMembershipById(id, txOrDb = db) {
    const [row] = await txOrDb
      .select()
      .from(distributorshipMembers)
      .where(eq(distributorshipMembers.id, id));
    return row || null;
  },

  async createMembership(
    { distributorId, distributorshipId, status = "pending", invitedBy = null },
    txOrDb = db
  ) {
    const [row] = await txOrDb
      .insert(distributorshipMembers)
      .values({ distributorId, distributorshipId, status, invitedBy })
      .returning();
    return row;
  },

  async updateMembershipStatus(id, status, txOrDb = db) {
    const [row] = await txOrDb
      .update(distributorshipMembers)
      .set({ status, updatedAt: new Date() })
      .where(eq(distributorshipMembers.id, id))
      .returning();
    return row;
  },

  async listMembersForDistributorship(distributorshipId) {
    return db
      .select()
      .from(distributorshipMembers)
      .where(eq(distributorshipMembers.distributorshipId, distributorshipId));
  },
};
