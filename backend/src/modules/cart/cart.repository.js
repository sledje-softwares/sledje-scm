import { db } from "../../config/postgres.js";
import { carts, productVariants, products, distributors, users } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

export default {
  /**
   * Cart rows joined to catalogue + distributor info. `carts` alone (id,
   * variantId, distributorId, quantity, unit, price) has no product name,
   * sku or distributor contact - a standalone cart page needs the join to
   * render anything (P0-26: this used to crash instead, since it only ever
   * received pre-enriched data as props from retailerShelf.js).
   */
  async getCart(retailerId) {
    const rows = await db
      .select({
        id: carts.id,
        variantId: carts.variantId,
        distributorId: carts.distributorId,
        quantity: carts.quantity,
        unit: carts.unit,
        price: carts.price,
        sku: productVariants.sku,
        variantName: productVariants.name,
        productName: products.name,
        productIcon: products.imageUrl,
        distributorOwnerName: distributors.ownerName,
        distributorCompanyName: distributors.companyName,
        // phone lives on `users`, not `distributors` - joined through userId
        distributorPhone: users.phone,
      })
      .from(carts)
      .leftJoin(productVariants, eq(carts.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(distributors, eq(carts.distributorId, distributors.id))
      .leftJoin(users, eq(distributors.userId, users.id))
      .where(eq(carts.retailerId, retailerId));

    return rows.map((r) => ({ ...r, totalPrice: Number(r.price || 0) * Number(r.quantity || 0) }));
  },

  async addToCart(retailerId, { variantId, distributorId, quantity, unit, price }) {
    const existing = await db
      .select()
      .from(carts)
      .where(
        and(
          eq(carts.retailerId, retailerId),
          eq(carts.variantId, variantId)
        )
      );

    if (existing.length) {
      return db
        .update(carts)
        .set({ quantity: existing[0].quantity + quantity })
        .where(eq(carts.id, existing[0].id))
        .returning();
    }

    return db.insert(carts).values({
      retailerId,
      variantId,
      distributorId,
      quantity,
      unit,
      price,
    }).returning();
  },

  updateCartItem(retailerId, { variantId, quantity }) {
    return db
      .update(carts)
      .set({ quantity })
      .where(
        and(eq(carts.retailerId, retailerId), eq(carts.variantId, variantId))
      )
      .returning();
  },

  removeCartItem(retailerId, variantId) {
    return db
      .delete(carts)
      .where(
        and(eq(carts.retailerId, retailerId), eq(carts.variantId, variantId))
      );
  },

  clearCart(retailerId) {
    return db.delete(carts).where(eq(carts.retailerId, retailerId));
  },
};
