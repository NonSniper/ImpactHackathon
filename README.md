# FastAPI + React starter

A small full-stack starter with a working task list. React and TypeScript run in Vite, FastAPI serves the API, and SQLAlchemy uses SQLite locally or PostgreSQL in production. Alembic manages the schema.

## Requirements

- Python 3.12+ and Node.js 20.19+ (or 22.12+)
- npm

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

Open http://localhost:5173. Vite forwards `/api` requests to the API at http://127.0.0.1:8000. Interactive API documentation is at http://localhost:8000/docs. The SQLite database is `backend/app.db` and is not tracked by Git.

## Database and migrations

SQLite is the default. Set `DATABASE_URL` in `backend/.env` to a PostgreSQL connection string to use PostgreSQL instead. Standard `postgres://` and `postgresql://` URLs are converted to SQLAlchemy's psycopg driver automatically; query parameters such as `sslmode=require` are preserved. SQLite and PostgreSQL are separate databases; changing the URL does not transfer local data.

After changing a model, generate and review a migration, then apply it:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

Migrations create the schema; the API does not create tables automatically. Run them against each database you use.

## Deploy later

1. Create a Neon database and copy its connection string, including its SSL settings. Keep it secret.
2. Create a Render web service from this repository using the root-level `render.yaml` Blueprint. Set `DATABASE_URL` to the Neon connection string and `CORS_ORIGINS` to your Vercel site's exact HTTPS origin, for example `https://your-project.vercel.app`. Separate multiple allowed origins with commas and omit trailing slashes. The service runs migrations at startup; its health check is `/api/health`.
3. Import the repository into Vercel and set the project root directory to `frontend`. Use the Vite framework preset, and set `VITE_API_URL` to the Render service origin, for example `https://your-api.onrender.com`, without `/api`. Redeploy after changing the variable: Vite embeds it at build time. Do not put secrets in `VITE_` variables.
4. Once the Vercel URL is known, add it to Render's `CORS_ORIGINS` and redeploy or restart the API. Preview deployments need their exact origins added as well.

The startup migration is convenient for a single-instance starter and free Render services. Before scaling to multiple instances or running deployments with incompatible schema changes, move migrations to a separate, coordinated deployment step; Render's pre-deploy command is available on paid services. Never use the local SQLite file as production storage on Render's ephemeral filesystem.

## Verify

```bash
cd backend
pytest
```

```bash
cd frontend
npm run build
```

## Layout

- `backend/app` — API, database configuration, model, and schemas
- `backend/alembic` — database migrations
- `frontend/src` — React UI and API client
- `render.yaml` — Render service configuration

The task list is an example and has no authentication. Add access control before exposing private or user-specific data.
