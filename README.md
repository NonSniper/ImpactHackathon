# Family meal ordering MVP

A guest ordering flow built with React, TypeScript, Vite, FastAPI, SQLAlchemy, Alembic, and PostgreSQL. SQLite is available for local development. Customers can select one of two three-day family meal packages, provide contact and delivery details, and receive an order ID after a successful database insert.

## Requirements

- Python 3.12+
- Node.js 20.19+ (or 22.12+) and npm
- PostgreSQL for pilot or production use (SQLite is the local default)

## Run locally

Start the API in one terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` requests to http://127.0.0.1:8000. API docs are at http://localhost:8000/docs. The local database is `backend/app.db`.

Guest submissions are disabled by default. The order form can be exercised locally by setting `PUBLIC_ORDER_SUBMISSIONS_ENABLED=true` in `backend/.env`, then restarting the API. Leave this setting false until the pilot is approved. `DATABASE_URL` defaults to SQLite locally; set it to a PostgreSQL URL for the pilot. Existing database migrations are preserved and the `0002` migration adds the orders table.

## Order request

`POST /api/orders` accepts a package ID (`family-classic` or `family-vegetarian`), contact name, email, phone, delivery address, city, postal code, delivery date, and optional delivery instructions. The API validates the package and required details, requires a delivery date at least one day in the future, and responds with the created numeric order ID and package ID. Requests return `503` while submissions are disabled and `422` for invalid input.

## Verify

```bash
cd backend
.venv/bin/python -m pytest
```

```bash
cd frontend
npm run build
```

This MVP does not include customer accounts or payment processing.
