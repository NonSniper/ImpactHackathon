# CREDEM Home backend

FastAPI backend for requesting food orders. An order is a request, not a delivery confirmation or a payment. There is no online payment integration.

## Local setup

From the `backend/` directory, with Python 3.10 or later:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m alembic upgrade head
python -m app.seed
# Set an admin token in the environment before starting the server.
export ADMIN_API_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
python -m uvicorn app.main:app --reload
```

The default database is `sqlite:///./app.db`, relative to the current directory. To use PostgreSQL, set `DATABASE_URL` before running migrations, seeding, and starting the server; `postgres://` and `postgresql://` URLs are supported. `CORS_ORIGINS` is a comma-separated list of allowed browser origins. The sample environment configuration is in `.env.example`. Run all commands from `backend/`.

Admin routes require `Authorization: Bearer <ADMIN_API_TOKEN>`. Configure a long random secret as an environment variable, keep it out of source control, and use HTTPS when deployed. Without a configured token, admin routes return `503`; missing or incorrect credentials return `401`. This shared token is temporary MVP authentication and does not provide individual accounts or roles.

The seed script is optional and can be run again: it leaves existing products and zone settings unchanged and creates a future delivery window for each active seeded sector if none is currently open for ordering. New installations get Chișinău's five sectors, with Rîșcani active and Buiucani, Botanica, Centru and Ciocana inactive. Migration 0005 also deactivates the previously seeded Buiucani and Botanica sectors; existing orders are retained. All newly seeded products have illustrative prices, are `demo_only: true` and `available: false`, and cannot be commercially ordered. The public catalog is empty until an administrator adds or approves real products after CREDEM validates their details. The admin product listing and simulated-order dataset remain available for demonstration.

**Existing databases:** older seed versions created six illustrative products as orderable. Running the updated seed does not modify them or prove whether they were later approved. Before accepting real orders, review the admin product list and run this read-only check from `backend/`:

```bash
python -m app.audit_seed_products
```

It prints IDs, names, prices and availability flags for exact matches to the six old seed names; renamed products are not detected, and a name match is not proof of origin or approval. Review such products and any renamed or other unapproved items manually. For each unapproved product, an authenticated admin can send `PATCH /api/admin/products/{id}` with `{"available": false, "demo_only": true}`. Do not reactivate products until CREDEM has validated them. Existing products and order history are not changed automatically.

Interactive API documentation: `http://127.0.0.1:8000/docs`.

To run the tests:

```bash
python -m pytest -q
```

## API contract

Amounts are integer **bani**: 100 bani = 1 MDL. Delivery times and ordering cutoffs are UTC and use ISO 8601; `Z` denotes UTC. The example IDs and dates below are illustrative. Obtain current IDs and future windows using the listing endpoints rather than hard-coding them.

### `GET /api/products`

Lists products that are both available and approved (not `demo_only`). Unavailable and demonstration products are not listed.

```json
[
  {
    "id": 1,
    "name": "Produs aprobat — exemplu de răspuns",
    "description": "Exemplu de structură pentru un produs aprobat de administrator.",
    "category": "meal_plan",
    "price_bani": 65000,
    "storage_type": "fresh",
    "available": true,
    "demo_only": false,
    "sku": null,
    "product_type": "meal_plan",
    "unit": "pack",
    "net_weight_g": null,
    "preparation_type": null,
    "ingredients": null,
    "allergens": null,
    "shelf_life_days": null,
    "preparation_instructions": null,
    "supplier": "CREDEM",
    "image_preview_url": null
  }
]
```

The JSON above only illustrates the response shape; it is not an approval of any real product or price. A freshly seeded catalog returns `[]`.

`GET /api/products/{id}` returns the same information plus `image_detail_url`. It only returns available, approved products; other IDs return `404`. Both image URLs can be `null`.

### Product photos

