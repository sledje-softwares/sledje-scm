import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { errorHandler, notFoundHandler } from "./api-gateway/middlewares/error.middleware.js";
import { corsOriginHandler } from "./config/cors.js";

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

// Render puts every request behind a reverse proxy. Without this,
// express-rate-limit (below) sees the proxy's own IP on every request rather
// than the caller's - turning a per-caller limit into a global kill-switch
// the first time legitimate traffic trips it. Must be set before any rate
// limiter middleware is registered (P5-6).
app.set("trust proxy", 1);

app.use(helmet());

// CLIENT_ORIGIN parsing/matching lives in ./config/cors.js, shared with
// Socket.IO's CORS policy (realtime/socket.server.js) so the two can never
// diverge the way they used to (docs/10-known-issues.md P1-4; P5-12).
app.use(cors({ origin: corsOriginHandler }));
// Loose global limiter (P5-6): everything that isn't one of the sensitive
// auth-ish endpoints below still gets a ceiling, just a generous one.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use(globalLimiter);

// Strict limiter for brute-forceable / spammable endpoints: OTP request and
// verification, password reset, every login, every register, and the
// self-service delivery-agent account routes (P5-5, P5-6). Keyed by IP AND
// the submitted email when present, so one attacker can't reset the counter
// by rotating email addresses from the same IP, and one shared office IP
// doesn't lock out every tenant behind it over a single bad actor's email.
const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      req.body && typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const ipKey = ipKeyGenerator(req.ip || "");
    return email ? `${ipKey}:${email}` : ipKey;
  },
  message: { error: "Too many requests. Please try again later." },
});

// /sync accepts batched offline-POS operations after arbitrarily long
// offline periods (docs/16-offline-first.md) and needs a much larger body
// limit than the rest of the API. Mounted here, before the default
// express.json() below is registered, so its own parser (sync.routes.js)
// is the one that ever sees a /sync request body - the default limit never
// gets a chance to 413 it.
app.use("/sync", syncRoutes);

// Default body-size limit for everything else (P5-6). 200kb comfortably
// covers the normal JSON payloads this API sends/receives; /sync is the
// deliberate, already-handled exception above.
app.use(express.json({ limit: "200kb" }));

// Auth
app.use("/auth/forgot-password", strictAuthLimiter);
app.use("/auth/verify-otp", strictAuthLimiter);
app.use("/auth/reset-password", strictAuthLimiter);
app.use("/auth/distributors/register", strictAuthLimiter);
app.use("/auth/distributors/login", strictAuthLimiter);
app.use("/auth", authRoutes);

// Retailer/Distributor
// Retailer register/login live only in retailers.routes.js (NOT re-exported
// under /auth), so the limiter has to be attached here to actually cover them.
app.use("/retailers/register", strictAuthLimiter);
app.use("/retailers/login", strictAuthLimiter);
app.use("/retailers", retailerRoutes);

// Distributor register/login are mounted twice - once here, once again
// under /auth/distributors/* above (both dispatch to the same controller
// functions). Both mount points need the limiter or half the front door
// stays hardened.
app.use("/distributors/register", strictAuthLimiter);
app.use("/distributors/login", strictAuthLimiter);
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

// The public, self-service delivery-agent account routes - same brute-force/
// spam shape as the login/register routes above.
app.use("/deliveries/agents/register", strictAuthLimiter);
app.use("/deliveries/agents/login", strictAuthLimiter);
app.use("/deliveries", deliveriesRoutes);
app.use("/sales", salesRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
