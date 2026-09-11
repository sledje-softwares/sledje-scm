import {
  pgTable,
  text,
  varchar,
  uuid,
  integer,
  timestamp,
  numeric,
  boolean,
  jsonb,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ===============================
  1. USERS (for login/auth)
  =============================== */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  role: text("role").notNull(), // retailer | distributor

  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  phone: text("phone").notNull(),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  2. RETAILERS
  =============================== */

export const retailers = pgTable("retailers", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),

  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),

  gstNumber: text("gst_number"),
  businessType: text("business_type").notNull(),

  pincode: text("pincode").notNull(),
  state: text("state"), // for GST intra/inter state logic
  location: text("location"),
  address: text("address"),
  profilePictureUrl: text("profile_picture_url"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  3. DISTRIBUTORS
  =============================== */

export const distributors = pgTable("distributors", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),

  companyName: text("company_name").notNull(),
  ownerName: text("owner_name").notNull(),

  gstNumber: text("gst_number"),
  businessType: text("business_type").notNull(),

  pincode: text("pincode").notNull(),
  state: text("state"), // for GST intra/inter state logic
  location: text("location"),
  address: text("address"),
  profilePictureUrl: text("profile_picture_url"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  4. CONNECTION REQUESTS
  =============================== */

export const connectionRequests = pgTable("connection_requests", {
  id: uuid("id").defaultRandom().primaryKey(),

  retailerId: uuid("retailer_id").references(() => retailers.id, {
    onDelete: "cascade",
  }),

  distributorId: uuid("distributor_id").references(() => distributors.id, {
    onDelete: "cascade",
  }),

  status: text("status").default("pending"), // pending | approved | rejected
  message: text("message"),
  rejectionReason: text("rejection_reason"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  5. CONNECTIONS (approved)
  =============================== */

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    retailerId: uuid("retailer_id").references(() => retailers.id, {
      onDelete: "cascade",
    }),

    distributorId: uuid("distributor_id").references(() => distributors.id, {
      onDelete: "cascade",
    }),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("uq_connection_pair").on(table.retailerId, table.distributorId),
  ]
);

/* ===============================
  6. DISTRIBUTORSHIPS (NEW)
  =============================== */

export const distributorships = pgTable("distributorships", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull().unique(),
  description: text("description"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  6b. DISTRIBUTORSHIP MEMBERS (NEW - Phase 2b)

  A distributorship is a shared catalogue namespace, not an owned one - it
  gets no owner column. Membership is this many-to-many table instead: a
  distributor needs an ACTIVE row here before they can create/edit/delete the
  distributorship's products or import its variants into their own
  inventory. Mirrors connection_requests' pending -> approved/rejected shape
  (connections.repository.js), except the terminal "granted" state is named
  "active" here since it doubles as the membership row itself (there is no
  separate "distributorship_connections" table the way retailer<->distributor
  has connections vs connection_requests).
  =============================== */

export const distributorshipMembers = pgTable(
  "distributorship_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => distributors.id, { onDelete: "cascade" }),

    distributorshipId: uuid("distributorship_id")
      .notNull()
      .references(() => distributorships.id, { onDelete: "cascade" }),

    status: text("status").notNull().default("pending"), // pending | active | rejected

    invitedBy: uuid("invited_by").references(() => distributors.id),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("uq_distributorship_member").on(
      table.distributorId,
      table.distributorshipId
    ),
  ]
);

/* ===============================
  7. PRODUCTS (GLOBAL CATALOG)
  =============================== */

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),

  // NEW: Every product belongs to a distributorship
  distributorshipId: uuid("distributorship_id")
    .references(() => distributorships.id, { onDelete: "cascade" })
    .notNull(),

  name: text("name").notNull(),
  imageUrl: text("image_url"), // NEW

  category: text("category"),
  subcategory: text("subcategory"),

  // Curation (docs/02-product-billing.md membership model, Phase 2c): the
  // distributor who created this product. Update/archive is limited to this
  // distributor among the distributorship's active members, UNLESS a
  // *different* distributor has since stocked it (a distributor_inventory
  // row exists on one of its variants) - at that point the product becomes
  // append-only for everyone. Nullable because pre-existing rows have no
  // known creator.
  createdByDistributorId: uuid("created_by_distributor_id").references(
    () => distributors.id
  ),

  // Soft delete (P5-4): a hard DELETE here used to cascade into
  // distributor_inventory / product_bills / inventory rows that carry another
  // tenant's billing history. archivedAt hides a product from catalogue reads
  // without destroying anything referencing its variants.
  archivedAt: timestamp("archived_at"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  8. PRODUCT VARIANTS (NO STOCK)
  =============================== */

export const productVariants = pgTable("product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),

  productId: uuid("product_id").references(() => products.id, {
    onDelete: "cascade",
  }),

  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  mrp: numeric("mrp", { precision: 10, scale: 2 }).default("0"),

  unit: text("unit"),
  hsnCode: text("hsn_code"),

  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).default("0"),
  isTaxInclusive: boolean("is_tax_inclusive").default(false),

  // See products.archivedAt above - same reasoning, one level down.
  archivedAt: timestamp("archived_at"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  9. DISTRIBUTOR INVENTORY (NEW)
  =============================== */

export const distributorInventory = pgTable("distributor_inventory", {
  id: uuid("id").defaultRandom().primaryKey(),

  distributorId: uuid("distributor_id")
    .references(() => distributors.id, { onDelete: "cascade" })
    .notNull(),

  variantId: uuid("variant_id")
    .references(() => productVariants.id, { onDelete: "cascade" })
    .notNull(),

  stock: integer("stock").default(0),

  sellingPrice: numeric("selling_price", {
    precision: 10,
    scale: 2,
  }).default("0"),

  costPrice: numeric("cost_price", {
    precision: 10,
    scale: 2,
  }).default("0"),

  expiry: timestamp("expiry"),

  lowStockThreshold: integer("low_stock_threshold").default(5),

  // Stock committed to an accepted order or already in transit. Reserved when
  // the distributor accepts, released when the delivery is confirmed. On-hand
  // available to sell is (stock - out_for_delivery).
  outForDelivery: integer("out_for_delivery").notNull().default(0),

  createdAt: timestamp("created_at").defaultNow(),
});


/* ===============================
  10. RETAILER INVENTORY
  =============================== */

export const inventory = pgTable("inventory", {
  id: uuid("id").defaultRandom().primaryKey(),

  retailerId: uuid("retailer_id").references(() => retailers.id, {
    onDelete: "cascade",
  }),

  variantId: uuid("variant_id").references(() => productVariants.id, {
    onDelete: "cascade",
  }),

  qty: integer("qty").notNull().default(0),

  // per-retailer reorder level (for low stock alerts)
  reorderLevel: integer("reorder_level").default(5),

  // optional expiry at retailer level (per-batch would need separate table)
  expiry: timestamp("expiry"),

  dailyAvgSales: numeric("daily_avg_sales", {
    precision: 10,
    scale: 2,
  }).default("0"),

  lastUpdated: timestamp("last_updated").defaultNow(),
});

/* ===============================
  9. CART
  =============================== */

export const carts = pgTable("carts", {
  id: uuid("id").defaultRandom().primaryKey(),

  retailerId: uuid("retailer_id").references(() => retailers.id, {
    onDelete: "cascade",
  }),

  variantId: uuid("variant_id").references(() => productVariants.id),
  distributorId: uuid("distributor_id").references(() => distributors.id),

  quantity: integer("quantity").notNull(),
  unit: text("unit"),
  price: numeric("price", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  10. ORDERS
  =============================== */

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),

  orderNumber: text("order_number").notNull().unique(),

  retailerId: uuid("retailer_id").references(() => retailers.id),
  distributorId: uuid("distributor_id").references(() => distributors.id),

  // pending | modified | processing | dispatched | out_for_delivery
  // | delivered | cancelled
  status: text("status")
    .notNull()
    .default("pending"),

  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  expectedDelivery: timestamp("expected_delivery"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  // optional timestamps for analytics / audit
  acceptedAt: timestamp("accepted_at"),
  dispatchedAt: timestamp("dispatched_at"), // left the distributor's warehouse
  deliveredAt: timestamp("delivered_at"),
  completedAt: timestamp("completed_at"),
});

/* ===============================
  11. ORDER ITEMS
  =============================== */

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),

  orderId: uuid("order_id").references(() => orders.id, {
    onDelete: "cascade",
  }),

  variantId: uuid("variant_id").references(() => productVariants.id),

  productName: text("product_name"),
  variantName: text("variant_name"),
  sku: text("sku"),

  quantity: integer("quantity").notNull(),
  unit: text("unit"),

  variantSellingPrice: numeric("variant_selling_price", {
    precision: 10,
    scale: 2,
  }),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  12. NOTIFICATIONS
  =============================== */

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

  title: text("title"),
  message: text("message"),
  type: text("type"),

  // optional: who triggered this & what entity
  entityId: uuid("entity_id"),
  actorId: uuid("actor_id"),

  read: boolean("read").default(false),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  15. LEDGER
  =============================== */

export const ledger = pgTable("ledger", {
  id: uuid("id").defaultRandom().primaryKey(),

  retailerId: uuid("retailer_id").references(() => retailers.id),
  distributorId: uuid("distributor_id").references(() => distributors.id),

  type: text("type").notNull(), // debit | credit
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull(),

  orderId: uuid("order_id"),
  billId: uuid("productBillId"),

  // Generic reference type/id for any entity (invoice, payment, adjustment,
  // sale). Deliberately text, not uuid: a sale is identified by a
  // client-generated ULID so it can exist before the server ever hears about
  // it (docs/16-offline-first.md). A polymorphic reference column cannot be
  // narrower than the widest id it has to hold.
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  16. OUTBOX
  =============================== */

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    published: boolean("published").default(false),
    error: text("error"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_outbox_published").on(table.published)]
);

/* ===============================
  17. OTP CODES
  =============================== */

export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").defaultRandom().primaryKey(),

  email: text("email").notNull(),
  otp: text("otp").notNull(),

  expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

/* ===============================
  18. PRODUCT BILLS (per variant)
  =============================== */

export const productBills = pgTable(
  "product_bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => distributors.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),

    // --- Two-stage balance (docs/02-product-billing.md) ---
    // Delivery records stock RECEIVED but not yet payable (consignment the
    // distributor is financing). A sale to a customer is what converts it into
    // money DUE. outstandingBalance = totalAmountDue - totalAmountPaid.
    outstandingBalance: numeric("outstanding_balance", {
      precision: 14,
      scale: 2,
    }).default("0"),
    totalAmountPaid: numeric("total_amount_paid", {
      precision: 14,
      scale: 2,
    }).default("0"),
    totalAmountDue: numeric("total_amount_due", {
      precision: 14,
      scale: 2,
    }).default("0"),
    totalQuantityDelivered: integer("total_quantity_delivered").default(0),

    // Received but not yet sold - the consignment position.
    qtyReceivedUnsold: integer("qty_received_unsold").notNull().default(0),
    amountReceivedNotDue: numeric("amount_received_not_due", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    // Sold through, and therefore accrued into totalAmountDue.
    qtySold: integer("qty_sold").notNull().default(0),

    lastTransactionDate: timestamp("last_transaction_date"),
    meta: jsonb("meta"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_product_bills_retailer_variant").on(
      table.retailerId,
      table.variantId
    ),
    // Was missing entirely (P1-15): the find-or-create in
    // applyDeliveryEffects/createBill can race two concurrent deliveries for
    // the same (retailer, distributor, variant) into two bill rows that
    // silently split one balance in two. This makes that impossible at the
    // database level instead of relying on application-level timing.
    unique("uq_product_bill").on(
      table.retailerId,
      table.distributorId,
      table.variantId
    ),
  ]
);

/* ===============================
  19. PRODUCT BILL TRANSACTIONS
  =============================== */

export const productBillTransactions = pgTable("product_bill_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  productBillId: uuid("product_bill_id")
    .notNull()
    .references(() => productBills.id, { onDelete: "cascade" }),

  date: timestamp("date").defaultNow(),
  quantity: integer("quantity").default(0),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).default("0"),
  // receipt  - goods delivered, added to consignment (not yet payable)
  // accrual  - sold through, moved from consignment into money due
  // payment  - retailer paid the distributor
  // return | adjustment
  // ("delivery" is the pre-two-stage name for receipt; kept for old rows.)
  type: text("type").notNull(),
  metadata: jsonb("metadata"),
});

/* ===============================
  20. PRODUCT DELIVERY LOG
  =============================== */

export const productDeliveryLog = pgTable(
  "product_delivery_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id").notNull(),
    productBillId: uuid("product_bill_id")
      .notNull()
      .references(() => productBills.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull(),
    quantityDelivered: integer("quantity_delivered").notNull().default(0),
    unitCost: numeric("unit_cost", {
      precision: 12,
      scale: 2,
    }).default("0"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("uq_product_delivery_order_bill").on(
      table.orderId,
      table.productBillId
    ),
  ]
);

/* ===============================
  21. INVOICES
  =============================== */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    retailerId: uuid("retailer_id").notNull(),
    distributorId: uuid("distributor_id").notNull(),

    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),

    currency: text("currency").default("INR"),
    gstNumber: text("gst_number"),
    placeOfSupply: text("place_of_supply"),
    invoiceNumber: text("invoice_number"),

    totalTaxableValue: numeric("total_taxable_value", {
      precision: 14,
      scale: 2,
    }),
    totalGst: numeric("total_gst", { precision: 14, scale: 2 }),
    cgst: numeric("cgst", { precision: 14, scale: 2 }),
    sgst: numeric("sgst", { precision: 14, scale: 2 }),
    igst: numeric("igst", { precision: 14, scale: 2 }),

    totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),

    status: text("status").notNull().default("draft"), // draft | issued | paid | partial

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),

    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_invoices_retailer_distributor").on(
      table.retailerId,
      table.distributorId
    ),
    unique("uq_invoice_period").on(
      table.retailerId,
      table.distributorId,
      table.periodStart,
      table.periodEnd
    ),
  ]
);

