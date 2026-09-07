import { db } from "../src/config/postgres.js";
import { distributorships, products, productVariants } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function seed() {
    console.log("Seeding test data...");

    try {
        // 1. Create Distributorship
        const [distributorship] = await db.insert(distributorships).values({
            name: "Global Foods Ltd",
            description: "Premium food distributor"
        }).returning();
        console.log("Created Distributorship:", distributorship.name);

        // 2. Create Product
        const [product] = await db.insert(products).values({
            distributorshipId: distributorship.id,
            name: "Premium Basmati Rice",
            category: "Groceries",
            subcategory: "Rice",
            imageUrl: "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=720/app/images/category/cms_images/icon/1487_1679466558536.png"
        }).returning();
        console.log("Created Product:", product.name);

        // 3. Create Variant
        const [variant] = await db.insert(productVariants).values({
            productId: product.id,
            name: "5kg Pack",
            sku: "RICE-BAS-5KG",
            mrp: "850.00",
            unit: "bag"
        }).returning();
        console.log("Created Variant:", variant.name);

        console.log("✅ Seed complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seed failed:", err);
        process.exit(1);
    }
}

seed();
