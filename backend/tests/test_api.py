import csv
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from PIL import Image

from app.database import Base, get_db
from app.main import app
from app.models import DeliveryBatch, DeliveryWindow, DeliveryZone, Order, OrderItem, Product
from app import image_storage


@pytest.fixture
def api(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

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


class FakeImageStorage:
    def __init__(self):
        self.objects = {}
        self.fail_on_detail = False

    def put(self, key, content):
        if self.fail_on_detail and key.endswith("detail.webp"):
            raise OSError("storage unavailable")
        self.objects[key] = content
        return "https://images.example.test/" + key

    def delete(self, key):
        self.objects.pop(key, None)


def make_image(size=(20, 20), image_format="PNG"):
    result = io.BytesIO()
    Image.new("RGB", size, "red").save(result, image_format)
    return result.getvalue()


def image_upload(preview=None, detail=None):
    return {"preview": ("preview.png", preview if preview is not None else make_image(), "image/png"),
            "detail": ("detail.png", detail if detail is not None else make_image(), "image/png")}


def test_product_images_lifecycle_and_public_catalog(api, monkeypatch):
    client, _ = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    storage = FakeImageStorage()
    monkeypatch.setattr(image_storage, "get_image_storage", lambda: storage)
    headers = {"Authorization": "Bearer test-secret"}
    assert client.post("/api/admin/products/1/images", files=image_upload()).status_code == 401
    assert client.delete("/api/admin/products/1/images").status_code == 401
    response = client.post("/api/admin/products/1/images", headers=headers, files=image_upload())
    assert response.status_code == 200
    urls = response.json()
    assert urls["image_preview_url"].endswith("/preview.webp")
    assert urls["image_detail_url"].endswith("/detail.webp")
    assert len(storage.objects) == 2
    assert all(Image.open(io.BytesIO(content)).format == "WEBP" for content in storage.objects.values())
    listed = client.get("/api/products").json()[0]
    assert listed["image_preview_url"] == urls["image_preview_url"]
    assert "image_detail_url" not in listed and "image_preview_key" not in listed
    assert client.get("/api/products/1").json()["image_detail_url"] == urls["image_detail_url"]
    assert client.get("/api/products/4").status_code == 404
    replaced = client.post("/api/admin/products/1/images", headers=headers, files=image_upload()).json()
    assert replaced["image_preview_url"] != urls["image_preview_url"] and len(storage.objects) == 2
    assert client.delete("/api/admin/products/1/images", headers=headers).status_code == 204
    assert len(storage.objects) == 0
    assert client.get("/api/products/1").json()["image_detail_url"] is None


def test_product_images_validation_and_failed_replacement(api, monkeypatch):
    client, _ = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    storage = FakeImageStorage()
    monkeypatch.setattr(image_storage, "get_image_storage", lambda: storage)
    headers = {"Authorization": "Bearer test-secret"}
    path = "/api/admin/products/1/images"
    original = client.post(path, headers=headers, files=image_upload()).json()
    old_objects = storage.objects.copy()
    assert client.post(path, headers=headers, files=image_upload(preview=b"<svg></svg>")).status_code == 422
    assert client.post(path, headers=headers, files=image_upload(preview=make_image((321, 1)))).status_code == 422
    assert client.post(path, headers=headers, files=image_upload(detail=make_image((1281, 1)))).status_code == 422
    assert client.post(path, headers=headers, files=image_upload(preview=b"x" * (1024 * 1024 + 1))).status_code == 413
    assert client.post(path, headers=headers, files=image_upload(detail=make_image()[:20])).status_code == 422
    storage.fail_on_detail = True
    assert client.post(path, headers=headers, files=image_upload()).status_code == 503
    assert storage.objects == old_objects
    assert client.get("/api/products/1").json()["image_preview_url"] == original["image_preview_url"]


def test_unconfigured_image_storage(api, monkeypatch):
    client, _ = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    monkeypatch.delenv("IMAGE_STORAGE_BUCKET", raising=False)
    response = client.post("/api/admin/products/1/images", headers={"Authorization": "Bearer test-secret"}, files=image_upload())
    assert response.status_code == 503
    assert client.get("/api/products/1").json()["image_preview_url"] is None


@pytest.mark.parametrize("image_format", ["JPEG", "PNG", "WEBP"])
def test_product_images_accept_supported_formats(api, monkeypatch, image_format):
    client, _ = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    storage = FakeImageStorage()
    monkeypatch.setattr(image_storage, "get_image_storage", lambda: storage)
    data = make_image(image_format=image_format)
    response = client.post("/api/admin/products/1/images", headers={"Authorization": "Bearer test-secret"},
                           files=image_upload(preview=data, detail=data))
    assert response.status_code == 200


def test_s3_adapter_uses_configured_bucket_and_content_type(monkeypatch):
    from unittest.mock import Mock

    client = Mock()
    make_client = Mock(return_value=client)
    monkeypatch.setattr(image_storage.boto3, "client", make_client)
    for key, value in {"IMAGE_STORAGE_BUCKET": "products", "IMAGE_STORAGE_ACCESS_KEY_ID": "key",
                       "IMAGE_STORAGE_SECRET_ACCESS_KEY": "secret", "IMAGE_STORAGE_REGION": "auto",
                       "IMAGE_STORAGE_ENDPOINT": "https://storage.example.test",
                       "IMAGE_PUBLIC_BASE_URL": "https://images.example.test"}.items():
        monkeypatch.setenv(key, value)
    storage = image_storage.get_image_storage()
    assert storage.put("products/1/photo.webp", b"image") == "https://images.example.test/products/1/photo.webp"
    client.put_object.assert_called_once_with(Bucket="products", Key="products/1/photo.webp", Body=b"image", ContentType="image/webp")
    storage.delete("products/1/photo.webp")
    client.delete_object.assert_called_once_with(Bucket="products", Key="products/1/photo.webp")
    assert make_client.call_args.kwargs["endpoint_url"] == "https://storage.example.test"


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


@pytest.mark.parametrize("first_type,second_type", [
    ("fresh", "frozen"), ("fresh", "chilled"), ("chilled", "frozen"),
])
def test_order_rejects_mixed_storage_without_reserving_capacity(api, first_type, second_type):
    client, engine = api
    with Session(engine) as db:
        db.get(Product, 1).storage_type = first_type
        db.get(Product, 2).storage_type = second_type
        db.commit()
    response = client.post("/api/orders", json=valid_order())
    assert response.status_code == 400
    assert response.json()["detail"] == "Products with different storage types must be ordered separately"
    with Session(engine) as db:
        assert db.scalars(select(Order)).all() == []
        assert db.scalars(select(OrderItem)).all() == []
        assert db.get(DeliveryWindow, 1).reserved_orders == 0


@pytest.mark.parametrize("include_other_product", [False, True])
def test_order_rejects_unvalidated_storage_without_reserving_capacity(api, include_other_product):
    client, engine = api
    with Session(engine) as db:
        db.get(Product, 1).storage_type = "pending_validation"
        db.commit()
    payload = valid_order()
    if not include_other_product:
        payload["items"] = [{"product_id": 1, "quantity": 2}]
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "One or more products have unvalidated storage requirements"
    with Session(engine) as db:
        assert db.scalars(select(Order)).all() == []
        assert db.get(DeliveryWindow, 1).reserved_orders == 0


@pytest.mark.parametrize("storage_type", ["fresh", "chilled", "frozen"])
def test_order_with_one_storage_type_can_be_batched(api, monkeypatch, storage_type):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    with Session(engine) as db:
        db.get(Product, 1).storage_type = storage_type
        db.get(Product, 2).storage_type = storage_type
        db.commit()
    order = client.post("/api/orders", json=valid_order())
    assert order.status_code == 201
    batch = client.post("/api/admin/batches", headers={"Authorization": "Bearer test-secret"}, json={
        "zone_id": 1, "delivery_window_id": 1, "order_ids": [order.json()["id"]],
    })
    assert batch.status_code == 201
    assert batch.json()["storage_type"] == storage_type


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
        assert db.get(DeliveryWindow, 1).reserved_orders == 0


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


def test_admin_order_list_and_detail_before_and_after_batching(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    first_id = client.post("/api/orders", json=valid_order()).json()["id"]
    second_id = client.post("/api/orders", json=valid_order() | {"customer_name": "Maria"}).json()["id"]
    with Session(engine) as db:
        product = db.get(Product, 1)
        product.name = "Renamed meal"
        product.price_bani = 99_000
        db.commit()

    for path in ("/api/admin/orders", f"/api/admin/orders/{first_id}"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/admin/orders/9999", headers=headers).status_code == 404
    detail = client.get(f"/api/admin/orders/{first_id}", headers=headers)
    assert detail.status_code == 200
    body = detail.json()
    assert (body["customer_name"], body["phone"], body["address"]) == ("Ana", "+373 600 00000", "Test street 1")
    assert body["delivery_batch_id"] is None and body["status"] == "requested"
    assert body["total_bani"] == 80_000 and body["created_at"].endswith("Z") and body["delivery_at"].endswith("Z")
    assert body["items"][0] == {
        "product_id": 1, "product_name": "Renamed meal", "product_sku": None, "quantity": 2,
        "unit_price_bani": 35_000, "line_total_bani": 70_000, "storage_type_snapshot": "fresh",
        "net_weight_g_snapshot": None, "unit_snapshot": "pack",
    }
    listing = client.get("/api/admin/orders", headers=headers).json()
    assert [item["id"] for item in listing] == [second_id, first_id]
    assert "phone" not in listing[0] and "address" not in listing[0]
    assert client.get("/api/admin/orders", params={"limit": 1, "offset": 1}, headers=headers).json()[0]["id"] == first_id
    assert client.get("/api/admin/orders", params={"limit": 101}, headers=headers).status_code == 422
    assert [item["id"] for item in client.get("/api/admin/orders", params={"zone_id": 1, "window_id": 1,
                 "status": "requested", "is_demo": False, "unbatched": True}, headers=headers).json()] == [second_id, first_id]
    assert client.get("/api/admin/orders", params={"zone_id": 2}, headers=headers).json() == []
    assert client.get("/api/admin/orders", params={"is_demo": True}, headers=headers).json() == []

    batch = client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 1, "delivery_window_id": 1, "order_ids": [first_id],
    }).json()
    assert [item["id"] for item in client.get("/api/admin/orders", params={"unbatched": True}, headers=headers).json()] == [second_id]
    assert [item["id"] for item in client.get("/api/admin/orders", params={"batch_id": batch["id"]}, headers=headers).json()] == [first_id]
    assert client.get(f"/api/admin/orders/{first_id}", headers=headers).json()["delivery_batch_id"] == batch["id"]
    assert client.get("/api/admin/orders/map", headers=headers).status_code == 200


@pytest.mark.parametrize("changes", [
    {"latitude": 47.0}, {"longitude": 28.0}, {"latitude": 91, "longitude": 28},
    {"latitude": 47, "longitude": -181}, {"coordinate_source": "manual_map_pin"},
])
def test_order_rejects_invalid_coordinates(api, changes):
    client, engine = api
    assert client.post("/api/orders", json=valid_order() | changes).status_code == 422
    with Session(engine) as db:
        assert db.scalars(select(Order)).all() == []


def test_batch_creation_summary_map_and_duplicate_assignment(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    with Session(engine) as db:
        db.get(Product, 1).net_weight_g = 500
        db.get(Product, 2).net_weight_g = 1000
        db.commit()
    first = client.post("/api/orders", json=valid_order()).json()["id"]
    second = client.post("/api/orders", json=valid_order() | {"latitude": 47.04, "longitude": 28.86}).json()["id"]
    body = {"zone_id": 1, "delivery_window_id": 1, "order_ids": [first, second]}
    assert client.get("/api/admin/batches").status_code == 401
    assert client.post("/api/admin/batches", json=body).status_code == 401
    created = client.post("/api/admin/batches", json=body, headers=headers)
    assert created.status_code == 201
    batch = created.json()
    assert batch["storage_type"] == "fresh" and batch["status"] == "planned"
    assert batch["order_ids"] == [first, second]
    batch_id = batch["id"]
    assert client.get(f"/api/admin/batches/{batch_id}", headers=headers).json()["order_ids"] == [first, second]
    assert client.get(f"/api/admin/batches/{batch_id}/summary", headers=headers).json() == {
        "batch_id": batch_id, "is_demo": False, "household_count": 2, "total_item_quantity": 6,
        "total_sales_bani": 160_000, "total_weight_g": 4000, "known_weight_g": 4000,
    }
    map_data = client.get("/api/admin/orders/map", params={"batch_id": batch_id}, headers=headers).json()
    assert map_data["markers"][0]["delivery_batch_id"] == batch_id
    assert map_data["unlocated"][0]["delivery_batch_id"] == batch_id
    assert client.post("/api/admin/batches", json=body, headers=headers).status_code == 409
    assert len(client.get("/api/admin/batches", headers=headers).json()) == 1


def test_batch_rejects_incompatible_or_unknown_storage_and_windows(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    mixed_id = client.post("/api/orders", json=valid_order()).json()["id"]
    with Session(engine) as db:
        # Simulate an older order accepted before checkout enforced storage compatibility.
        db.get(OrderItem, (mixed_id, 2)).storage_type_snapshot = "frozen"
        db.commit()
    body = {"zone_id": 1, "delivery_window_id": 1, "order_ids": [mixed_id]}
    assert client.post("/api/admin/batches", json=body, headers=headers).status_code == 400

    order_id = client.post("/api/orders", json=valid_order()).json()["id"]
    assert client.post("/api/admin/batches", json=body | {"zone_id": 2, "order_ids": [order_id]}, headers=headers).status_code == 400
    assert client.post("/api/admin/batches", json=body | {"order_ids": [order_id, 999]}, headers=headers).status_code == 400
    assert client.post("/api/admin/batches", json=body | {"order_ids": [order_id, order_id]}, headers=headers).status_code == 422
    with Session(engine) as db:
        item = db.get(OrderItem, (order_id, 1))
        item.storage_type_snapshot = None
        db.commit()
    assert client.post("/api/admin/batches", json=body | {"order_ids": [order_id]}, headers=headers).status_code == 400
    assert client.get("/api/admin/batches", headers=headers).json() == []


def test_batch_uses_order_storage_and_weight_snapshots(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    order_id = client.post("/api/orders", json=valid_order()).json()["id"]
    with Session(engine) as db:
        db.get(Product, 1).storage_type = "frozen"
        db.get(Product, 1).net_weight_g = 500
        db.commit()
    response = client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 1, "delivery_window_id": 1, "order_ids": [order_id],
    })
    assert response.status_code == 201 and response.json()["storage_type"] == "fresh"
    summary = client.get(f"/api/admin/batches/{response.json()['id']}/summary", headers=headers).json()
    assert summary["total_weight_g"] is None and summary["known_weight_g"] == 0


def test_production_totals_keep_order_units_and_report_unknown_weights(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    with Session(engine) as db:
        product = db.get(Product, 1)
        product.net_weight_g = 500
        product.unit = "pack"
        db.commit()
    first_id = client.post("/api/orders", json=valid_order()).json()["id"]
    with Session(engine) as db:
        product = db.get(Product, 1)
        product.net_weight_g = 700
        product.unit = "piece"
        db.commit()
    second_payload = valid_order() | {"items": [{"product_id": 1, "quantity": 2}]}
    second_id = client.post("/api/orders", json=second_payload).json()["id"]
    with Session(engine) as db:
        product = db.get(Product, 1)
        product.net_weight_g = 5000
        product.unit = "kg"
        # Simulate an order created before unit snapshots were introduced.
        db.get(OrderItem, (first_id, 2)).unit_snapshot = None
        db.commit()
    batch = client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 1, "delivery_window_id": 1, "order_ids": [first_id, second_id],
    }).json()
    path = f"/api/admin/batches/{batch['id']}/production"
    assert client.get(path).status_code == 401
    data = client.get(path, headers=headers).json()
    assert data["batch_id"] == batch["id"]
    by_product_and_unit = {(row["product_id"], row["unit"]): row for row in data["products"]}
    assert by_product_and_unit[(1, "pack")]["quantity"] == 2
    assert by_product_and_unit[(1, "pack")]["total_weight_g"] == 1000
    assert by_product_and_unit[(1, "piece")]["quantity"] == 2
    assert by_product_and_unit[(1, "piece")]["total_weight_g"] == 1400
    assert by_product_and_unit[(2, None)]["quantity"] == 1
    assert by_product_and_unit[(2, None)]["total_weight_g"] is None
    assert client.get("/api/admin/batches/999/production", headers=headers).status_code == 404


def test_financial_estimates_require_complete_assumptions(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    first_id = client.post("/api/orders", json=valid_order()).json()["id"]
    second_id = client.post("/api/orders", json=valid_order()).json()["id"]
    batch_id = client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 1, "delivery_window_id": 1, "order_ids": [first_id, second_id],
    }).json()["id"]
    path = f"/api/admin/batches/{batch_id}"
    assert client.get(f"{path}/financial-summary").status_code == 401
    assert client.patch(f"{path}/costs", json={}).status_code == 401
    partial = client.get(f"{path}/financial-summary", headers=headers).json()
    assert partial["estimate_complete"] is False
    assert partial["revenue_bani"] == 160_000
    assert partial["estimated_food_cost_bani"] is None
    assert partial["contribution_before_overhead_bani"] is None
    assert {item["product_id"] for item in partial["unpriced_products"]} == {1, 2}
    assert client.patch(f"{path}/costs", headers=headers, json={"estimated_transport_bani": -1}).status_code == 422
    assert client.patch(f"{path}/costs", headers=headers, json={"estimate_kind": "actual"}).status_code == 422

    with Session(engine) as db:
        db.get(Product, 1).production_cost_bani = 10_000
        db.get(Product, 2).production_cost_bani = 2_500
        db.commit()
    config = {"estimate_kind": "demo", "estimated_transport_bani": 30_001,
              "estimated_packaging_per_order_bani": 3_000}
    assert client.patch(f"{path}/costs", headers=headers, json=config).status_code == 200
    summary = client.get(f"{path}/financial-summary", headers=headers).json()
    assert summary["estimate_complete"] is True and summary["estimate_kind"] == "demo"
    assert summary["estimated_food_cost_bani"] == 45_000
    assert summary["estimated_packaging_cost_bani"] == 6_000
    assert summary["delivery_cost_per_household_bani"] == 15_001
    assert summary["contribution_before_overhead_bani"] == 78_999
    assert summary["orders_needed_to_cover_transport"] == 1
    assert summary["transport_break_even_possible"] is True
    assert summary["unpriced_products"] == []

    with Session(engine) as db:
        db.get(Product, 1).unit = "piece"
        db.commit()
    changed = client.get(f"{path}/financial-summary", headers=headers).json()
    assert changed["estimate_complete"] is False
    assert changed["known_food_cost_bani"] == 5_000
    assert changed["unpriced_products"] == [{"product_id": 1, "reason": "unit_or_weight_changed"}]
    assert changed["contribution_before_overhead_bani"] is None


