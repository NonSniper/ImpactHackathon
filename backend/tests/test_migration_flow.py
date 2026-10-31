import os
import subprocess
import sys
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app
from app.models import Order, OrderItem


def test_populated_legacy_migration_preserves_history_and_requires_classification(tmp_path):
    backend_dir = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "legacy.db"
    env = os.environ | {"DATABASE_URL": f"sqlite:///{db_file}"}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "0012"], cwd=backend_dir, env=env, check=True, capture_output=True)
    with sqlite3.connect(db_file) as db:
        db.execute("INSERT INTO products(id,name,description,category,price_bani,storage_type,available,demo_only) VALUES(1,'Legacy','Test','test',65000,'chilled',1,0)")
        db.execute("INSERT INTO delivery_zones(id,city,neighborhood,active) VALUES(1,'Test','Test',1)")
        db.execute("INSERT INTO delivery_windows(id,zone_id,delivery_at,ordering_cutoff,reserved_orders) VALUES(1,1,'2099-01-03','2099-01-02',1)")
        db.execute("INSERT INTO orders(id,customer_name,phone,address,zone_id,delivery_window_id,total_bani,subtotal_bani) VALUES(1,'Test','060000000','Test',1,1,65000,65000)")
        db.execute("INSERT INTO order_items(order_id,product_id,quantity,unit_price_bani) VALUES(1,1,1,65000)")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=backend_dir, env=env, check=True, capture_output=True)
    with sqlite3.connect(db_file) as db:
        assert db.execute("SELECT id,total_bani,fulfillment_group FROM orders").fetchone() == (1, 65000, None)
        assert db.execute("SELECT quantity,unit_price_bani,custom_quantity FROM order_items").fetchone() == (1, 65000, 0)
        assert db.execute("SELECT fulfillment_group FROM products").fetchone() == (None,)
        assert db.execute("SELECT reserved_orders,fulfillment_group FROM delivery_windows").fetchone() == (1, None)


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
            headers = {"Authorization": "Bearer test-secret"}
            legacy = client.get("/api/admin/delivery-windows", headers=headers).json()[0]
            assert legacy["fulfillment_group"] is None
            assert client.patch(f"/api/admin/delivery-windows/{legacy['id']}", headers=headers, json={"fulfillment_group": "meals"}).status_code == 200
            window = client.get("/api/delivery-windows", params={"zone_id": zone["id"], "fulfillment_group": "meals"}).json()[0]
            assert client.get("/api/products").json() == []
            headers = {"Authorization": "Bearer test-secret"}
            demo_products = client.get("/api/admin/products", headers=headers).json()
            assert len(demo_products) == 11 and all(p["demo_only"] and not p["available"] for p in demo_products)
            response = client.post("/api/orders", json={
                "customer_name": "Test", "phone": "+37360000000", "address": "Adresă de test",
                "zone_id": zone["id"], "delivery_window_id": window["id"],
                "fulfillment_group": "meals",
                "items": [{"product_id": demo_products[0]["id"], "quantity": 1}],
            })
            assert response.status_code == 400
            created = client.post("/api/admin/products", headers=headers, json={
                "name": "Automated test product", "description": "Test only; not a commercial offer.",
                "category": "test", "price_bani": 65_000, "storage_type": "chilled",
                "product_type": "meal_plan", "plan_duration_days": 2, "fulfillment_group": "meals", "preparation_level": "ready", "available": True, "demo_only": False,
            })
            assert created.status_code == 201
            product = client.get("/api/products").json()[0]
            assert product["id"] == created.json()["id"]
            response = client.post("/api/orders", json={
                "customer_name": "Test", "phone": "+37360000000", "address": "Adresă de test",
                "zone_id": zone["id"], "delivery_window_id": window["id"],
                "fulfillment_group": "meals",
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
            assert client.get("/api/admin/orders").status_code == 401
            assert client.get(f"/api/admin/orders/{order_id}").status_code == 401
            unbatched = client.get("/api/admin/orders", params={"unbatched": True}, headers=headers).json()
            assert [order["id"] for order in unbatched] == [order_id]
            detail = client.get(f"/api/admin/orders/{order_id}", headers=headers).json()
            assert detail["address"] == "Adresă de test" and detail["phone"] == "+37360000000"
            assert detail["items"][0]["unit_price_bani"] == 65_000
            batch = client.post("/api/admin/batches", headers=headers, json={
                "zone_id": zone["id"], "delivery_window_id": window["id"], "order_ids": [order_id],
            })
            assert batch.status_code == 201
            batch_id = batch.json()["id"]
            assert batch.json()["order_ids"] == [order_id] and batch.json()["storage_type"] == "chilled"
            assert client.get("/api/admin/orders", params={"unbatched": True}, headers=headers).json() == []
            assert client.get(f"/api/admin/orders/{order_id}", headers=headers).json()["delivery_batch_id"] == batch_id
            path = f"/api/admin/batches/{batch_id}"
            assert client.get(f"{path}/financial-summary").status_code == 401
            incomplete = client.get(f"{path}/financial-summary", headers=headers).json()
            assert not incomplete["estimate_complete"] and incomplete["contribution_before_overhead_bani"] is None
            assert client.patch(f"/api/admin/products/{product['id']}", headers=headers,
                                json={"production_cost_bani": 30_000}).status_code == 200
            assert client.patch(f"{path}/costs", headers=headers, json={"estimate_kind": "demo",
                                "estimated_transport_bani": 5_000,
                                "estimated_packaging_per_order_bani": 5_000}).status_code == 200
            summary = client.get(f"{path}/financial-summary", headers=headers).json()
            assert summary["estimate_complete"] and summary["estimate_kind"] == "demo"
            assert summary["revenue_bani"] == 65_000 and summary["estimated_food_cost_bani"] == 30_000
            assert summary["contribution_before_overhead_bani"] == 25_000
            production = client.get(f"{path}/production", headers=headers).json()
            assert production["products"][0]["product_id"] == product["id"]
            assert production["products"][0]["quantity"] == 1
            manifest = client.get(f"{path}/delivery-manifest", headers=headers).json()
            assert manifest["stops"][0]["order_id"] == order_id
            with Session(engine) as db:
                assert db.get(Order, order_id) is not None
                assert db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).one().unit_price_bani == product["price_bani"]
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
