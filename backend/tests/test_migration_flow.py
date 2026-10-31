import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app
from app.models import Order, OrderItem


def test_clean_migration_seed_and_order_flow(tmp_path, monkeypatch):
    backend_dir = Path(__file__).resolve().parents[1]
    database_url = f"sqlite:///{tmp_path / 'migrated.db'}"
    env = os.environ | {"DATABASE_URL": database_url}
    for args in (["alembic", "upgrade", "head"], ["alembic", "check"], ["app.seed"]):
        subprocess.run([sys.executable, "-m", *args], cwd=backend_dir, env=env,
                       check=True, capture_output=True, text=True)

    engine = create_engine(database_url, connect_args={"check_same_thread": False})

    def override_db():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    try:
        with TestClient(app) as client:
            zone = client.get("/api/delivery-zones").json()[0]
            assert zone["name"] == "Rîșcani"
            window = client.get("/api/delivery-windows", params={"zone_id": zone["id"]}).json()[0]
            assert client.get("/api/products").json() == []
            headers = {"Authorization": "Bearer test-secret"}
            demo_products = client.get("/api/admin/products", headers=headers).json()
            assert len(demo_products) == 11 and all(p["demo_only"] and not p["available"] for p in demo_products)
            response = client.post("/api/orders", json={
                "customer_name": "Test", "phone": "+37360000000", "address": "Adresă de test",
                "zone_id": zone["id"], "delivery_window_id": window["id"],
                "items": [{"product_id": demo_products[0]["id"], "quantity": 1}],
            })
            assert response.status_code == 400
            created = client.post("/api/admin/products", headers=headers, json={
                "name": "Automated test product", "description": "Test only; not a commercial offer.",
                "category": "test", "price_bani": 65_000, "storage_type": "fresh",
                "product_type": "meal_plan", "available": True, "demo_only": False,
            })
            assert created.status_code == 201
            product = client.get("/api/products").json()[0]
            assert product["id"] == created.json()["id"]
            response = client.post("/api/orders", json={
                "customer_name": "Test", "phone": "+37360000000", "address": "Adresă de test",
                "zone_id": zone["id"], "delivery_window_id": window["id"],
                "latitude": 47.04, "longitude": 28.86,
                "items": [{"product_id": product["id"], "quantity": 1}],
            })
            assert response.status_code == 201
            assert response.json()["total_bani"] == product["price_bani"]
            order_id = response.json()["id"]
            assert client.get("/api/admin/orders/map").status_code == 401
            markers = client.get("/api/admin/orders/map", headers={"Authorization": "Bearer test-secret"}).json()["markers"]
            assert [marker["id"] for marker in markers] == [order_id]
            assert markers[0]["location_verification_status"] == "unverified"
            with Session(engine) as db:
                assert db.get(Order, order_id) is not None
                assert db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).one().unit_price_bani == product["price_bani"]
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