def test_financial_break_even_for_negative_margin(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    order_id = client.post("/api/orders", json=valid_order()).json()["id"]
    batch_id = client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 1, "delivery_window_id": 1, "order_ids": [order_id],
    }).json()["id"]
    with Session(engine) as db:
        db.get(Product, 1).production_cost_bani = 40_000
        db.get(Product, 2).production_cost_bani = 1
        db.commit()
    path = f"/api/admin/batches/{batch_id}"
    client.patch(f"{path}/costs", headers=headers, json={"estimate_kind": "operational",
                 "estimated_transport_bani": 1000, "estimated_packaging_per_order_bani": 0})
    summary = client.get(f"{path}/financial-summary", headers=headers).json()
    assert summary["estimate_complete"] is True
    assert summary["transport_break_even_possible"] is False
    assert summary["orders_needed_to_cover_transport"] is None
    assert summary["contribution_before_overhead_bani"] == -1001


def test_packing_manifest_and_csv_exports(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    with Session(engine) as db:
        product = db.get(Product, 1)
        product.name = "=Preparat"
        product.net_weight_g = 500
        db.commit()
    payload = valid_order() | {"customer_name": "=Test", "address": "=Adresă de test",
                               "latitude": 47.04, "longitude": 28.86,
                               "delivery_instructions": "La intrare"}
    order_id = client.post("/api/orders", json=payload).json()["id"]
    batch_id = client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 1, "delivery_window_id": 1, "order_ids": [order_id],
    }).json()["id"]
    path = f"/api/admin/batches/{batch_id}"
    for endpoint in ("packing-list", "delivery-manifest", "exports/orders.csv", "exports/production.csv"):
        assert client.get(f"{path}/{endpoint}").status_code == 401
        assert client.get(f"/api/admin/batches/999/{endpoint}", headers=headers).status_code == 404

    packing = client.get(f"{path}/packing-list", headers=headers).json()
    assert packing["orders"][0]["order_id"] == order_id
    items = packing["orders"][0]["items"]
    assert [(item["product_id"], item["quantity"], item["unit"]) for item in items] == [(1, 2, "pack"), (2, 1, "pack")]
    assert items[0]["net_weight_g"] == 500
    stop = client.get(f"{path}/delivery-manifest", headers=headers).json()["stops"][0]
    assert (stop["address"], stop["latitude"], stop["delivery_instructions"]) == ("=Adresă de test", 47.04, "La intrare")

    response = client.get(f"{path}/exports/orders.csv", headers=headers)
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    order_rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert order_rows[0]["customer_name"] == "'=Test"
    assert order_rows[0]["address"] == "'=Adresă de test"
    assert order_rows[0]["phone"].startswith("'+373")
    assert order_rows[0]["total_bani"] == "80000"

    response = client.get(f"{path}/exports/production.csv", headers=headers)
    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert rows[0]["name"] == "'=Preparat"
    assert (rows[0]["quantity"], rows[0]["unit"], rows[0]["total_weight_g"]) == ("2", "pack", "1000")
    assert rows[1]["total_weight_g"] == ""