Administrators can use `POST /api/admin/products/{id}/images` with bearer authentication and `multipart/form-data` fields `preview` and `detail`. Both are required. Accepted content is JPEG, PNG or WebP (not animated); preview is limited to 320×320 pixels and 1 MiB, detail to 1280×1280 pixels and 5 MiB. The backend decodes and re-encodes images as WebP, strips metadata, and rejects malformed, oversized or unsupported files. The response is the updated admin product with `image_preview_url` and `image_detail_url`. `DELETE /api/admin/products/{id}/images` removes the references and attempts to delete both stored objects. Replacement preserves the old references if upload fails; unsuccessful cleanup is logged and can leave unused objects in storage.

```bash
curl -X POST "http://127.0.0.1:8000/api/admin/products/1/images" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -F "preview=@preview.webp" -F "detail=@detail.webp"
curl -X DELETE "http://127.0.0.1:8000/api/admin/products/1/images" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

For persistent storage, create an S3-compatible bucket (for example Cloudflare R2), configure an HTTPS public URL for objects, and set `IMAGE_STORAGE_BUCKET`, `IMAGE_STORAGE_ACCESS_KEY_ID`, `IMAGE_STORAGE_SECRET_ACCESS_KEY`, `IMAGE_PUBLIC_BASE_URL` and `IMAGE_STORAGE_REGION` (`auto` for R2). Set `IMAGE_STORAGE_ENDPOINT` to the provider's HTTPS S3 endpoint (required for R2; omit for AWS). Grant the backend credentials permission to upload and delete objects in that bucket. The public URL must serve the same bucket and path; object read access must be configured at the provider. Keep credentials in server environment variables, never in React or source control. Without this configuration, upload returns `503` and the rest of the API remains available. The seed does not include image URLs; frontend can show a placeholder when URLs are null. Configure a request-body size limit at the reverse proxy as well, because multipart parsing occurs before application-level image validation.

### `GET /api/delivery-zones`

Lists active delivery zones. A subzone is listed only if its parent sector is also active. The existing `neighborhood` field and `name` contain the same zone name.

```json
[
  {
    "id": 1, "city": "Chișinău", "name": "Rîșcani", "neighborhood": "Rîșcani",
    "active": true, "parent_zone_id": null, "minimum_basket_bani": 60000,
    "delivery_fee_bani": 0
  }
]
```

### `GET /api/delivery-windows?zone_id=1`

Lists active windows in an active zone whose delivery and ordering cutoff are still in the future and which have capacity available. An unknown or inactive zone returns an empty list.

```json
[
  {
    "id": 1,
    "zone_id": 1,
    "delivery_at": "2026-11-02T12:00:00Z",
    "ordering_cutoff": "2026-11-01T12:00:00Z"
  }
]
```

### `POST /api/orders`

Request:

```json
{
  "customer_name": "Client Test",
  "phone": "+37360000000",
  "address": "Adresă de test",
  "zone_id": 1,
  "delivery_window_id": 1,
  "latitude": 47.04,
  "longitude": 28.86,
  "coordinate_source": "manual_map_pin",
  "delivery_instructions": "Intrarea de test",
  "items": [
    {"product_id": 1, "quantity": 1}
  ]
}
```

Successful response (`201 Created`):

```json
{"id": 1, "subtotal_bani": 65000, "delivery_fee_bani": 0, "total_bani": 65000, "status": "requested"}
```

The server looks up prices and stores a price snapshot for each item. Prices in the request are ignored. Each product may appear only once; quantities must be whole numbers from 1 to 1000. The zone's minimum applies to the product subtotal before the delivery fee; it defaults to 60,000 bani (600 MDL). Subtotal and delivery fee are saved with each order so later configuration changes do not alter history. Product availability, demonstration status, active zone and parent sector, matching window, and cutoff are verified when the order is submitted. The order and all its items are saved atomically.

Every item in an order must have the same validated storage type: `fresh`, `chilled`, or `frozen`. Different types currently require separate orders; each order must meet the zone minimum. Products with `pending_validation` cannot be ordered. Rejected requests do not reserve delivery-window capacity. Existing orders are not changed; older mixed or unknown storage snapshots may still require manual review before batching.

Latitude and longitude are optional but must be supplied together and within their geographic ranges. The example coordinates are illustrative, not a real address. A customer pin is stored as `manual_map_pin` and `unverified`; an order without a pin is `unlocated`. A selected zone or pin does not automatically verify the location. Delivery instructions are optional.

Invalid business choices return `400`, for example:

```json
{"detail": "Minimum basket value is 60000 bani"}
```

Missing or malformed fields return `422` with FastAPI validation details. Listing endpoints do not expose customer phone numbers or addresses.

### Admin product endpoints

All require the bearer token. `GET /api/admin/products` lists all products, including inactive and demo products; `POST /api/admin/products` creates one; `PATCH /api/admin/products/{id}` updates supplied fields; `DELETE /api/admin/products/{id}` deactivates it without deleting order history. A missing product returns `404`, and a duplicate SKU returns `409`.

Example `POST /api/admin/products` body:

```json
{
  "name": "Sarmale cu pui",
  "description": "Porție de 500 g; informații în curs de verificare.",
  "category": "traditional",
  "price_bani": 15000,
  "storage_type": "pending_validation",
  "sku": "CREDEM-SAR-500",
  "product_type": "individual_dish",
  "unit": "pack",
  "net_weight_g": 500,
  "production_cost_bani": null,
  "supplier": "CREDEM"
}
```

New products default to `available: false` and `demo_only: true`. To make an approved product orderable, update both fields to `true` and `false` respectively. The admin response also contains nullable preparation, ingredient, allergen, shelf-life, and production-cost fields. Production cost is not included in public product responses. Sending `null` in a patch clears nullable fields; required fields cannot be null.

### Admin delivery zone endpoints

All require the bearer token. `GET /api/admin/delivery-zones` lists all zones, including inactive ones; `POST /api/admin/delivery-zones` creates a zone; `PATCH /api/admin/delivery-zones/{id}` changes its settings. New zones default to inactive. `parent_zone_id` may identify a sector in the same city, allowing one level of subzones. A subzone is not eligible when its parent is inactive. Existing orders remain intact if a zone is disabled.

Example `POST /api/admin/delivery-zones` body:

```json
{
  "city": "Chișinău",
  "name": "Rîșcani Nord",
  "parent_zone_id": 1,
  "active": true,
  "minimum_basket_bani": 60000,
  "delivery_fee_bani": 5000
}
```

The returned zone contains its new `id` and the fields shown in the public zone example. Use actual sector IDs from `GET /api/admin/delivery-zones`. Delivery windows must exist for a zone before it can receive orders.

### Admin order list and details

Both endpoints require the admin bearer token. `GET /api/admin/orders` lists newest orders first, including unbatched orders. Optional filters: `zone_id`, `window_id`, `batch_id`, `status`, `is_demo` and `unbatched=true`. `limit` defaults to 50 (maximum 100); `offset` defaults to 0. Without an `is_demo` filter, both real and simulated orders are included and labeled.

Example `GET /api/admin/orders?unbatched=true&is_demo=false` response:

```json
[{"id": 1, "customer_name": "Client Test", "zone_id": 1, "delivery_window_id": 1,
  "delivery_at": "2026-11-02T12:00:00Z", "delivery_batch_id": null,
  "subtotal_bani": 65000, "delivery_fee_bani": 0, "total_bani": 65000,
  "status": "requested", "created_at": "2026-10-30T12:00:00Z", "is_demo": false}]
