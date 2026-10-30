import os
import tempfile
from datetime import date, timedelta

from fastapi import HTTPException
from pydantic import ValidationError
# Set before importing the application, which creates its engine at import time.
test_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
test_db.close()
os.environ["DATABASE_URL"] = f"sqlite:///{test_db.name}"
os.environ.pop("PUBLIC_ORDER_SUBMISSIONS_ENABLED", None)

from app.database import Base, SessionLocal, engine
from app.main import create_order, health
from app.schemas import OrderCreate


def setup_function() -> None:
    Base.metadata.create_all(engine)


def teardown_function() -> None:
    Base.metadata.drop_all(engine)


def valid_order() -> dict[str, object]:
    return {
        "package_id": "family-classic",
        "contact_name": " Alex Family ",
        "email": "ALEX@example.com",
        "phone": "+1 (555) 123-4567",
        "delivery_address": "42 Garden Lane",
        "delivery_city": "Springfield",
        "delivery_postal_code": "12345",
        "delivery_date": (date.today() + timedelta(days=2)).isoformat(),
        "delivery_instructions": " Leave by the side door ",
    }


def test_health_and_public_submissions_disabled_by_default() -> None:
    assert health() == {"status": "ok"}
    payload = OrderCreate.model_validate(valid_order())
    with SessionLocal() as db:
        try:
            create_order(payload, db)
            raise AssertionError("Expected public order submissions to be disabled")
        except HTTPException as error:
            assert error.status_code == 503


def test_order_validation_and_persistence(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_ORDER_SUBMISSIONS_ENABLED", "true")
    invalid_package = valid_order() | {"package_id": "unknown"}
    try:
        OrderCreate.model_validate(invalid_package)
        raise AssertionError("Expected unknown package to be rejected")
    except ValidationError:
        pass

    invalid_date = valid_order() | {"delivery_date": date.today().isoformat()}
    try:
        OrderCreate.model_validate(invalid_date)
        raise AssertionError("Expected same-day delivery to be rejected")
    except ValidationError:
        pass

    payload = OrderCreate.model_validate(valid_order())
    with SessionLocal() as db:
        created = create_order(payload, db)
    assert (created.id, created.package_id) == (1, "family-classic")
    with engine.connect() as connection:
        row = connection.exec_driver_sql("SELECT contact_name, email, delivery_instructions FROM orders WHERE id = 1").one()
    assert row == ("Alex Family", "alex@example.com", "Leave by the side door")
