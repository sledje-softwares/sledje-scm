/**
 * scripts/backfill_distributorship_members.js
 *
 * Phase 2b (catalogue membership) introduces distributorship_members as a
 * gate: a distributor needs an ACTIVE row there before they can write to a
 * distributorship's catalogue or import its variants into their own
 * inventory. That table did not exist before this migration, so every
 * distributor who was ALREADY stocking a distributorship's products (i.e.
 * holds a distributor_inventory row on one of its variants) would otherwise
 * be locked out post-deploy with no path back in except a fresh join
 * request.
 *
 * This script treats an existing distributor_inventory row as standing
 * evidence of access and backfills it as an ACTIVE membership:
 *
 *   distributor_inventory
 *     -> product_variants (variant_id)
 *     -> products (product_id)
 *     -> distributorship_id
 *
 * for every DISTINCT (distributor_id, distributorship_id) pair found that
 * way.
 *
 * Idempotent: safe to run twice. Relies on the uq_distributorship_member
 * unique constraint (distributor_id, distributorship_id) + onConflictDoNothing
 * rather than an existence check, so a concurrent run can't double-insert
 * either.
 *
 * This is a one-time data backfill, not part of the migration itself
 * (drizzle/0009_add_distributorship_members_and_curation.sql only creates
 * the table/columns) - ci_migrate_with_data.js does not need to reason
 * about it, and it can be re-run safely any time after deploy.
 *
 * Usage:
 *   POSTGRES_URL=... node scripts/backfill_distributorship_members.js
 *   POSTGRES_URL=... node scripts/backfill_distributorship_members.js --dry-run
 */

import "dotenv/config";
import { db } from "../src/config/postgres.js";
import {
  distributorInventory,
  productVariants,
  products,
  distributorshipMembers,
} from "../src/db/schema.js";
import { eq, sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

async function findStandingAccessPairs() {
  // DISTINCT (distributor_id, distributorship_id) evidenced by an existing
  // distributor_inventory row.
  const rows = await db
    .selectDistinct({
      distributorId: distributorInventory.distributorId,
      distributorshipId: products.distributorshipId,
    })
    .from(distributorInventory)
    .innerJoin(productVariants, eq(distributorInventory.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id));

  return rows;
}

async function main() {
  console.log(`Backfilling distributorship_members${DRY_RUN ? " (DRY RUN - no writes)" : ""}...`);

  const pairs = await findStandingAccessPairs();
  console.log(`Found ${pairs.length} distinct (distributor, distributorship) pair(s) with standing distributor_inventory access.`);

  if (DRY_RUN) {
    for (const p of pairs) {
      console.log(`  would activate: distributor=${p.distributorId} distributorship=${p.distributorshipId}`);
    }
    console.log("Dry run complete. No rows written.");
    process.exit(0);
  }

  let inserted = 0;
  let skipped = 0;

  for (const p of pairs) {
    const result = await db
      .insert(distributorshipMembers)
      .values({
        distributorId: p.distributorId,
        distributorshipId: p.distributorshipId,
        status: "active",
        invitedBy: null,
      })
      .onConflictDoNothing({
        target: [distributorshipMembers.distributorId, distributorshipMembers.distributorshipId],
      })
      .returning({ id: distributorshipMembers.id });

    if (result.length) {
      inserted += 1;
    } else {
      // Either already backfilled by a prior run, or the pair already has a
      // membership row (pending/active/rejected) from the normal grant flow -
      // onConflictDoNothing leaves whatever status is already there alone
      // rather than overwriting e.g. a rejected row back to active.
      skipped += 1;
    }
  }

  console.log(`Done. ${inserted} membership row(s) inserted as active, ${skipped} pair(s) already had a membership row (left untouched).`);

  const { rows: totals } = await db.execute(
    sql`SELECT status, count(*)::int AS n FROM distributorship_members GROUP BY status`
  );
  console.log("Current distributorship_members totals by status:", totals);

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