```

`GET /api/admin/orders/{id}` returns those fields plus phone, address, location, instructions and ordered items, even before the order is batched. Example:

```json
{"id": 1, "customer_name": "Client Test", "phone": "+37360000000", "address": "Adresă de test",
 "zone_id": 1, "delivery_window_id": 1, "delivery_at": "2026-11-02T12:00:00Z",
 "delivery_batch_id": null, "subtotal_bani": 65000, "delivery_fee_bani": 0, "total_bani": 65000,
 "status": "requested", "created_at": "2026-10-30T12:00:00Z", "is_demo": false,
 "latitude": null, "longitude": null, "coordinate_source": null,
 "location_verification_status": "unlocated", "location_review_note": null, "delivery_instructions": null,
 "items": [{"product_id": 1, "product_name": "Plan de mese", "product_sku": null, "quantity": 1,
            "unit_price_bani": 65000, "line_total_bani": 65000, "storage_type_snapshot": "fresh",
            "net_weight_g_snapshot": null, "unit_snapshot": "pack"}]}
```

The item price, storage type, weight and unit are order snapshots. Product names and SKUs come from the current catalog and may change; older orders can have null storage, weight or unit snapshots. Unknown order IDs return `404`. Customer contact details are returned only by authenticated admin endpoints.

### Admin order map and location review

Both endpoints require the admin bearer token. `GET /api/admin/orders/map` returns two arrays: `markers` (orders with coordinates) and `unlocated` (orders without coordinates). Optional query filters are `city`, `zone_id`, `date` (delivery date in UTC, `YYYY-MM-DD`), `window_id`, `batch_id`, `status` (order status), `is_demo` (boolean), and `location_status` (`unlocated`, `unverified`, `verified`, or `flagged`). Filters apply to both arrays. `delivery_batch_id` is `null` until the order is assigned to a batch; `is_demo` distinguishes simulated orders.

Example response, with illustrative coordinates and address:

```json
{
  "markers": [{
    "id": 1, "address": "Adresă de test", "zone_id": 1, "delivery_window_id": 1,
    "latitude": 47.04, "longitude": 28.86, "coordinate_source": "manual_map_pin",
    "location_verification_status": "unverified", "location_review_note": null,
    "delivery_instructions": null, "total_bani": 65000, "status": "requested",
    "delivery_batch_id": null, "is_demo": false
  }],
  "unlocated": []
}
```

`PATCH /api/admin/orders/{id}/location` updates the coordinates or manual review state. For example, `{"location_verification_status":"flagged", "location_review_note":"Verifică sectorul"}` flags a suspected mismatch for review. An admin can mark a location `verified` after checking it. Updating coordinates requires both values and resets the status to `unverified` unless an explicit status is provided. Send both coordinates as `null` to clear a pin. No geographic boundary checks are implemented.

### Admin delivery batches

All endpoints require the admin bearer token:

- `GET /api/admin/batches` lists batches.
- `POST /api/admin/batches` creates a batch and assigns orders atomically.
- `GET /api/admin/batches/{id}` returns the batch and assigned order IDs.
- `GET /api/admin/batches/{id}/summary` returns household count, item quantity, sales value and weight.
- `GET /api/admin/batches/{id}/production` returns product quantities and weights for preparation.

Example request to create a batch:

```json
{"zone_id": 3, "delivery_window_id": 4, "order_ids": [1, 2]}
```

Example summary:

```json
{
  "batch_id": 1,
  "is_demo": false,
  "household_count": 2,
  "total_item_quantity": 6,
  "total_sales_bani": 160000,
  "total_weight_g": null,
  "known_weight_g": 1000
}
```

All orders must belong to the specified zone and window and be unassigned. Every item in a batch must have the same known storage type (`fresh`, `chilled`, or `frozen`); mixed and unvalidated storage types are rejected until compatible transport is confirmed. Newly submitted orders snapshot product storage and weight. Items in orders made before migration 0007 have unknown snapshots and cannot be batched automatically; the migration does not guess their historical requirements. An order cannot be assigned twice. `total_sales_bani` includes delivery fees. `total_weight_g` is `null` if any item lacks a weight; `known_weight_g` is the sum of available weights. Stop ordering is not implemented yet.

Example production totals:

```json
{
  "batch_id": 1,
  "is_demo": false,
  "products": [
    {"product_id": 1, "name": "Plan de mese", "sku": null, "unit": "pack",
     "quantity": 3, "total_weight_g": 1500, "known_weight_g": 1500}
  ]
}
```

Quantities are grouped by product and by the unit saved with each order item, so different units are never added together. Product names and SKUs reflect the current catalog; units and weights are snapshots. An unknown unit is returned as `null`, including for items ordered before migration 0008; an unknown total weight is `null`, with the known portion reported separately. Meal plans are counted as whole products; their components are not yet modeled.

### Admin cost assumptions and financial estimates

All endpoints require the admin bearer token. `GET /api/admin/batches/{id}/costs` reads the assumptions, and `PATCH` on the same path updates them. Product `production_cost_bani` is configured through the admin product API and is interpreted as an estimated cost per current product unit. Configure batch assumptions, for example:

```json
{
  "estimate_kind": "demo",
  "estimated_transport_bani": 30000,
  "estimated_packaging_per_order_bani": 3000
}
```

`estimate_kind` is `demo` or `operational`: both describe estimates, not actual accounting records. Fields can be cleared by setting them to `null`. Demo assumptions are labeled per batch; actual expenses are not stored by these endpoints.

`GET /api/admin/batches/{id}/financial-summary` returns revenue including delivery fees, estimated food, packaging and transport costs, delivery cost per household, contribution before fixed overhead, and the estimated number of orders needed to cover transport. Each order counts as one household. The transport cost per household rounds up to the next whole ban. Break-even assumes future orders have the same average revenue and variable costs as the current batch, with a fixed transport cost; it is unavailable if that average margin is not positive. A zero transport cost requires zero orders to cover it.

An estimate is complete only when its kind, transport, packaging and all product costs are known. Unknown product costs, order units or changed product units/weights are reported in `unpriced_products`; `known_food_cost_bani` contains only the known portion. The complete food cost, contribution and break-even values are `null` when required information is missing. Calculations use current product cost assumptions and can change when the admin edits them; they are not actual recorded expenses.

### Admin packing and delivery reports

All routes require the admin bearer token. For a batch, `GET /api/admin/batches/{id}/packing-list` shows products and quantities per order. `GET /api/admin/batches/{id}/delivery-manifest` lists the delivery stops, addresses, telephone numbers, pins and instructions. Stops are ordered by ID; this is not route optimization.

Download `GET /api/admin/batches/{id}/exports/orders.csv` for the manifest or `GET /api/admin/batches/{id}/exports/production.csv` for production totals. CSV files use UTF-8 with BOM and protect text cells that spreadsheet programs might interpret as formulas. Unknown values are empty cells. The order export contains customer data and must be handled as an admin-only file.

### Admin delivery windows and order status

All routes require the admin bearer token:

- `GET /api/admin/delivery-windows` lists windows, with optional `zone_id` filter, including inactive and full windows.
- `POST /api/admin/delivery-windows` creates a window.
- `PATCH /api/admin/delivery-windows/{id}` changes dates, cutoff, active state or capacity.
- `PATCH /api/admin/orders/{id}/status` moves an order to its next fulfillment status.

Example window creation (dates are illustrative and must be in the future):

```json
{
  "zone_id": 1,
  "delivery_at": "2026-11-10T12:00:00Z",
  "ordering_cutoff": "2026-11-09T12:00:00Z",
  "capacity": 30,
  "active": true
}
```

Times must include a timezone and are returned in UTC. `capacity` counts orders and may be `null` for no limit. Each saved order reserves one place atomically. `reserved_orders` appears in admin responses; a full or inactive window cannot receive orders. Capacity cannot be set below existing reservations, and dates cannot be changed after an order is placed. Migration 0010 counts existing orders as reservations. Order cancellation and releasing a reserved place are not implemented yet.

Status updates use `{"status":"confirmed"}` and proceed one step at a time: `requested → confirmed → packed → dispatched → delivered`. Repeating the current status is allowed; skipping or reversing a step returns `409`. The status describes fulfillment and does not represent a payment.

### Simulated order dataset

After migrations and the normal `python -m app.seed`, create 50 simulated orders with:

```bash
python -m app.seed_demo_orders
```

Run it again without `--reset` to keep the existing dataset unchanged. To replace **only** this script's simulated orders and remove their now-empty demo batches:

```bash
python -m app.seed_demo_orders --reset
```

The dataset uses fictitious names, phone labels, addresses and illustrative coordinates; these are not real customers or verified locations. Its non-orderable simulation products and costs are invented. The orders use an isolated `is_demo` delivery window that does not appear to customers or consume real window capacity. Admin map results can be filtered with `?is_demo=true`; reports, CSVs, windows and batches indicate demo data. Demo and real orders cannot be combined in a batch, and a demo batch cannot be labeled as an operational estimate. Use the order IDs and demo window ID returned by the admin map to create a demo batch. Resetting deletes only orders bearing this dataset's key, preserving real orders and any other demo datasets.
