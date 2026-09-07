# API Reference

Base URL in development: `http://localhost:5000` (no global prefix — see the warning below).

## Authentication

All protected routes require:

```
Authorization: Bearer <jwt>
```

The JWT is issued by login/register and contains `{ id, role }` where **`id` is `users.id`**,
not the retailer or distributor profile id. Middleware is `requireAuth`
(`backend/src/api-gateway/middlewares/auth.middleware.js`).

There is no error middleware, so **authorisation failures return HTTP 500 with an HTML body**,
not 403. A 500 from any endpoint below may mean "forbidden", "not found", or "crashed" — the
status code does not distinguish them.

## Mount table

`backend/src/app.js:32-59`.

| Base path | Route file |
|---|---|
| `/auth` | `auth.routes.js` |
| `/retailers` | `retailers.routes.js` |
| `/distributors` | `distributors.routes.js` |
| `/products` | `products.routes.js` |
| `/inventory` | `inventory.routes.js` |
| `/api/distributor-inventory` | `distributor-inventory.routes.js` |
| `/cart` | `cart.routes.js` |
| `/orders` | `orders.routes.js` |
| `/connections` | `connections.routes.js` |
| `/notifications` | `notifications.routes.js` |
| `/product-bills` | `product-bills.routes.js` |
| `/invoices` | `invoices.routes.js` |
| `/ledger` | `ledger.routes.js` |
| `/api/distributorships` | `distributorships.routes.js` |
| `/api/upload` | `upload.routes.js` |

> ⚠️ **Prefixing is inconsistent.** Most routers mount at the root; three
> (`distributor-inventory`, `distributorships`, `upload`) sit under `/api`. Comments inside the
> route files (`// GET /api/ledger`, `// GET /api/invoices`) describe paths that do not exist.
> The frontend's axios `baseURL` ends in `/api`, which compounds this — see
> [08-frontend.md](08-frontend.md).

### Not mounted

| File | Contents | Status |
|---|---|---|
| `payments.routes.js` | `GET /`, `GET /:billId`, `POST /:billId/pay`, `GET /:billId/transactions` | Fully written, **unreachable** |
| `payments.webhook.js` | `POST /razorpay` with signature verification | Fully written, **unreachable** — the entire gateway payment path is dead |

---

## `/auth`

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/auth/distributors/register` | — | `registerDistributor` |
| POST | `/auth/distributors/login` | — | `loginDistributor` |
| POST | `/auth/forgot-password` | — | `forgotPassword` — body `{ email, role? }` |
| POST | `/auth/verify-otp` | — | `verifyOtp` — body `{ email, otp }` ❌ broken |
| POST | `/auth/reset-password` | — | `resetPassword` — body `{ email, otp, newPassword }` ❌ broken |

> `registerRetailer` and `loginRetailer` are **imported into this file but never routed**.
> Retailer auth exists only under `/retailers`.

## `/retailers`

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/retailers/register` | — | `registerRetailer` |
| POST | `/retailers/login` | — | `loginRetailer` |
| GET | `/retailers/profile` | ✔ | `getRetailerProfile` |
| PUT | `/retailers/profile` | ✔ | `updateRetailerProfile` |

