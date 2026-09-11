// test/authz.catalogue.test.js
//
// Pins P5-4, the worst finding in the remediation plan short of the leaked
// secret: products.repository.js's updateProductInCatalog does
// DELETE FROM product_variants WHERE product_id = ? and re-inserts whatever
// the caller sent. distributor_inventory.variant_id is ON DELETE CASCADE off
// product_variants, so any distributor editing a shared distributorship's
// product can wipe out a *different* distributor's stock/pricing row - and
// deleteProductFromCatalog hard-deletes the product, cascading the same way.
//
// Fixed by Phase 2a: updateProductInCatalog reconciles variants by id/sku in
// place instead of delete-and-reinsert, and refuses to remove a variant that
// still has a referencing distributor_inventory/product_bills/inventory row;
// deleteProductFromCatalog becomes a soft delete (products.archivedAt) so it
// never issues a cascading DELETE at all.
//
// Expected RED until Phase 2a lands: both operations destroy distributor B's
// distributor_inventory row today, with no membership/ownership check at all
// on the write (Phase 2's membership gate isn't required for this bug - the
// destruction happens regardless of who is allowed to touch the catalogue).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../src/config/postgres.js";
import { distributorInventory } from "../src/db/schema.js";
import {
  startTestServer,
  stopTestServer,
  resetDb,
  apiRequest,
  seedDistributor,
  seedDistributorship,
  seedProduct,
  seedVariant,
} from "./helpers.js";

let server;
let baseUrl;
let distributorA;
let distributorB;

before(async () => {
  await resetDb();
  ({ server, baseUrl } = await startTestServer());

  distributorA = await seedDistributor();
  distributorB = await seedDistributor();
});

after(async () => {
  await stopTestServer(server);
});

test("A's catalogue update (replacing variants) must not destroy B's stock row (P5-4)", async () => {
  const ship = await seedDistributorship();
  const product = await seedProduct(ship.id);
  const variant = await seedVariant(product.id, { sku: "SHARED-SKU-UPDATE" });

  const [bRow] = await db
    .insert(distributorInventory)
    .values({
      distributorId: distributorB.profile.id,
      variantId: variant.id,
      stock: 50,
      sellingPrice: "20.00",
      costPrice: "15.00",
    })
    .returning();

  const res = await apiRequest(baseUrl, {
    method: "PUT",
    path: `/products/${product.id}`,
    token: distributorA.token,
    body: {
      name: product.name,
      variants: [{ name: "A brand-new variant", sku: "A-NEW-SKU-UPDATE", mrp: "12.00" }],
    },
  });

  const surviving = await db
    .select()
    .from(distributorInventory)
    .where(eq(distributorInventory.id, bRow.id));

  assert.equal(
    surviving.length,
    1,
    `distributor B's distributor_inventory row was destroyed by A's PUT /products/${product.id} ` +
      `(response status ${res.status}) - today's delete-and-reinsert-all-variants path cascades ` +
      `through the FK and takes B's stock row with it`
  );
});

test("A deleting the product must not destroy B's stock row - intended fix is a soft delete (P5-4)", async () => {
  const ship = await seedDistributorship();
  const product = await seedProduct(ship.id);
  const variant = await seedVariant(product.id, { sku: "SHARED-SKU-DELETE" });

  const [bRow] = await db
    .insert(distributorInventory)
    .values({
      distributorId: distributorB.profile.id,
      variantId: variant.id,
      stock: 20,
      sellingPrice: "5.00",
      costPrice: "3.00",
    })
    .returning();

  const res = await apiRequest(baseUrl, {
    method: "DELETE",
    path: `/products/${product.id}`,
    token: distributorA.token,
  });

  const surviving = await db
    .select()
    .from(distributorInventory)
    .where(eq(distributorInventory.id, bRow.id));

  assert.equal(
    surviving.length,
    1,
    `DELETE /products/${product.id} destroyed distributor B's distributor_inventory row ` +
      `(response status ${res.status}) - the plan's intended fix is a soft delete ` +
      `(products.archivedAt / productVariants.archivedAt), never a hard DELETE that cascades ` +
      `through product_variants`
  );
});