def test_admin_windows_and_capacity_limit(api, monkeypatch):
    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    now = datetime.now(timezone.utc)
    payload = {"zone_id": 1, "delivery_at": (now + timedelta(days=4)).isoformat(),
               "ordering_cutoff": (now + timedelta(days=3)).isoformat(), "capacity": 1}
    assert client.get("/api/admin/delivery-windows").status_code == 401
    assert client.post("/api/admin/delivery-windows", json=payload).status_code == 401
    assert client.post("/api/admin/delivery-windows", headers=headers, json=payload | {"capacity": 0}).status_code == 422
    assert client.post("/api/admin/delivery-windows", headers=headers, json=payload | {"delivery_at": "2030-01-01T12:00:00"}).status_code == 422
    created = client.post("/api/admin/delivery-windows", headers=headers, json=payload)
    assert created.status_code == 201
    window_id = created.json()["id"]
    assert created.json()["reserved_orders"] == 0 and created.json()["capacity"] == 1
    assert created.json()["delivery_at"].endswith("Z")
    order = valid_order() | {"delivery_window_id": window_id}
    assert client.post("/api/orders", json=order).status_code == 201
    assert window_id not in [w["id"] for w in client.get("/api/delivery-windows", params={"zone_id": 1}).json()]
    assert client.post("/api/orders", json=order).status_code == 400
    assert client.patch(f"/api/admin/delivery-windows/{window_id}", headers=headers,
                        json={"delivery_at": (now + timedelta(days=5)).isoformat()}).status_code == 409
    assert client.patch(f"/api/admin/delivery-windows/{window_id}", headers=headers, json={"capacity": 2}).status_code == 200
    assert client.post("/api/orders", json=order).status_code == 201
    assert client.patch(f"/api/admin/delivery-windows/{window_id}", headers=headers, json={"capacity": 1}).status_code == 409
    assert client.patch(f"/api/admin/delivery-windows/{window_id}", headers=headers, json={"active": False}).status_code == 200
    assert client.post("/api/orders", json=order).status_code == 400
    windows = client.get("/api/admin/delivery-windows", params={"zone_id": 1}, headers=headers).json()
    actual = next(window for window in windows if window["id"] == window_id)
    assert actual["reserved_orders"] == 2 and actual["active"] is False
    with Session(engine) as db:
        assert db.get(DeliveryWindow, window_id).reserved_orders == 2