/* ===============================
  22. INVOICE ITEMS
  =============================== */

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    productBillId: uuid("product_bill_id").notNull(),
    variantId: uuid("variant_id").notNull(),

    quantity: integer("quantity").notNull().default(0),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),

    // GST / HSN fields (per line item)
    hsnCode: text("hsn_code"),
    taxableValue: numeric("taxable_value", {
      precision: 14,
      scale: 2,
    }),
    cgst: numeric("cgst", { precision: 14, scale: 2 }),
    sgst: numeric("sgst", { precision: 14, scale: 2 }),
    igst: numeric("igst", { precision: 14, scale: 2 }),

    amount: numeric("amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),

    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_invoice_items_invoice_id").on(table.invoiceId)]
);

/* ===============================
  23. INVENTORY SNAPSHOTS (for aging/analytics)
  =============================== */

export const inventorySnapshots = pgTable("inventory_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  retailerId: uuid("retailer_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  stock: integer("stock").notNull().default(0),
  snapDate: timestamp("snap_date").notNull(),
});




// =========================================
// EVENT DEDUPLICATION TABLE
// =========================================
export const eventDedupe = pgTable("event_dedupe", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at").defaultNow()
});



// =========================================
// NOTIFICATIONS LOG
// =========================================
export const notificationsLog = pgTable("notifications_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  title: text("title"),
  body: text("body"),
  eventType: text("event_type"),
  createdAt: timestamp("created_at").defaultNow()
});



