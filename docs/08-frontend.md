# Frontend

## Toolchain

**Vite 6** + `@vitejs/plugin-react` (migrated from Create React App / `react-scripts` 5.0.1).
No TypeScript.

| Thing | Version / value |
|---|---|
| Build tool | `vite` ^6 (config: `frontend/vite.config.js`) |
| React Router | `react-router-dom` ^7.4.1 |
| Styling | Tailwind ^3.4.17 + `src/index.css` (via `postcss.config.js`) |
| HTTP | `axios` ^1.8.4 via `src/api.js` |
| Animation | `framer-motion`, `gsap` |
| Charts | `recharts` |
| Icons | `lucide-react` |
| Tests | `vitest` + jsdom |

Scripts: `dev` (= `start`), `build`, `preview`, `test` (`vitest run`), `test:watch`. **There is
still no `lint` and no `format` script.**

`index.html` lives at the frontend root (Vite convention), not in `public/`. `public/` is
served at `/`.

**Migration notes** (`vite.config.js` documents each):

- **45 `.js` files contain JSX.** esbuild rejects that by default; the config widens the
  loader (`esbuild.loader: 'jsx'` + `optimizeDeps.esbuildOptions.loader`). Files were **not**
  renamed to `.jsx`.
- **`build.outDir` is pinned to `build/`** (Vite defaults to `dist/`) because the deployment
  serves the committed `frontend/build` folder — see "The committed build" below.
- **`clj-fuzzy`** (transitive dep of `words-to-numbers`, used by `posVoice.js`) is a
  Closure-compiled blob that reads sloppy-mode top-level `this`; under Vite's strict ESM that
  is `undefined` and the file throws on load, taking the whole app down. A one-line patch in
  `vite.config.js` restores the global it expects, in both the dev pre-bundle and the build.

**Installed but never imported:** `@react-oauth/google`, `@shadcn/ui`,
`class-variance-authority`, `tailwind-merge`, `tailwind-variants`, `tw-animate-css`,
`bcryptjs` (in a browser bundle), `@radix-ui/react-icons`.

## API layer

`frontend/src/api.js` — the entire HTTP layer, 18 lines:

```js
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://sledjeweb-2.onrender.com",
});
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});
```

Three problems worth knowing before you touch anything:

1. **The base URL falls back to production.** `frontend/.env` sets
   `VITE_API_URL=http://localhost:5000` for local dev (read as `import.meta.env.VITE_API_URL`;
   the CRA-era `REACT_APP_API_URL` was renamed in the Vite migration). With no `.env` it
   silently targets the deployed Render host.
2. **The base URL ends in `/api`, but the backend mounts most routers at the root.** So
   `API.get("/products/get")` resolves to `.../api/products/get`, which does not exist on the
   backend. One of the two layers is wrong; see [05-api-reference.md](05-api-reference.md).
   Worse, `distributorProducts.js` calls `API.get("/api/distributor-inventory/mine")`,
   producing `.../api/api/distributor-inventory/mine`.
3. **There is no response interceptor** — no 401 handling, no auto-logout, no token refresh. A
   401 surfaces as an unhandled rejection or a silently empty screen.

## Authentication

`frontend/src/components/AuthContext.js` — `AuthProvider` + `useAuth()`, holding
`{ isAuthenticated, user, login, logout }`. Everything lives in **`localStorage`** (not
httpOnly cookies):

| Key | Written by | Contents |
|---|---|---|
| `token` | `AuthContext.login`, and `Signup.js:70` directly | Raw JWT, read by the axios interceptor |
| `user` | `AuthContext.login` | `JSON.stringify` of the whole login response |
| `isAuthenticated` | `AuthContext.login` | Literal string `"true"` |
| `imageCache` | `retailerShelf.js:93` | Unrelated product-image cache — **not cleared on logout** |
| `userInfo` | only ever *removed*, never written | Vestigial, from an older implementation |

### Route protection

`frontend/src/components/PrivateRoute.js` (33 lines) reads `isAuthenticated` from `useAuth()`.
If false it **does not redirect** — it renders a full-screen blurred overlay containing
`<Login/>` and never renders `children`.

Three consequences:

- **No role check.** A logged-in retailer can navigate to `/distributor/*` and see the whole
  distributor UI; the guard only checks a boolean. The backend enforces roles per-endpoint, so
  data does not leak, but the UI does.
