# CREDEM Home frontend

React, TypeScript and Vite storefront and administration interface.

```sh
cd frontend
npm install
npm run dev
npm run build
npx playwright install chromium
npm test
```

The development server proxies `/api` to `http://127.0.0.1:8000`. For a separately hosted backend, set `VITE_API_URL` to the API origin without `/api` before building; never put an admin token or another secret in a `VITE_` variable. The Vercel rewrite serves the application for direct page links, so a separately hosted API must use its own origin rather than the frontend's SPA fallback. Confirm that the configured origin's `/api/health` returns JSON. See `backend/README.md` for backend setup and the authoritative API contract.

The live catalog shows only approved, available backend products. Freshly seeded illustrative products are intentionally unavailable. The storefront's **Încearcă demo** control uses fictional browser-only products and session-only simulated requests. It does not send them to the API. Backend `is_demo` orders are a separate dataset visible in the admin interface after an administrator runs the backend's demo seed.

Open `/admin` and enter the backend's shared bearer token. The token is kept in page memory and must be entered again after a reload. This is temporary supervised-demo authentication, not a production login system. Orders are requests, not payments. Delivery location markers require manual review; the map does not verify zones or optimize routes.

Meals and Frozen use separate carts, delivery windows and requests, each with a minimum of 600 MDL or the zone's higher minimum. The family builder stores intended day/person allocations without adding duplicate chargeable items. Set `VITE_GEOAPIFY_KEY` only for optional address suggestions; restrict the browser key by origin and usage in the provider account. Without it, manual pins and device geolocation remain available. See `PHOTO_CREDITS.md` for the illustrative photo license.

For integration tests use a new isolated database, configure a temporary admin token, and create an explicitly test-only approved product with fictional customer data. Do not approve seeded illustrative products for commercial use. PostgreSQL and real object storage require separate environment-specific verification.