// =========================================
// RETAILER INVENTORY TABLE
// =========================================
export const retailerInventory = pgTable("retailer_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  retailerId: uuid("retailer_id").references(() => retailers.id),
  variantId: uuid("variant_id").references(() => productVariants.id),
  quantity: integer("quantity").default(0),
  updatedAt: timestamp("updated_at").defaultNow()
});



// =========================================
// ORDER DELIVERY CODES
// (docs/15-delivery-confirmation.md)
//
// One code per order, generated at order creation, held by the retailer.
// Stored encrypted (not hashed) - see src/utils/deliveryCode.js for why.
// =========================================
export const orderDeliveryCodes = pgTable("order_delivery_codes", {
  orderId: uuid("order_id")
    .primaryKey()
    .references(() => orders.id, { onDelete: "cascade" }),

  codeEnc: text("code_enc").notNull(),   // base64 ciphertext
  codeIv: text("code_iv").notNull(),     // base64 IV
  codeTag: text("code_tag").notNull(),   // base64 GCM auth tag

  attempts: integer("attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  consumedAt: timestamp("consumed_at"),

  createdAt: timestamp("created_at").defaultNow(),
});


/* ===============================
  PRODUCT BILL LAYERS (FIFO cost layers)
  docs/02-product-billing.md, docs/12-target-model.md

  One layer per delivery. Sales consume layers oldest-first, so the amount that
  becomes due reflects what the retailer actually paid for the units they sold -
  which a single overwritten "current unit cost" could never express.
  =============================== */

export const productBillLayers = pgTable(
  "product_bill_layers",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    productBillId: uuid("product_bill_id")
      .notNull()
      .references(() => productBills.id, { onDelete: "cascade" }),

    orderId: uuid("order_id"),

    qtyReceived: integer("qty_received").notNull(),
    qtyConsumed: integer("qty_consumed").notNull().default(0),

    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),

    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_pbl_fifo").on(table.productBillId, table.receivedAt),
    check("ck_layer_consumed", sql`${table.qtyConsumed} <= ${table.qtyReceived}`),
  ]
);

