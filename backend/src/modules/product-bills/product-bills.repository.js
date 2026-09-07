// src/modules/product-bills/product-bills.repository.js
import { db } from "../../config/postgres.js";
import {
  productBills,
  productBillLayers,
  productBillTransactions,
  productDeliveryLog,
  outbox,
} from "../../db/schema.js";
import { and, eq, sql } from "drizzle-orm";

const ProductBillsRepo = {
  async findBillByVariant(retailerId, distributorId, variantId) {
    const [row] = await db
      .select()
      .from(productBills)
      .where(
        and(
          eq(productBills.retailerId, retailerId),
          eq(productBills.distributorId, distributorId),
          eq(productBills.variantId, variantId)
        )
      );

    return row || null;
  },

  async createBill({ retailerId, distributorId, variantId }) {
    // uq_product_bill (retailer_id, distributor_id, variant_id) means a
    // concurrent delivery for the same triple can race this insert - handled
    // by doing nothing on conflict and re-fetching, rather than crashing the
    // whole delivery transaction on a duplicate key error.
    await db
      .insert(productBills)
      .values({
        retailerId,
        distributorId,
        variantId,
        outstandingBalance: "0",
        totalAmountPaid: "0",
        totalAmountDue: "0",
        totalQuantityDelivered: 0,
        qtyReceivedUnsold: 0,
        amountReceivedNotDue: "0",
        qtySold: 0,
      })
      .onConflictDoNothing({
        target: [productBills.retailerId, productBills.distributorId, productBills.variantId],
      });

    return this.findBillByVariant(retailerId, distributorId, variantId);
  },

  /**
   * STAGE ONE of two-stage billing: goods received, NOT yet payable.
   *
   * Delivery adds to the consignment position (qty_received_unsold /
   * amount_received_not_due) and opens a FIFO cost layer. It deliberately does
   * NOT touch total_amount_due or outstanding_balance - the retailer does not
   * owe for stock sitting on their shelf. A sale is what makes it due
   * (see recordSaleAccrual). docs/02-product-billing.md.
   */
  async recordReceipt(tx, { productBillId, orderId, variantId, qty, unitCost }) {
    const amount = Number(qty) * Number(unitCost || 0);

    // Parameterised - qty/unitCost originate from request bodies upstream.
    await tx.execute(sql`
      UPDATE product_bills SET
        total_quantity_delivered  = total_quantity_delivered + ${qty},
        qty_received_unsold       = qty_received_unsold + ${qty},
        amount_received_not_due   = (amount_received_not_due::numeric + ${amount})::numeric,
        last_transaction_date     = now(),
        updated_at                = now()
      WHERE id = ${productBillId}
    `);

    // One FIFO cost layer per delivery. Sales consume these oldest-first, so
    // "what do I owe for what I sold" stays answerable even when the unit cost
    // changes between deliveries.
    await tx.insert(productBillLayers).values({
      productBillId,
      orderId,
      qtyReceived: qty,
      qtyConsumed: 0,
      unitCost,
    });

    await tx.insert(productBillTransactions).values({
      productBillId,
      date: new Date(),
      quantity: qty,
      unitPrice: unitCost,
      amount,
      type: "receipt",
      metadata: { orderId },
    });

    // Delivery log (reconciliation; uq_product_delivery_order_bill makes this
    // the idempotency guard for the whole delivery path).
    await tx.insert(productDeliveryLog).values({
      orderId,
      productBillId,
      variantId,
      quantityDelivered: qty,
      unitCost,
    });
  },

  /**
   * STAGE TWO: the retailer sold some of it, so it becomes payable.
   *
   * Moves `amount` out of the consignment position and into money due.
   * Called once per consumed FIFO layer by the sales service.
   */
  async recordSaleAccrual(tx, { productBillId, qty, amount, unitCost, saleId }) {
    await tx.execute(sql`
      UPDATE product_bills SET
        qty_sold                = qty_sold + ${qty},
        qty_received_unsold     = GREATEST(qty_received_unsold - ${qty}, 0),
        amount_received_not_due = GREATEST((amount_received_not_due::numeric - ${amount})::numeric, 0),
        total_amount_due        = (total_amount_due::numeric + ${amount})::numeric,
        outstanding_balance     = (outstanding_balance::numeric + ${amount})::numeric,
        last_transaction_date   = now(),
        updated_at              = now()
      WHERE id = ${productBillId}
    `);

    await tx.insert(productBillTransactions).values({
      productBillId,
      date: new Date(),
      quantity: qty,
      unitPrice: unitCost,
      amount,
      type: "accrual",
      metadata: { saleId },
    });
  },

  /**
   * Open FIFO layers for one retailer+variant, oldest first.
   *
   * Deliberately spans every distributor: a shelf holds stock from whoever
   * supplied it, and the oldest units are the ones physically sold first.
   */
  async findOpenLayers(tx, retailerId, variantId) {
    return tx
      .select({
        layerId: productBillLayers.id,
        productBillId: productBillLayers.productBillId,
        qtyReceived: productBillLayers.qtyReceived,
        qtyConsumed: productBillLayers.qtyConsumed,
        unitCost: productBillLayers.unitCost,
        receivedAt: productBillLayers.receivedAt,
      })
      .from(productBillLayers)
      .innerJoin(productBills, eq(productBillLayers.productBillId, productBills.id))
      .where(
        and(
          eq(productBills.retailerId, retailerId),
          eq(productBills.variantId, variantId),
          sql`${productBillLayers.qtyConsumed} < ${productBillLayers.qtyReceived}`
        )
      )
      .orderBy(productBillLayers.receivedAt);
  },

  async consumeLayer(tx, layerId, qty) {
    await tx.execute(sql`
      UPDATE product_bill_layers
      SET qty_consumed = qty_consumed + ${qty}
      WHERE id = ${layerId}
    `);
  },

  /**
   * Payment against bill
   */
  async createPaymentTxAndUpdateBill(tx, { productBillId, amount, metadata }) {
    await tx.insert(productBillTransactions).values({
      productBillId,
      date: new Date(),
      quantity: 0,
      unitPrice: 0,
      amount,
      type: "payment",
      metadata,
    });

    await tx.execute(sql`
      UPDATE product_bills SET
        total_amount_paid = (total_amount_paid::numeric + ${amount})::numeric,
        outstanding_balance = (outstanding_balance::numeric - ${amount})::numeric,
        updated_at = now()
      WHERE id = ${productBillId}
    `);
  },

  async getBillsForRetailer(retailerId, { variantId, distributorId, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    let conditions = [eq(productBills.retailerId, retailerId)];
    if (variantId) conditions.push(eq(productBills.variantId, variantId));
    if (distributorId) conditions.push(eq(productBills.distributorId, distributorId));

    const rows = await db
      .select()
      .from(productBills)
      .where(and(...conditions))
      .orderBy(productBills.updatedAt)
      .limit(limit)
      .offset(offset);

    return rows;
  },

  async getBillsForDistributor(distributorId, { retailerId, variantId, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    let conditions = [eq(productBills.distributorId, distributorId)];
    if (retailerId) conditions.push(eq(productBills.retailerId, retailerId));
    if (variantId) conditions.push(eq(productBills.variantId, variantId));

    const rows = await db
      .select()
      .from(productBills)
      .where(and(...conditions))
      .orderBy(productBills.updatedAt)
      .limit(limit)
      .offset(offset);

    return rows;
  },

  async getBillById(billId) {
    const [row] = await db
      .select()
      .from(productBills)
      .where(eq(productBills.id, billId));

    return row || null;
  },

  async listTransactionsForBill(productBillId) {
    const rows = await db
      .select()
      .from(productBillTransactions)
      .where(eq(productBillTransactions.productBillId, productBillId))
      .orderBy(productBillTransactions.date);

    return rows;
  },

  async insertOutbox(tx, eventType, payload) {
    await tx.insert(outbox).values({
      eventType,
      payload,
    });
  },
};

export default ProductBillsRepo;