## `/distributors`

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/distributors/register` | — | `registerDistributor` |
| POST | `/distributors/login` | — | `loginDistributor` |
| GET | `/distributors/profile` | ✔ | `getDistributorProfile` |
| PUT | `/distributors/profile` | ✔ | `updateDistributorProfile` |

`POST /batch` is commented out in the route file, but the frontend
(`retailerShelf.js`) still calls `/distributors/batch` — it 404s.

## `/products`

| Method | Path | Auth | Handler | Status |
|---|---|---|---|---|
| GET | `/products/get` | — | `getProducts` | ✅ |
| GET | `/products/connected-distributors` | ✔ | `getConnectedDistributorsProducts` | ❌ service method missing |
| GET | `/products/:productId` | — | `getSingleProduct` | ✅ |
| POST | `/products/add` | ✔ | `addProduct` | ❌ service method missing |
| PUT | `/products/:productId` | ✔ | `updateProduct` | ❌ service method missing |
| DELETE | `/products/:productId` | ✔ | `deleteProduct` | ❌ service method missing |
| POST | `/products/bulk-upload` | ✔ + `multer().single("file")` | `bulkImportProducts` | ❌ service method missing |

> **Five of seven product endpoints throw `TypeError`.** `products.controller.js` calls
> `createProduct`, `updateProduct`, `deleteProduct`, `bulkInsert` and
> `getProductsFromConnectedDistributors`; the service exports `createCatalogProduct`,
> `updateCatalogProduct`, `deleteCatalogProduct` and `bulkImportForDistributor`, and has no
> connected-distributors method at all.

## `/inventory` (retailer shelf)

| Method | Path | Auth | Handler | Status |
|---|---|---|---|---|
| GET | `/inventory/` | ✔ | `getInventory` | ⚠️ |
| POST | `/inventory/add` | ✔ | `addVariantToInventory` | ❌ writes non-existent columns |
| POST | `/inventory/checkout` | ✔ | `updateInventoryAfterOrder` | ❌ `const` reassignment |

## `/api/distributor-inventory`

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/distributor-inventory/mine` | ✔ | `getMyDistributorInventory` ✅ |
| POST | `/api/distributor-inventory/import` | ✔ | `importVariantToInventory` ✅ |

Both enforce `role === "distributor"`. This is the healthiest module in the codebase.

## `/cart`

| Method | Path | Auth | Handler | Status |
|---|---|---|---|---|
| GET | `/cart/` | ✔ | `getCart` | ✅ |
| POST | `/cart/add` | ✔ | `addToCart` | ✅ merges qty on duplicate variant |
| PUT | `/cart/update` | ✔ | `updateCartItem` | ✅ |
| DELETE | `/cart/:variantId` | ✔ | `removeCartItem` | ✅ |
| DELETE | `/cart/` | ✔ | `clearCart` | ✅ |
| POST | `/cart/checkout` | ✔ | `checkoutCart` | ❌ arguments swapped — and the frontend never calls it |

## `/orders`

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/orders/create` | ✔ | `createOrder` ❌ |
| GET | `/orders/retailer/orders` | ✔ | `getRetailerOrders` |
| GET | `/orders/retailer/orders/:orderId` | ✔ | `getRetailerOrder` |
| PUT | `/orders/retailer/orders/:orderId/modify` | ✔ | `modifyOrder` ❌ |
| PUT | `/orders/retailer/orders/:orderId/cancel` | ✔ | `cancelOrder` |
| PUT | `/orders/retailer/orders/:orderId/complete` | ✔ | `completeOrder` |
| PUT | `/orders/retailer/orders/:orderId/approve` | ✔ | `approveModifiedOrder` |
| GET | `/orders/distributor/orders` | ✔ | `getDistributorOrders` |
| GET | `/orders/distributor/orders/:orderId` | ✔ | `getDistributorOrder` |
| PUT | `/orders/distributor/orders/:orderId/process` | ✔ | `processDistributorOrder` — body `{ action: accept\|reject\|modify }` |
| PUT | `/orders/distributor/orders/:orderId/status` | ✔ | `updateOrderStatus` |

See [07-domain-flows.md](07-domain-flows.md) for the state machine.

## `/connections`

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/connections/request` | ✔ | `sendConnectionRequest` |
| GET | `/connections/retailer/requests` | ✔ | `getRetailerRequests` |
| GET | `/connections/retailer/distributors` | ✔ | `getConnectedDistributors` |
| GET | `/connections/distributor/requests` | ✔ | `getDistributorRequests` |
| GET | `/connections/distributor/retailers` | ✔ | `getConnectedRetailers` |
| PUT | `/connections/respond/:requestId` | ✔ | `respondToRequest` |
| DELETE | `/connections/remove/:distributorId` | ✔ | `removeConnection` |
| GET | `/connections/search/distributors` | ✔ | `searchDistributors` ❌ `ReferenceError` |
| GET | `/connections/suggestions` | ✔ | `suggestedDistributors` — matches on pincode |
| GET | `/connections/retailers/search` | ✔ | `searchRetailers` |
| GET | `/connections/suggest/retailers` | ✔ | `suggestedRetailers` |