/* ===============================
  CUSTOMERS (the retailer's own customers)
  Walk-in sales need no customer row; a name/phone can optionally be attached.
  No credit/khata - deliberately out of scope.
  =============================== */

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),

    name: text("name"),
    phone: text("phone"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [unique("uq_customer_phone").on(table.retailerId, table.phone)]
);

/* ===============================
  RETAIL PRICES
  What the retailer sells a variant for. Distinct from product_variants.mrp
  (the printed price) and from distributor_inventory.selling_price (what the
  retailer pays). Without this there is no margin.
  =============================== */

export const retailPrices = pgTable(
  "retail_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),

    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),

    price: numeric("price", { precision: 10, scale: 2 }).notNull(),

    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [unique("uq_retail_price").on(table.retailerId, table.variantId)]
);

/* ===============================
  SALES (the shop's outbound bill)
  =============================== */

export const sales = pgTable(
  "sales",
  {
    // A ULID generated ON THE DEVICE, never by the server. A sale that cannot
    // exist until the server answers is a sale that cannot be rung up with no
    // network - which is the whole point (docs/16-offline-first.md).
    // ULID over uuidv4 because it sorts by creation time: sync ordering and
    // index locality come free.
    // 26 holds a ULID; 36 so a pre-0008 uuid row survives the conversion
    id: varchar("id", { length: 36 }).primaryKey(),

    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),

    customerId: uuid("customer_id").references(() => customers.id), // null = walk-in

    // "<DEVICECODE>-<counter>", e.g. "K7Q3M9-00042". Allocated on the device
    // with no coordination; see docs/16-offline-first.md ("Bill numbers").
    billNumber: text("bill_number").notNull(),

    // Which device rang this up. Null for sales made through POST /sales.
    deviceId: varchar("device_id", { length: 26 }),

    // soldAt is the DEVICE clock at the counter - the moment the customer
    // paid. syncedAt is when the server first heard about it. They can be
    // hours apart, and both matter: soldAt is the business fact, syncedAt is
    // the operational one.
    soldAt: timestamp("sold_at").notNull().defaultNow(),
    syncedAt: timestamp("synced_at"),

    // Set by a sale.void op. Sales are immutable once written; a correction is
    // a void plus a re-bill, never an edit (docs/16-offline-first.md).
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),

    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 12, scale: 2 }).notNull().default("0"),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),

    status: text("status").notNull().default("completed"), // completed | voided

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("uq_sale_bill").on(table.retailerId, table.billNumber),
    index("idx_sales_retailer_date").on(table.retailerId, table.soldAt),
  ]
);