def test_admin_order_status_transitions(api, monkeypatch):
    client, _ = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    order_id = client.post("/api/orders", json=valid_order()).json()["id"]
    path = f"/api/admin/orders/{order_id}/status"
    assert client.patch(path, json={"status": "confirmed"}).status_code == 401
    assert client.patch(path, headers=headers, json={"status": "delivered"}).status_code == 409
    for value in ("confirmed", "packed", "dispatched", "delivered"):
        response = client.patch(path, headers=headers, json={"status": value})
        assert response.status_code == 200 and response.json() == {"id": order_id, "status": value}
    assert client.patch(path, headers=headers, json={"status": "delivered"}).status_code == 200
    assert client.patch(path, headers=headers, json={"status": "requested"}).status_code == 409
    assert client.patch(path, headers=headers, json={"status": "cancelled"}).status_code == 422


def test_simultaneous_orders_do_not_exceed_window_capacity(api):
    client, engine = api
    with Session(engine) as db:
        db.get(DeliveryWindow, 1).capacity = 1
        db.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/api/orders", json=valid_order()), range(2)))
    assert sorted(response.status_code for response in responses) == [201, 400]
    with Session(engine) as db:
        assert len(db.scalars(select(Order)).all()) == 1
        assert db.get(DeliveryWindow, 1).reserved_orders == 1


