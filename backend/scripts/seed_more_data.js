import { db } from "../src/config/postgres.js";
import { distributorships, products, productVariants } from "../src/db/schema.js";
import { v4 as uuidv4 } from "uuid";

async function seed() {
    console.log("🌱 Seeding more data...");

    try {
        // 1. Create Distributorships
        const [d1] = await db.insert(distributorships).values({
            name: "Fresh Farms",
            description: "Organic produce and staples"
        }).returning();

        const [d2] = await db.insert(distributorships).values({
            name: "Tech Gadgets Inc",
            description: "Electronics and accessories"
        }).returning();

        console.log("✅ Created Distributorships:", d1.name, d2.name);

        // 2. Create Products & Variants for Fresh Farms
        const [p1] = await db.insert(products).values({
            distributorshipId: d1.id,
            name: "Organic Wheat Flour",
            category: "Staples"
        }).returning();

        await db.insert(productVariants).values([
            { productId: p1.id, name: "1kg Pack", sku: "FF-WHEAT-1KG", mrp: "60" },
            { productId: p1.id, name: "5kg Pack", sku: "FF-WHEAT-5KG", mrp: "280" }
        ]);

        const [p2] = await db.insert(products).values({
            distributorshipId: d1.id,
            name: "Basmati Rice",
            category: "Staples"
        }).returning();

        await db.insert(productVariants).values([
            { productId: p2.id, name: "Premium 1kg", sku: "FF-RICE-1KG", mrp: "120" }
        ]);

        // 3. Create Products & Variants for Tech Gadgets Inc
        const [p3] = await db.insert(products).values({
            distributorshipId: d2.id,
            name: "Wireless Earbuds",
            category: "Electronics"
        }).returning();

        await db.insert(productVariants).values([
            { productId: p3.id, name: "Black", sku: "TG-BUDS-BLK", mrp: "1500" },
            { productId: p3.id, name: "White", sku: "TG-BUDS-WHT", mrp: "1500" }
        ]);

        console.log("✅ Created Products & Variants");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
}

seed();
