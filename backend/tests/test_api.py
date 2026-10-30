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
    assert [product["id"] for product in products.json()] == [1, 2, 4]
    assert products.json()[-1]["demo_only"] is True
    assert [zone["id"] for zone in client.get("/api/delivery-zones").json()] == [1, 2]
    windows = client.get("/api/delivery-windows", params={"zone_id": 1}).json()
    assert [window["id"] for window in windows] == [1]
    assert windows[0]["delivery_at"].endswith("Z")


def test_order_uses_server_prices_and_saves_items(api):
    client, engine = api
    response = client.post("/api/orders", json=valid_order())
    assert response.status_code == 201
    assert response.json() == {"id": 1, "total_bani": 80_000, "status": "requested"}
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
