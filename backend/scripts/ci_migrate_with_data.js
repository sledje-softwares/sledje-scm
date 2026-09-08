// Apply the migration chain to a database that ALREADY HOLDS DATA.
//
// This exists because migration 0008 shipped declaring varchar(26) for ids it
// converted from uuid. A ULID is 26 characters; a uuid rendered as text is 36.
// It passed every test, because every test ran against an empty sales table.
// On any database with a real sale it aborted with "value too long" - and,
// not being wrapped in a transaction, left sale_items and sale_payments with
// their foreign keys dropped.
//
// A migration that only works on an empty database is not a migration.
//
// Strategy: migrate to N-1, seed representative rows, apply the final
// migration, then assert the data survived with its identity and its links.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const DIR = join(process.cwd(), "drizzle");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
if (files.length < 2) {
  console.log("fewer than two migrations; nothing to test");
  process.exit(0);
}

const url = process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL is required");

const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS sledje_migtest`);
await admin.query(`CREATE DATABASE sledje_migtest`);
await admin.end();

const c = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, "/sledje_migtest") });
await c.connect();

const head = files.slice(0, -1);
const last = files[files.length - 1];

for (const f of head) await c.query(readFileSync(join(DIR, f), "utf8"));
console.log(`applied ${head.length} migrations, seeding data before ${last}`);

const R = "22222222-2222-2222-2222-222222222222";
const S = "66666666-6666-6666-6666-666666666666";
await c.query(`
  INSERT INTO users (id,role,email,password,phone) VALUES ('11111111-1111-1111-1111-111111111111','retailer','ci@t','x','1');
  INSERT INTO retailers (id,user_id,business_name,owner_name,business_type,pincode) VALUES ('${R}','11111111-1111-1111-1111-111111111111','CI','O','kirana','800001');
  INSERT INTO distributorships (id,name) VALUES ('33333333-3333-3333-3333-333333333333','B');
  INSERT INTO products (id,distributorship_id,name) VALUES ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','P');
  INSERT INTO product_variants (id,product_id,name,sku) VALUES ('55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444','v','CI-SKU-1');
`);

// Seed the sale only if the schema still has it at this point in history.
const hasSales = await c.query(`SELECT to_regclass('public.sales') IS NOT NULL AS ok`);
if (hasSales.rows[0].ok) {
  await c.query(`
    INSERT INTO sales (id,retailer_id,bill_number,subtotal,total) VALUES ('${S}','${R}','CI-00001',100,100);
    INSERT INTO sale_items (id,sale_id,variant_id,quantity,unit_price,amount) VALUES ('77777777-7777-7777-7777-777777777777','${S}','55555555-5555-5555-5555-555555555555',5,20,100);
    INSERT INTO sale_payments (id,sale_id,method,amount) VALUES ('88888888-8888-8888-8888-888888888888','${S}','cash',100);
  `);
}

try {
  await c.query(readFileSync(join(DIR, last), "utf8"));
  console.log(`applied ${last} to a populated database`);
} catch (e) {
  console.error(`::error::${last} FAILED against existing data: ${e.message}`);
  process.exit(1);
}

if (hasSales.rows[0].ok) {
  const sale = await c.query(`SELECT id::text AS id FROM sales WHERE id::text = $1`, [S]);
  if (!sale.rowCount) {
    console.error("::error::the seeded sale did not survive the migration");
    process.exit(1);
  }
  const linked = await c.query(`SELECT count(*)::int AS n FROM sale_items si JOIN sales s ON si.sale_id = s.id`);
  if (linked.rows[0].n !== 1) {
    console.error("::error::sale_items no longer join to sales after the migration");
    process.exit(1);
  }
  const fks = await c.query(`
    SELECT count(*)::int AS n FROM information_schema.table_constraints
    WHERE constraint_name IN ('sale_items_sale_id_sales_id_fk','sale_payments_sale_id_sales_id_fk')`);
  if (fks.rows[0].n !== 2) {
    console.error(`::error::foreign keys not restored (found ${fks.rows[0].n}/2)`);
    process.exit(1);
  }
  console.log("data survived: identity preserved, children linked, foreign keys restored");
}

await c.end();
console.log("migration-with-data check passed");
