from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base, get_db
from app.main import app
from app.models import DeliveryWindow, DeliveryZone, Order, OrderItem, Product


@pytest.fixture
def api(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    now = datetime.now(timezone.utc)
    with Session(engine) as db:
        db.add_all([
            Product(id=1, name="Meal plan", description="Three days", category="plan", price_bani=35_000,
                    storage_type="fresh", available=True, demo_only=False),
            Product(id=2, name="Soup", description="Fresh soup", category="food", price_bani=10_000,
                    storage_type="fresh", available=True, demo_only=False),
            Product(id=3, name="Unavailable", description="Unavailable", category="food", price_bani=50_000,
                    storage_type="fresh", available=False, demo_only=False),
            Product(id=4, name="Demo", description="Demo only", category="food", price_bani=50_000,
                    storage_type="frozen", available=True, demo_only=True),
            DeliveryZone(id=1, city="Chișinău", neighborhood="Buiucani", active=True),
            DeliveryZone(id=2, city="Chișinău", neighborhood="Botanica", active=True),
            DeliveryZone(id=3, city="Chișinău", neighborhood="Inactive", active=False),
        ])
        db.flush()
        db.add_all([
            DeliveryWindow(id=1, zone_id=1, delivery_at=now + timedelta(days=3), ordering_cutoff=now + timedelta(days=2)),
            DeliveryWindow(id=2, zone_id=2, delivery_at=now + timedelta(days=3), ordering_cutoff=now + timedelta(days=2)),
            DeliveryWindow(id=3, zone_id=1, delivery_at=now + timedelta(days=1), ordering_cutoff=now - timedelta(days=1)),
        ])
        db.commit()

    def override_db():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def valid_order():
    return {
        "customer_name": " Ana ", "phone": "+373 600 00000", "address": "Test street 1",
        "zone_id": 1, "delivery_window_id": 1,
        "items": [{"product_id": 1, "quantity": 2, "unit_price_bani": 1}, {"product_id": 2, "quantity": 1}],
    }


def test_listings(api):
    client, _ = api
    products = client.get("/api/products")
    assert products.status_code == 200
    assert [product["id"] for product in products.json()] == [1, 2]
    assert "production_cost_bani" not in products.json()[0]
    assert [zone["id"] for zone in client.get("/api/delivery-zones").json()] == [1, 2]
    windows = client.get("/api/delivery-windows", params={"zone_id": 1}).json()
    assert [window["id"] for window in windows] == [1]
    assert windows[0]["delivery_at"].endswith("Z")


def test_order_uses_server_prices_and_saves_items(api):
    client, engine = api
    response = client.post("/api/orders", json=valid_order())
    assert response.status_code == 201
    assert response.json() == {"id": 1, "subtotal_bani": 80_000, "delivery_fee_bani": 0,
                               "total_bani": 80_000, "status": "requested"}
    with Session(engine) as db:
        order = db.get(Order, 1)
        assert (order.customer_name, order.total_bani, order.status) == ("Ana", 80_000, "requested")
        items = db.scalars(select(OrderItem).order_by(OrderItem.product_id)).all()
        assert [(item.product_id, item.quantity, item.unit_price_bani) for item in items] == [
            (1, 2, 35_000), (2, 1, 10_000)
        ]
        db.get(Product, 1).price_bani = 99_000
        db.commit()
        assert db.get(OrderItem, (1, 1)).unit_price_bani == 35_000


def test_order_at_minimum_is_accepted(api):
    client, _ = api
    payload = valid_order() | {"items": [{"product_id": 2, "quantity": 6}]}
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 201
    assert response.json()["total_bani"] == 60_000


def test_order_and_items_roll_back_if_an_item_cannot_be_saved(api):
    client, engine = api
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TRIGGER fail_order_item BEFORE INSERT ON order_items
            BEGIN SELECT RAISE(ABORT, 'test failure'); END
        """))
    with pytest.raises(IntegrityError):
        client.post("/api/orders", json=valid_order())
    with Session(engine) as db:
        assert db.scalars(select(Order)).all() == []
        assert db.scalars(select(OrderItem)).all() == []


def test_admin_product_endpoints_require_token(api, monkeypatch):
    client, _ = api
    monkeypatch.delenv("ADMIN_API_TOKEN", raising=False)
    assert client.get("/api/admin/products").status_code == 503
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    for method, path, body in [
        ("GET", "/api/admin/products", None),
        ("POST", "/api/admin/products", {}),
        ("PATCH", "/api/admin/products/1", {}),
        ("DELETE", "/api/admin/products/1", None),
    ]:
        assert client.request(method, path, json=body).status_code == 401
        assert client.request(method, path, json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/admin/products", headers={"Authorization": "Bearer test-secret"}).status_code == 200


def test_admin_product_lifecycle_and_order_price_snapshot(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    payload = {
        "name": "Sarmale", "description": "500 g", "category": "traditional", "price_bani": 60_000,
        "storage_type": "pending_validation", "sku": "SARM-500", "net_weight_g": 500,
        "production_cost_bani": 20_000,
    }
    created = client.post("/api/admin/products", json=payload, headers=headers)
    assert created.status_code == 201
    product = created.json()
    product_id = product["id"]
    assert product["demo_only"] and not product["available"]
    assert product["production_cost_bani"] == 20_000
    assert product_id not in [item["id"] for item in client.get("/api/products").json()]
    assert client.post("/api/admin/products", json=payload, headers=headers).status_code == 409
    assert client.patch(f"/api/admin/products/{product_id}", json={"name": None}, headers=headers).status_code == 422

    approved = client.patch(f"/api/admin/products/{product_id}", json={
        "available": True, "demo_only": False, "storage_type": "chilled"
    }, headers=headers)
    assert approved.status_code == 200
    order_payload = valid_order() | {"items": [{"product_id": product_id, "quantity": 1}]}
    first = client.post("/api/orders", json=order_payload)
    assert first.status_code == 201 and first.json()["total_bani"] == 60_000
    assert client.patch(f"/api/admin/products/{product_id}", json={"price_bani": 75_000}, headers=headers).status_code == 200
    second = client.post("/api/orders", json=order_payload)
    assert second.status_code == 201 and second.json()["total_bani"] == 75_000
    with Session(engine) as db:
        assert db.get(OrderItem, (first.json()["id"], product_id)).unit_price_bani == 60_000
        assert db.get(OrderItem, (second.json()["id"], product_id)).unit_price_bani == 75_000
    assert client.delete(f"/api/admin/products/{product_id}", headers=headers).status_code == 204
    assert client.post("/api/orders", json=order_payload).status_code == 400
    assert client.get("/api/admin/products", headers=headers).json()[-1]["available"] is False


def test_admin_browser_preflight_allows_token(api):
    client, _ = api
    response = client.options("/api/admin/products", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 200


def test_zone_administration_and_fee_snapshot(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    assert client.get("/api/admin/delivery-zones").status_code == 401
    assert client.post("/api/admin/delivery-zones", json={}, headers={}).status_code == 401
    assert client.patch("/api/admin/delivery-zones/1", json={}, headers={}).status_code == 401
    created = client.post("/api/admin/delivery-zones", headers=headers, json={
        "city": "Chișinău", "name": "Buiucani Nord", "parent_zone_id": 1,
        "active": True, "minimum_basket_bani": 70_000, "delivery_fee_bani": 5_000,
    })
    assert created.status_code == 201
    zone_id = created.json()["id"]
    now = datetime.now(timezone.utc)
    with Session(engine) as db:
        window = DeliveryWindow(zone_id=zone_id, delivery_at=now + timedelta(days=3),
                                ordering_cutoff=now + timedelta(days=2))
        db.add(window)
        db.commit()
        window_id = window.id

    base = valid_order() | {"zone_id": zone_id, "delivery_window_id": window_id}
    below = base | {"items": [{"product_id": 1, "quantity": 1}, {"product_id": 2, "quantity": 3}]}
    assert client.post("/api/orders", json=below).status_code == 400  # Fee does not count toward minimum.
    first = client.post("/api/orders", json=base)
    assert first.status_code == 201
    assert first.json()["subtotal_bani"] == 80_000
    assert first.json()["delivery_fee_bani"] == 5_000
    assert first.json()["total_bani"] == 85_000
    assert client.patch(f"/api/admin/delivery-zones/{zone_id}", headers=headers,
                        json={"delivery_fee_bani": 7_000}).status_code == 200
    with Session(engine) as db:
        order = db.get(Order, first.json()["id"])
        assert (order.subtotal_bani, order.delivery_fee_bani, order.total_bani) == (80_000, 5_000, 85_000)

    assert client.patch("/api/admin/delivery-zones/1", headers=headers, json={"active": False}).status_code == 200
    assert zone_id not in [zone["id"] for zone in client.get("/api/delivery-zones").json()]
    assert client.get("/api/delivery-windows", params={"zone_id": zone_id}).json() == []
    assert client.post("/api/orders", json=base).status_code == 400
    with Session(engine) as db:
        assert db.get(Order, first.json()["id"]) is not None


def test_zone_hierarchy_validation(api, monkeypatch):
    client, _ = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    body = {"city": "Chișinău", "name": "Subzone", "parent_zone_id": 1}
    child = client.post("/api/admin/delivery-zones", json=body, headers=headers).json()
    assert client.post("/api/admin/delivery-zones", json=body | {"parent_zone_id": child["id"]}, headers=headers).status_code == 400
    assert client.post("/api/admin/delivery-zones", json=body | {"city": "Bălți"}, headers=headers).status_code == 400
    assert client.patch("/api/admin/delivery-zones/1", json={"parent_zone_id": child["id"]}, headers=headers).status_code == 400


def test_order_map_filters_and_manual_location_review(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    point = valid_order() | {"latitude": 47.04, "longitude": 28.86,
                             "delivery_instructions": "Intrarea de test"}
    located = client.post("/api/orders", json=point)
    unlocated = client.post("/api/orders", json=valid_order())
    assert located.status_code == unlocated.status_code == 201
    located_id, unlocated_id = located.json()["id"], unlocated.json()["id"]
    assert client.get("/api/admin/orders/map").status_code == 401
    assert client.patch(f"/api/admin/orders/{located_id}/location", json={}).status_code == 401
    response = client.get("/api/admin/orders/map", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert [order["id"] for order in data["markers"]] == [located_id]
    assert [order["id"] for order in data["unlocated"]] == [unlocated_id]
    marker = data["markers"][0]
    assert (marker["latitude"], marker["longitude"]) == (47.04, 28.86)
    assert marker["location_verification_status"] == "unverified"
    assert marker["coordinate_source"] == "manual_map_pin"
    assert marker["delivery_instructions"] == "Intrarea de test"
    assert "phone" not in marker and "customer_name" not in marker

    with Session(engine) as db:
        delivery_day = db.get(DeliveryWindow, 1).delivery_at.date().isoformat()
    matching = {"city": "Chișinău", "zone_id": 1, "window_id": 1, "date": delivery_day, "status": "requested"}
    assert len(client.get("/api/admin/orders/map", params=matching, headers=headers).json()["markers"]) == 1
    assert client.get("/api/admin/orders/map", params=matching | {"zone_id": 2}, headers=headers).json() == {"markers": [], "unlocated": []}
    assert client.get("/api/admin/orders/map", params=matching | {"status": "delivered"}, headers=headers).json() == {"markers": [], "unlocated": []}
    assert [order["id"] for order in client.get("/api/admin/orders/map", params={"location_status": "unlocated"}, headers=headers).json()["unlocated"]] == [unlocated_id]

    marked = client.patch(f"/api/admin/orders/{located_id}/location", headers=headers, json={
        "location_verification_status": "flagged", "location_review_note": "Sector de verificat"
    })
    assert marked.status_code == 200 and marked.json()["location_verification_status"] == "flagged"
    assert marked.json()["location_review_note"] == "Sector de verificat"
    moved = client.patch(f"/api/admin/orders/{located_id}/location", headers=headers, json={"latitude": 47.05, "longitude": 28.87})
    assert moved.status_code == 200
    assert moved.json()["coordinate_source"] == "admin" and moved.json()["location_verification_status"] == "unverified"
    verified = client.patch(f"/api/admin/orders/{located_id}/location", headers=headers, json={"location_verification_status": "verified"})
    assert verified.status_code == 200 and verified.json()["location_verification_status"] == "verified"
    cleared = client.patch(f"/api/admin/orders/{located_id}/location", headers=headers, json={"latitude": None, "longitude": None})
    assert cleared.status_code == 200 and cleared.json()["location_verification_status"] == "unlocated"
    assert client.patch(f"/api/admin/orders/{located_id}/location", headers=headers, json={"location_verification_status": "verified"}).status_code == 400
    assert client.patch(f"/api/admin/orders/{located_id}/location", headers=headers, json={"latitude": 47}).status_code == 422


@pytest.mark.parametrize("changes", [
    {"latitude": 47.0}, {"longitude": 28.0}, {"latitude": 91, "longitude": 28},
    {"latitude": 47, "longitude": -181}, {"coordinate_source": "manual_map_pin"},
])
def test_order_rejects_invalid_coordinates(api, changes):
    client, engine = api
    assert client.post("/api/orders", json=valid_order() | changes).status_code == 422
    with Session(engine) as db:
        assert db.scalars(select(Order)).all() == []


@pytest.mark.parametrize("changes, expected_status", [
    ({"items": [{"product_id": 1, "quantity": 1}]}, 400),
    ({"items": [{"product_id": 1, "quantity": 0}]}, 422),
    ({"items": [{"product_id": 1, "quantity": -1}]}, 422),
    ({"items": [{"product_id": 1, "quantity": 1.5}]}, 422),
    ({"items": [{"product_id": 99, "quantity": 2}]}, 400),
    ({"items": [{"product_id": 3, "quantity": 2}]}, 400),
    ({"items": [{"product_id": 4, "quantity": 2}]}, 400),
    ({"items": [{"product_id": 1, "quantity": 1}, {"product_id": 1, "quantity": 1}]}, 422),
    ({"zone_id": 3}, 400),
    ({"delivery_window_id": 2}, 400),
    ({"delivery_window_id": 3}, 400),
    ({"delivery_window_id": 99}, 400),
    ({"customer_name": "   "}, 422),
    ({"phone": "123"}, 422),
    ({"address": " "}, 422),
    ({"items": []}, 422),
])
def test_invalid_order_is_rejected_without_saving(api, changes, expected_status):
    client, engine = api
    response = client.post("/api/orders", json=valid_order() | changes)
    assert response.status_code == expected_status
    with Session(engine) as db:
        assert db.scalars(select(Order)).all() == []
        assert db.scalars(select(OrderItem)).all() == []
