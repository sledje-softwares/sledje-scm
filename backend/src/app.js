import express from "express";
import cors from "cors";
import { errorHandler, notFoundHandler } from "./api-gateway/middlewares/error.middleware.js";

// Core modules
import authRoutes from "./api-gateway/routes/auth.routes.js";
import retailerRoutes from "./api-gateway/routes/retailers.routes.js";
import distributorRoutes from "./api-gateway/routes/distributors.routes.js";

// Domain modules
import productsRoutes from "./api-gateway/routes/products.routes.js";
import inventoryRoutes from "./api-gateway/routes/inventory.routes.js";
import ordersRoutes from "./api-gateway/routes/orders.routes.js";
import connectionsRoutes from "./api-gateway/routes/connections.routes.js";
import notificationsRoutes from "./api-gateway/routes/notifications.routes.js";

// Financial modules
import productBillsRoutes from "./api-gateway/routes/product-bills.routes.js";
import invoicesRoutes from "./api-gateway/routes/invoices.routes.js";
import ledgerRoutes from "./api-gateway/routes/ledger.routes.js";
import distributorshipRoutes from "./api-gateway/routes/distributorships.routes.js";
import distributorInventoryRoutes from "./api-gateway/routes/distributor-inventory.routes.js";
import cartRoutes from "./api-gateway/routes/cart.routes.js";
import uploadRoutes from "./api-gateway/routes/upload.routes.js";
import deliveriesRoutes from "./api-gateway/routes/deliveries.routes.js";
import salesRoutes from "./api-gateway/routes/sales.routes.js";
import syncRoutes from "./api-gateway/routes/sync.routes.js";


const app = express();

// CLIENT_ORIGIN may be a single origin or a comma-separated list. Left unset,
// this falls back to reflecting the request origin (cors()'s own default) -
// the same effective behaviour as before, but now opt-in and logged, rather
// than a silent unrestricted default (docs/10-known-issues.md P1-4).
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    "⚠️  CLIENT_ORIGIN is not set - CORS is reflecting all origins. Set CLIENT_ORIGIN in .env for production."
  );
}

app.use(
  cors(
    allowedOrigins.length
      ? {
          origin: (origin, cb) => {
            // origin is undefined for same-origin/non-browser requests (curl, mobile apps)
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            // A disallowed origin is a rejected request, not a server fault -
            // without an explicit status the error middleware classifies this
            // as a 500 "Internal server error", which looks like the backend
            // crashed when really CLIENT_ORIGIN just needs the caller's origin.
            const err = new Error(
              `Origin ${origin} is not allowed by CORS (set CLIENT_ORIGIN)`
            );
            err.status = 403;
            cb(err);
          },
        }
      : undefined
  )
);
app.use(express.json());

// Auth
app.use("/auth", authRoutes);

// Retailer/Distributor
app.use("/retailers", retailerRoutes);
app.use("/distributors", distributorRoutes);

// Products + Inventory
app.use("/products", productsRoutes);
app.use("/inventory", inventoryRoutes);

app.use("/api/distributor-inventory", distributorInventoryRoutes);

// Cart
app.use("/cart", cartRoutes);

// Orders
app.use("/orders", ordersRoutes);

// Connections / Notifications
app.use("/connections", connectionsRoutes);
app.use("/notifications", notificationsRoutes);
// Billing / Invoices / Ledger
app.use("/product-bills", productBillsRoutes);
app.use("/invoices", invoicesRoutes);
app.use("/ledger", ledgerRoutes);

app.use("/api/distributorships", distributorshipRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/deliveries", deliveriesRoutes);
app.use("/sales", salesRoutes);

// The offline POS pushes batches of operations here (docs/16-offline-first.md).
app.use("/sync", syncRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