- **Flash of login on every hard refresh.** `AuthContext` initialises `isAuthenticated` to
  `false` and only reads `localStorage` inside a `useEffect`, so the first paint of any
  protected route shows the login modal.
- **No return-to-URL.** The URL never changes on auth failure, so deep links appear to work but
  there is no post-login redirect back.

### Login and signup — two separate implementations

`components/Login.js` (778 lines, four components in one file) handles account-type selection,
login, registration **and** the forgot/verify/reset flow. `handleGoogleSignIn` is a stub that
shows "coming soon" despite `@react-oauth/google` being installed. The account-type picker
offers `partners`, which has no backend endpoint.

`components/Signup.js` (318 lines) is a **second, retailer-only** registration UI at `/signup`
that duplicates the register form inside `Login.js`. Two defects:

- It writes `localStorage.setItem("token", ...)` **directly, bypassing `AuthContext`**, so
  `isAuthenticated` is never set and the user remains logged out as far as `PrivateRoute` is
  concerned.
- Its `verifyOtp()` is an explicit **mock** — it logs, advances the step, and navigates to
  `/login` without calling any endpoint.

## Routes

30 routes. All public pages are wrapped in `<NavbarWrap>` (`components/Structure.js`); the two
dashboards are wrapped in `<PrivateRoute>`.

| Path | Component | Protected |
|---|---|---|
| `/` | `pages/Landing/Home.js` | — |
| `/retailer` → `shop` | `retailerLayout.js` (index redirect) | ✔ |
| `/retailer/shop` | `retailerShop.js` | ✔ |
| `/retailer/shelf` | `retailerShelf.js` | ✔ |
| `/retailer/cart` | `retailerCart.js` | ✔ |
| `/retailer/orders` | `retailerOrders.js` | ✔ |
| `/retailer/payment` | `retailerPayment.js` | ✔ |
| `/retailer/you` | `retailerYou.js` | ✔ |
| `/distributor` → `orders` | `distributorLayout.js` (index redirect) | ✔ |
| `/distributor/products` | `distributorProducts.js` | ✔ |
| `/distributor/orders` | `distributorOrders.js` | ✔ |
| `/distributor/overview` | `distributorOverview.js` | ✔ |
| `/distributor/payments` | `distributorPayments.js` | ✔ |
| `/distributor/profile` | `distributorProfile.js` | ✔ |
| `/vision/{goals,founders,investors}` | `Landing/Vision/*` | — |
| `/support/{contact-us,grievances,tracking}` | `Landing/Support/*` | — |
| `/services/{inventory-management, billing-credit-management, customer-automation, supply-chain-optimizations, ai-driven-analytics}` | `Landing/Services/*` | — |
| `/partners/{retailers,distributors,delivery-partners}` | `Landing/Partners/*` | — |
| `/login` | `components/Login.js` | — |
| `/signup` | `components/Signup.js` | — |
| `*` | `components/NotFound.js` | — |

> `components/Footer.js` links to `/contact`, `/features`, `/pricing`, `/privacy`, `/terms`,
> `/services/analytics`, `/services/supply-chain` and `/services/support`. **None of these are
> declared routes** — all eight land on the 404 page.

## Which screens are real

This is the most useful table in this document.

| Screen | Calls the API? | Notes |
|---|---|---|
| `retailerShelf.js` (1139 lines) | ✅ | `/inventory`, `/products/get`, `/products/connected-distributors`, `/cart`, `/inventory/add`, `/orders/create`, `/distributors/batch` (404s) |
| `retailerCart.js` | ✅ | `POST /orders/create` — **bypasses `/cart/checkout`** |
| `retailerOrders.js` | ✅ | `/orders/retailer/orders` + approve/cancel/complete/modify, `/notifications`, `/inventory/checkout` |
| `retailerYou.js` | ✅ | `/retailers/profile`, `/connections/*` |
| `distributorOrders.js` | ✅ | `/orders/distributor/orders`, `/process`, `/status` |
| `distributorProducts.js` | ✅ | `/products/get`, `/api/distributor-inventory/*`, `/api/distributorships` |
| `distributorProfile.js` | ✅ | Profile, connections, `POST /upload/profile-picture` |
| `retailerPayment.js` (1382 lines) | ⚠️ Partly | **Starts from `generateMockData()`**; only reads `/distributors` and `/product-bills?role=retailer` |
| `retailerShop.js` | ❌ | Hardcoded `dummyOrders` |
| `CreateOrder.js` (980 lines) | ❌ | Voice-driven order builder over a hardcoded 100+ item `productDatabase` of **iPhones and Galaxies** — placeholder data |
| `distributorOverview.js` | ❌ | Entirely dummy Recharts series; comment says "replace with backend data fetching later" |
| `distributorPayments.js` | ❌ | Hardcoded `useState` array |
| All `Landing/Support/*` forms | ❌ | No submit handlers — Contact, Grievances and Tracking are inert |