def test_demo_dataset_is_isolated_batchable_and_resettable(api, monkeypatch):
    from app.seed_demo_orders import DATASET_KEY, seed_demo

    client, engine = api
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}
    real_id = client.post("/api/orders", json=valid_order()).json()["id"]
    with Session(engine, autoflush=False) as db:
        db.add(DeliveryZone(id=4, city="Chișinău", neighborhood="Rîșcani", active=True))
        db.commit()
        assert seed_demo(db) == 50
        assert seed_demo(db) == 0
        demo = db.scalars(select(Order).where(Order.demo_dataset_key == DATASET_KEY).order_by(Order.id)).all()
        assert len(demo) == 50 and all(order.is_demo and order.coordinate_source == "simulated" for order in demo)
        assert all(order.phone.startswith("DEMO-") and "fictivă" in order.address for order in demo)
        ids = [order.id for order in demo]
        window_id = demo[0].delivery_window_id
        assert db.get(DeliveryWindow, window_id).reserved_orders == 50

    assert client.get("/api/delivery-windows", params={"zone_id": 4}).json() == []
    assert all(not product["sku"] or not product["sku"].startswith("DEMO-") for product in client.get("/api/products").json())
    assert client.post("/api/orders", json=valid_order() | {"zone_id": 4, "delivery_window_id": window_id}).status_code == 400
    map_result = client.get("/api/admin/orders/map", params={"is_demo": True}, headers=headers).json()
    assert len(map_result["markers"]) == 50 and all(order["is_demo"] for order in map_result["markers"])
    assert len(client.get("/api/admin/orders/map", params={"is_demo": False}, headers=headers).json()["unlocated"]) == 1
    demo_orders = client.get("/api/admin/orders", params={"is_demo": True}, headers=headers).json()
    assert len(demo_orders) == 50 and all(order["is_demo"] for order in demo_orders)
    assert [order["id"] for order in client.get("/api/admin/orders", params={"is_demo": False}, headers=headers).json()] == [real_id]
    assert client.get(f"/api/admin/orders/{ids[0]}", headers=headers).json()["is_demo"] is True
    assert client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 4, "delivery_window_id": window_id, "order_ids": [ids[0], real_id],
    }).status_code == 400
    batch_response = client.post("/api/admin/batches", headers=headers, json={
        "zone_id": 4, "delivery_window_id": window_id, "order_ids": ids,
    })
    assert batch_response.status_code == 201
    batch_id = batch_response.json()["id"]
    assert batch_response.json()["is_demo"] is True
    assert client.patch(f"/api/admin/batches/{batch_id}/costs", headers=headers, json={"estimate_kind": "operational"}).status_code == 400
    assert client.patch(f"/api/admin/batches/{batch_id}/costs", headers=headers, json={
        "estimated_transport_bani": 20_000, "estimated_packaging_per_order_bani": 200,
    }).status_code == 200
    summary = client.get(f"/api/admin/batches/{batch_id}/financial-summary", headers=headers).json()
    assert summary["is_demo"] and summary["estimate_kind"] == "demo" and summary["estimate_complete"]
    assert summary["household_count"] == 50

    with Session(engine, autoflush=False) as db:
        assert seed_demo(db, reset=True) == 50
        assert db.get(Order, real_id) is not None and not db.get(Order, real_id).is_demo
        assert db.get(DeliveryBatch, batch_id) is None
        assert len(db.scalars(select(Order).where(Order.demo_dataset_key == DATASET_KEY)).all()) == 50
        assert db.get(DeliveryWindow, window_id).reserved_orders == 50


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
