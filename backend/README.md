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
    "supplier": "CREDEM"
  }
]
```

The JSON above only illustrates the response shape; it is not an approval of any real product or price. A freshly seeded catalog returns `[]`.

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

Lists windows in an active zone whose delivery and ordering cutoff are still in the future. An unknown or inactive zone returns an empty list.

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

The returned zone contains its new `id` and the fields shown in the public zone example. Use actual sector IDs from `GET /api/admin/delivery-zones`. Delivery windows must exist for a zone before it can receive orders; admin window management is not implemented yet.

### Admin order map and location review

Both endpoints require the admin bearer token. `GET /api/admin/orders/map` returns two arrays: `markers` (orders with coordinates) and `unlocated` (orders without coordinates). Optional query filters are `city`, `zone_id`, `date` (delivery date in UTC, `YYYY-MM-DD`), `window_id`, `status` (order status), and `location_status` (`unlocated`, `unverified`, `verified`, or `flagged`). Filters apply to both arrays. `delivery_batch_id` is currently always `null`; batching and batch filtering are not yet implemented.

Example response, with illustrative coordinates and address:

```json
{
  "markers": [{
    "id": 1, "address": "Adresă de test", "zone_id": 1, "delivery_window_id": 1,
    "latitude": 47.04, "longitude": 28.86, "coordinate_source": "manual_map_pin",
    "location_verification_status": "unverified", "location_review_note": null,
    "delivery_instructions": null, "total_bani": 65000, "status": "requested",
    "delivery_batch_id": null
  }],
  "unlocated": []
}
```

`PATCH /api/admin/orders/{id}/location` updates the coordinates or manual review state. For example, `{"location_verification_status":"flagged", "location_review_note":"Verifică sectorul"}` flags a suspected mismatch for review. An admin can mark a location `verified` after checking it. Updating coordinates requires both values and resets the status to `unverified` unless an explicit status is provided. Send both coordinates as `null` to clear a pin. No geographic boundary checks are implemented.