## Dead code

Confirmed by import-graph search across `frontend/src` — **zero importers**:

`components/CarouselGrid.js`, `components/Layout.js` (a near-duplicate of `retailerLayout.js`),
`pages/Retailers/DistributorModal.js`, `pages/Retailers/retailerShelf12.js` (1440 lines, an
older copy of `retailerShelf.js`), `pages/test.js` (711 lines, an earlier draft of
`distributorOrders.js`), `src/reportWebVitals.js`, `src/App.css` (untouched CRA boilerplate),
`src/logo.svg`.

**Zero-byte stubs:** `components/BottomNav.js`, `components/Cart.js`,
`components/ProductCard.js`, `components/SearchBar.js`.

That is roughly **2,600 lines of unreferenced page and component code**, dominated by the
`retailerShelf.js` / `retailerShelf12.js` and `distributorOrders.js` / `test.js` duplicate
pairs.

Unreferenced assets: `HomeTruck.png`, `Kirana_Shop.webp`, `trackingBackground.png`,
`navBarLogo{2,12,14,15,156}.png` (only `navBarLogo1.png` is imported).

## Two live rendering bugs

1. **`/retailer/cart` throws.** `retailerCart.js:24` destructures required props
   (`cartItems`, `groupCartByDistributor`, `distributorInfo`, …) with no defaults and calls
   `cartItems.reduce(...)` at line 43. `App.js` renders `<RetailerCart />` with **no props** →
   `TypeError: Cannot read properties of undefined (reading 'reduce')`. It only works when
   rendered from inside `retailerShelf.js`, which does pass props.
2. **Double footer on `/`.** `Structure.js` renders `<Footer/>`, and `Landing/Home.js` imports
   and renders `<Footer/>` again inside the page.

## The committed build

`frontend/build/` is a **tracked build artifact** and `npm run build` (Vite) regenerates it
in place — `vite.config.js` sets `build.outDir: 'build'` for exactly this reason. Vite emits
hashed bundles under `build/assets/` (the CRA `build/static/{js,css,media}` layout is gone,
as is `asset-manifest.json`). The JS bundle still ships a source map. `frontend/build` is not
in `.gitignore`.

Note that filesystem mtimes are checkout times, so `find -newer` is not a valid staleness
test — compare `git log -- frontend/build` against `git log -- frontend/src`.

Because `api.js` falls back to the Render URL when `VITE_API_URL` is unset, a build made
without a `.env` is pinned to production, and every source change requires a rebuild and
re-commit or the artifact silently diverges. There is no CI to enforce it.

Also committed: `frontend/public/%PUBLIC_URL%/` — a literal directory named `%PUBLIC_URL%`
created long ago by an unsubstituted CRA template variable. Vite still copies it into
`build/`; it is harmless cruft, safe to delete from `public/` and `build/`.

## Testing

Minimal, but `npm test` now runs and passes (Vitest + jsdom, migrated off the broken
`react-scripts test` — see P4-5 in [10-known-issues.md](10-known-issues.md)).

- `src/App.test.js` is a single smoke test: it mounts `<App/>` (router + `AuthProvider` +
  landing page) and asserts the branding logo rendered. A crash anywhere in that chain fails
  it. It is the only test file in the repository.
- `src/setupTests.js` loads `@testing-library/jest-dom` and shims three browser APIs jsdom
  lacks (`matchMedia`, `IntersectionObserver`, `ResizeObserver`) that gsap and framer-motion
  need at load/mount.
- No error boundary, no loading/error shell around routes.
