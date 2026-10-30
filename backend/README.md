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
python -m uvicorn app.main:app --reload
```

The default database is `sqlite:///./app.db`, relative to the current directory. To use PostgreSQL, set `DATABASE_URL` before running migrations, seeding, and starting the server; `postgres://` and `postgresql://` URLs are supported. `CORS_ORIGINS` is a comma-separated list of allowed browser origins. The sample environment configuration is in `.env.example`. Run all commands from `backend/`.

The seed script is optional and can be run again: it leaves existing products and zones unchanged and creates a future delivery window for a zone if none is currently open for ordering. Seed prices are illustrative. Frozen demonstration products are explicitly marked and are not available for commercial fulfillment.

Interactive API documentation: `http://127.0.0.1:8000/docs`.

To run the tests:

```bash
python -m pytest -q
```

## API contract

Amounts are integer **bani**: 100 bani = 1 MDL. Delivery times and ordering cutoffs are UTC and use ISO 8601; `Z` denotes UTC. The example IDs and dates below are illustrative. Obtain current IDs and future windows using the listing endpoints rather than hard-coding them.

### `GET /api/products`

Lists available products. A product marked `demo_only` cannot be ordered, even if it is marked available. Unavailable products are not listed.

```json
[
  {
    "id": 1,
    "name": "Plan de mese pentru 3 zile — clasic",
    "description": "Plan demonstrativ de mese pentru trei zile. Preț ilustrativ.",
    "category": "meal_plan",
    "price_bani": 65000,
    "storage_type": "fresh",
    "available": true,
    "demo_only": false
  }
]
```

### `GET /api/delivery-zones`

Lists active delivery zones.

```json
[
  {"id": 1, "city": "Chișinău", "neighborhood": "Buiucani", "active": true}
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
  "items": [
    {"product_id": 1, "quantity": 1}
  ]
}
```

Successful response (`201 Created`):

```json
{"id": 1, "total_bani": 65000, "status": "requested"}
```

The server looks up prices and stores a price snapshot for each item. Prices in the request are ignored. Each product may appear only once; quantities must be whole numbers from 1 to 1000. The minimum total is 60,000 bani (600 MDL). Product availability, demonstration status, active zone, matching window, and cutoff are verified when the order is submitted. The order and all its items are saved atomically.

Invalid business choices return `400`, for example:

```json
{"detail": "Minimum order value is 600 MDL"}
```

Missing or malformed fields return `422` with FastAPI validation details. Listing endpoints do not expose customer phone numbers or addresses.