export const saleItems = pgTable("sale_items", {
  // Client-generated too: the line exists on the device before it exists here.
  id: varchar("id", { length: 36 }).primaryKey(),

  saleId: varchar("sale_id", { length: 36 })
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),

  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id),

  quantity: integer("quantity").notNull(),

  // what the customer paid
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  // weighted cost of the FIFO layers this line consumed - stamped at sale time
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),

  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
});

/* Split payment ("200 cash, 300 UPI") is the normal case at a counter,
   not an edge case - hence a table rather than a column. */
export const salePayments = pgTable("sale_payments", {
  id: varchar("id", { length: 36 }).primaryKey(),

  saleId: varchar("sale_id", { length: 36 })
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),

  method: text("method").notNull(), // cash | upi | card
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
});

/* ===============================
  DELIVERY AGENTS (third actor - platform-level pool)
  users.role gains "delivery_agent". Any distributor may assign an available
  agent. Vetting/ratings/disputes are deliberately out of scope.
  =============================== */

export const deliveryAgents = pgTable("delivery_agents", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  phone: text("phone").notNull(),
  vehicleNumber: text("vehicle_number"),
  operatingPincode: text("operating_pincode"),

  isAvailable: boolean("is_available").notNull().default(true),
  active: boolean("active").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
  DELIVERIES
  Created when the distributor dispatches. The agent confirms with the code the
  RETAILER received at order creation - neither party can complete it alone.
  =============================== */

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),

    agentId: uuid("agent_id").references(() => deliveryAgents.id),

    // pending_assignment | assigned | picked_up | delivered | failed
    status: text("status").notNull().default("pending_assignment"),

    assignedAt: timestamp("assigned_at"),
    pickedUpAt: timestamp("picked_up_at"),
    deliveredAt: timestamp("delivered_at"),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_deliveries_order").on(table.orderId),
    index("idx_deliveries_agent").on(table.agentId, table.status),
  ]
);

