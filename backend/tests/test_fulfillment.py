from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base, get_db
from app.main import app
from app.models import DeliveryWindow, DeliveryZone, Order, Product


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'groups.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    now = datetime.now(timezone.utc)
    with Session(engine) as db:
        db.add(DeliveryZone(id=1, city="Test", neighborhood="Test", active=True, minimum_basket_bani=0))
        for id_, group in [(1, "meals"), (2, "frozen")]:
            db.add(DeliveryWindow(id=id_, zone_id=1, fulfillment_group=group,
                                  delivery_at=now + timedelta(days=3), ordering_cutoff=now + timedelta(days=2)))
        for id_, group, price, kind, days in [(1, "meals", 59900, "individual_dish", None),
                                               (2, "meals", 60000, "individual_dish", None),
                                               (3, "frozen", 59900, "individual_dish", None),
                                               (4, "frozen", 60000, "individual_dish", None),
                                               (5, "meals", 50000, "meal_plan", 2),
                                               (6, "meals", 75000, "meal_plan", 3)]:
            db.add(Product(id=id_, name=f"Example {id_}", description="Test", category="test", price_bani=price,
                           storage_type="chilled" if group == "meals" else "frozen", available=True, demo_only=False,
                           fulfillment_group=group, preparation_level="ready", product_type=kind,
                           plan_duration_days=days, production_cost_bani=10000))
        db.commit()
    def override():
        with Session(engine, expire_on_commit=False) as db:
            yield db
    app.dependency_overrides[get_db] = override
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    with TestClient(app) as test_client:
        yield test_client, engine
    app.dependency_overrides.clear()
    engine.dispose()


def order(group, item, **kwargs):
    return {"fulfillment_group": group, "customer_name": "Client fictiv", "phone": "060000000",
            "address": "Adresă fictivă", "zone_id": 1, "delivery_window_id": 1 if group == "meals" else 2,
            "items": [{"product_id": item, "quantity": 1}], **kwargs}


@pytest.mark.parametrize("group,low,minimum", [("meals", 1, 2), ("frozen", 3, 4)])
def test_independent_minimum_and_group(client, group, low, minimum):
    api, _ = client
    assert api.post("/api/orders", json=order(group, low)).status_code == 400
    assert api.post("/api/orders", json=order(group, minimum)).status_code == 201
    assert api.post("/api/orders", json=order(group, minimum, delivery_window_id=2 if group == "meals" else 1)).status_code == 400
    assert api.post("/api/orders", json=order(group, 4 if group == "meals" else 2)).status_code == 400


def test_plan_price_and_family_allocations_are_not_double_counted(client):
    api, engine = client
    assert api.post("/api/orders", json=order("meals", 5)).status_code == 400
    assert api.post("/api/orders", json=order("meals", 6)).status_code == 201
    with Session(engine) as db:
        db.get(Product, 6).price_bani = 74999
        db.commit()
    assert api.post("/api/orders", json=order("meals", 6)).status_code == 400
    payload = order("meals", 2, menu_days=2, items=[{"product_id": 2, "quantity": 2, "custom_quantity": 2}],
                    allocations=[{"product_id": 2, "day_index": 1, "member_label": "Adult 1", "quantity": 1, "meal_period": "breakfast"},
                                 {"product_id": 2, "day_index": 2, "member_label": "Copil 1", "quantity": 1, "meal_period": "dinner"}])
    assert api.post("/api/orders", json=payload | {"allocations": payload["allocations"][:1]}).status_code == 422
    invalid = [{**payload["allocations"][0], "meal_period": "brunch"}, payload["allocations"][1]]
    assert api.post("/api/orders", json=payload | {"allocations": invalid}).status_code == 422
    result = api.post("/api/orders", json=payload)
    assert result.status_code == 201
    headers = {"Authorization": "Bearer test-secret"}
    detail = api.get(f"/api/admin/orders/{result.json()['id']}", headers=headers).json()
    assert len(detail["allocations"]) == 2 and detail["items"][0]["quantity"] == 2
    assert [a["meal_period"] for a in detail["allocations"]] == ["breakfast", "dinner"]
    batch = api.post("/api/admin/batches", headers=headers, json={"zone_id": 1, "delivery_window_id": 1, "order_ids": [result.json()["id"]]}).json()
    production = api.get(f"/api/admin/batches/{batch['id']}/production", headers=headers).json()
    finance = api.get(f"/api/admin/batches/{batch['id']}/financial-summary", headers=headers).json()
    assert production["products"][0]["quantity"] == 2
    assert finance["revenue_bani"] == 120000 and finance["known_food_cost_bani"] == 20000


def test_allocation_can_coexist_with_ordinary_quantity_but_must_match_custom_quantity(client):
    api, _ = client
    payload = order("meals", 2, menu_days=3, items=[{"product_id": 2, "quantity": 2, "custom_quantity": 1}],
                    allocations=[{"product_id": 2, "day_index": 3, "member_label": "Adult 1", "quantity": 1}])
    assert api.post("/api/orders", json=payload | {"menu_days": 2}).status_code == 422
    assert api.post("/api/orders", json=payload | {"allocations": [{**payload["allocations"][0], "quantity": 0}]}).status_code == 422
    result = api.post("/api/orders", json=payload)
    assert result.status_code == 201
    detail = api.get(f"/api/admin/orders/{result.json()['id']}", headers={"Authorization": "Bearer test-secret"}).json()
    assert detail["menu_days"] == 3 and detail["items"][0]["quantity"] == 2
    assert detail["items"][0]["custom_quantity"] == 1 and len(detail["allocations"]) == 1
    assert detail["allocations"][0]["meal_period"] is None


def test_group_is_required_and_plan_approval_enforces_price(client):
    api, _ = client
    payload = order("meals", 2)
    del payload["fulfillment_group"]
    assert api.post("/api/orders", json=payload).status_code == 422
    headers = {"Authorization": "Bearer test-secret"}
    product = {"name": "Plan", "description": "Test", "category": "test", "price_bani": 49999,
               "storage_type": "chilled", "fulfillment_group": "meals", "preparation_level": "ready",
               "product_type": "meal_plan", "plan_duration_days": 2, "available": True, "demo_only": False}
    assert api.post("/api/admin/products", json=product, headers=headers).status_code == 400
    assert api.post("/api/admin/products", json=product | {"price_bani": 50000, "preparation_level": "semi_prepared"}, headers=headers).status_code == 400
    assert api.post("/api/admin/products", json=product | {"price_bani": 50000}, headers=headers).status_code == 201


def test_batch_rejects_an_order_with_a_different_group_even_with_same_window(client):
    api, engine = client
    first = api.post("/api/orders", json=order("meals", 2)).json()["id"]
    second = api.post("/api/orders", json=order("meals", 2)).json()["id"]
    with Session(engine) as db:
        db.get(Order, second).fulfillment_group = "frozen"
        db.commit()
    response = api.post("/api/admin/batches", headers={"Authorization": "Bearer test-secret"},
                        json={"zone_id": 1, "delivery_window_id": 1, "order_ids": [first, second]})
    assert response.status_code == 400
