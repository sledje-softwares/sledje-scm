/**
 * scripts/seed_offline_demo.js
 *
 * Puts a throwaway database into a known state for driving the POS in a real
 * browser: one retailer, one distributor, two SKUs on the shelf with FIFO cost
 * layers behind them.
 *
 * TRUNCATES. Throwaway databases only; refuses without the env guard.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { db } from "../src/config/postgres.js";
import {
  users, retailers, distributors, distributorships, distributorshipMembers,
  products, productVariants, inventory, connections, distributorInventory,
  deliveryAgents,
} from "../src/db/schema.js";
import { sql } from "drizzle-orm";
import ProductBillsRepo from "../src/modules/product-bills/product-bills.repository.js";

if (process.env.VERIFY_I_KNOW_THIS_TRUNCATES !== "1") {
  console.error("Refusing to run: this truncates its database. Set VERIFY_I_KNOW_THIS_TRUNCATES=1.");
  process.exit(1);
}

const EMAIL = process.env.DEMO_EMAIL || "till@verify.local";
const PASSWORD = process.env.DEMO_PASSWORD || "verify-pass";

async function main() {
  await db.execute(sql`
    TRUNCATE TABLE
      sync_ops, sync_devices,
      sale_payments, sale_items, sales, customers, retail_prices,
      product_bill_layers, product_bill_transactions, product_delivery_log,
      product_bills, ledger, outbox, inventory,
      order_delivery_codes, order_items, orders, deliveries, delivery_agents,
      connections, connection_requests, distributor_inventory,
      distributorship_members,
      product_variants, products, distributorships,
      retailers, distributors, users
    RESTART IDENTITY CASCADE
  `);

  const password = await bcrypt.hash(PASSWORD, 10);

  const [ru] = await db.insert(users).values({
    role: "retailer", email: EMAIL, password, phone: "9000000001",
  }).returning();
  const [retailer] = await db.insert(retailers).values({
    userId: ru.id, businessName: "Verify Kirana", ownerName: "R",
    businessType: "kirana", pincode: "560001",
  }).returning();

  const [du] = await db.insert(users).values({
    role: "distributor", email: "dist@verify.local", password, phone: "9000000002",
  }).returning();
  const [distributor] = await db.insert(distributors).values({
    userId: du.id, companyName: "Verify Distribution", ownerName: "D",
    businessType: "wholesale", pincode: "560001",
  }).returning();

  const [au] = await db.insert(users).values({
    role: "delivery_agent", email: "agent@verify.local", password, phone: "9000000003",
  }).returning();
  const [agent] = await db.insert(deliveryAgents).values({
    userId: au.id, name: "Verify Runner", phone: "9000000003",
    vehicleNumber: "KA01AB1234", operatingPincode: "560001",
  }).returning();

  // The retailer has to already be connected to the distributor to order from
  // them, and the distributor has to hold active membership in the
  // distributorship before it may touch that catalogue at all (Phase 2). A
  // seed without these two rows produces a system that looks populated but
  // where every write path 403s.
  await db.insert(connections).values({
    retailerId: retailer.id, distributorId: distributor.id,
  });

  const [ship] = await db.insert(distributorships).values({
    name: "Verify Foods", description: "demo",
  }).returning();
  await db.insert(distributorshipMembers).values({
    distributorId: distributor.id, distributorshipId: ship.id, status: "active",
  });
  const [product] = await db.insert(products).values({
    distributorshipId: ship.id, name: "Parle-G", category: "Biscuits",
    createdByDistributorId: distributor.id,
  }).returning();

  const skus = [
    { name: "100g", sku: "PARLE-G-100G", mrp: "20.00", sell: "12.00", layers: [{ qty: 50, cost: 10 }, { qty: 50, cost: 12 }] },
    { name: "250g", sku: "PARLE-G-250G", mrp: "45.00", sell: "32.00", layers: [{ qty: 30, cost: 30 }] },
  ];

  const out = [];
  for (const s of skus) {
    const [variant] = await db.insert(productVariants).values({
      productId: product.id, name: s.name, sku: s.sku, mrp: s.mrp,
      unit: "packet", gstRate: "0",
    }).returning();

    // What the distributor has on hand to sell, and at what price - order
    // totals price from here, not from the variant's MRP.
    await db.insert(distributorInventory).values({
      distributorId: distributor.id, variantId: variant.id,
      stock: 500, sellingPrice: s.sell, costPrice: s.sell,
    });

    const bill = await ProductBillsRepo.createBill({
      retailerId: retailer.id, distributorId: distributor.id, variantId: variant.id,
    });
    for (const l of s.layers) {
      await db.transaction((tx) => ProductBillsRepo.recordReceipt(tx, {
        productBillId: bill.id, orderId: crypto.randomUUID(), variantId: variant.id,
        qty: l.qty, unitCost: String(l.cost),
      }));
    }
    const total = s.layers.reduce((a, l) => a + l.qty, 0);
    await db.insert(inventory).values({ retailerId: retailer.id, variantId: variant.id, qty: total });
    out.push({ sku: s.sku, variantId: variant.id, billId: bill.id, qty: total });
  }

  console.log(JSON.stringify({
    login: { email: EMAIL, password: PASSWORD },
    distributorLogin: { email: "dist@verify.local", password: PASSWORD },
    agentLogin: { email: "agent@verify.local", password: PASSWORD },
    retailerId: retailer.id, distributorId: distributor.id,
    agentId: agent.id, distributorshipId: ship.id, variants: out,
  }, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