/* ===============================
  SYNC DEVICES
  docs/16-offline-first.md

  One row per till/phone that rings up sales. The device invents its own id
  (a ULID) and its own bill-number prefix; this table is a registry the server
  keeps for observability and for the ONE thing that genuinely needs the
  server's view of the world - detecting a bill-number prefix collision
  between two devices belonging to the same shop.
  =============================== */

export const syncDevices = pgTable(
  "sync_devices",
  {
    id: varchar("id", { length: 26 }).primaryKey(), // device ULID, minted on the device

    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),

    // The bill-number prefix this device allocates under. Unique per retailer:
    // if two devices ever mint the same six characters, the second one to sync
    // is told and rotates, rather than both silently issuing the same bills.
    deviceCode: text("device_code").notNull(),

    label: text("label"), // "Front counter", "Rakesh's phone"

    lastCursor: timestamp("last_cursor"),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [unique("uq_sync_device_code").on(table.retailerId, table.deviceCode)]
);

/* ===============================
  SYNC OPS  -  the exactly-once ledger
  docs/16-offline-first.md

  Every operation a device has ever submitted, keyed by (device_id, op_id).
  The UNIQUE INDEX below is the entire idempotency mechanism: a replayed batch
  loses the race to insert, and is therefore ACKNOWLEDGED rather than
  reapplied. It is deliberately a database constraint and not an in-memory
  cache - a cache does not survive a restart, a second process, or a deploy,
  and "the shop's sales got counted twice because we redeployed" is not a
  recoverable class of bug.

  Same discipline as uq_product_delivery_order_bill (docs/02-product-billing.md).
  =============================== */

export const syncOps = pgTable(
  "sync_ops",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    deviceId: varchar("device_id", { length: 26 }).notNull(),
    opId: varchar("op_id", { length: 26 }).notNull(),

    retailerId: uuid("retailer_id").references(() => retailers.id, {
      onDelete: "cascade",
    }),

    type: text("type").notNull(), // sale.create | sale.void | price.set

    // The device's clock when the op was created, and ours when we applied it.
    opAt: timestamp("op_at"),
    appliedAt: timestamp("applied_at").defaultNow(),

    // What the first application returned. Replays are answered from here, so
    // a device that never saw the original response still learns the outcome
    // (notably the bill number, which the server may have had to disambiguate).
    result: jsonb("result"),
  },
  (table) => [
    unique("uq_sync_op").on(table.deviceId, table.opId),
    index("idx_sync_ops_retailer").on(table.retailerId, table.appliedAt),
  ]
);