## `/notifications`

| Method | Path | Auth | Handler | Status |
|---|---|---|---|---|
| GET | `/notifications/` | ✔ | `getNotifications` — `?page`, `?limit` | ⚠️ ordering arg ignored |
| GET | `/notifications/unread-count` | ✔ | `getUnreadCount` | ❌ |
| PUT | `/notifications/:id/read` | ✔ | `markAsRead` | ❌ |
| PUT | `/notifications/mark-all-read` | ✔ | `markAllRead` | ✅ |

> Nothing in the running system ever **writes** a notification row. The only code that does
> (`consumers1/notifications.consumer.js`) cannot load.

## `/product-bills`

`router.use(requireAuth)` — all routes protected.

| Method | Path | Handler |
|---|---|---|
| GET | `/product-bills/` | `listBills` — `?role=retailer\|distributor` |
| GET | `/product-bills/:billId` | `getBill` |
| GET | `/product-bills/:billId/transactions` | `getBillTransactions` |
| POST | `/product-bills/:billId/pay` | `payBill` — body `{ amount, paymentMethod, note }` ⚠️ no clamp |

## `/invoices`

| Method | Path | Auth | Handler | Status |
|---|---|---|---|---|
| GET | `/invoices/` | ✔ | `listInvoices` | ⚠️ always ascending |
| GET | `/invoices/:invoiceId` | ✔ | `getInvoice` | ✅ |
| POST | `/invoices/generate` | ✔ | **`InvoiceService.generateInvoice`** | ❌ |
| GET | `/invoices/:invoiceId/pdf` | ✔ | `getInvoicePDF` | ⚠️ arity mismatch |
| POST | `/invoices/:invoiceId/pay` | ✔ | `markInvoicePaid` | ✅ |

> `POST /generate` binds a **service method directly as an Express handler**
> (`invoices.routes.js:31`), so it receives `(req, res, next)` instead of
> `(user, { retailerId, start, end, periodType })`. The correct controller, `createInvoice`,
> exists in `invoices.controller.js` and is never wired.

## `/ledger`

| Method | Path | Auth | Handler | Status |
|---|---|---|---|---|
| GET | `/ledger/` | ✔ | `getLedger` | ✅ |
| GET | `/ledger/bill/:billId` | ✔ | `getLedgerForBill` | ❌ depends on a missing repo method |
| GET | `/ledger/variant/:variantId` | ✔ | `getLedgerForVariant` | ✅ |
| GET | `/ledger/invoice/:invoiceId` | ✔ | `getLedgerForInvoice` | ✅ |
| GET | `/ledger/statement/full` | ✔ | `getFullStatement` | ⚠️ returns 200 with **empty arrays** — filters on `user.entityId`, always undefined |

## `/api/distributorships`

| Method | Path | Auth | Handler | Status |
|---|---|---|---|---|
| GET | `/api/distributorships/` | **public** | `listDistributorships` — `?search` | ✅ |
| GET | `/api/distributorships/:id` | **public** | `getDistributorshipDetails` | ❌ throws when the distributorship has products |
| POST | `/api/distributorships/` | ✔ | `createDistributorship` — idempotent by name | ✅ |

> The two GET routes are unauthenticated. The full product catalogue is public.

## `/api/upload`

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/upload/profile-picture` | ✔ + `multer({dest:"uploads/"}).single("image")` | inline → `uploadFileToDrive` + `DistributorsRepo.updateProfile` |

Only the distributor branch persists the URL; the retailer branch is a `// TODO`, so a retailer
receives a URL that is never saved. Uploaded files are made **publicly readable** on Google
Drive (`role: reader, type: anyone`).
