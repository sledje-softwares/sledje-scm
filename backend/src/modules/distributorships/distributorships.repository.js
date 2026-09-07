// src/modules/distributorships/distributorships.repository.js
import { db } from "../../config/postgres.js";
import { distributorships, products, productVariants } from "../../db/schema.js";
import { eq, ilike, inArray } from "drizzle-orm";

export default {
  async createDistributorship({ name, description }) {
    const [row] = await db
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
};
