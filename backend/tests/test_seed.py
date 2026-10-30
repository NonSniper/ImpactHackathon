from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.models import DeliveryWindow, DeliveryZone, Product
from app.seed import seed


def test_seed_is_repeatable_and_replenishes_expired_windows(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    Base.metadata.create_all(engine)
    now = datetime(2026, 10, 30, 12, tzinfo=timezone.utc)
    with Session(engine, autoflush=False) as db:
        seed(db, now)
        seed(db, now)
        products = db.scalars(select(Product)).all()
        zones = db.scalars(select(DeliveryZone)).all()
        windows = db.scalars(select(DeliveryWindow)).all()
        assert len(products) == 8
        assert len([product for product in products if product.category == "meal_plan"]) == 2
        frozen = [product for product in products if product.storage_type == "frozen"]
        assert len(frozen) == 2
        assert all(product.demo_only and not product.available for product in frozen)
        assert {zone.neighborhood for zone in zones} == {"Buiucani", "Botanica"}
        assert len(windows) == 2
        assert {window.zone_id for window in windows} == {zone.id for zone in zones}

        seed(db, now + timedelta(days=10))
        windows = db.scalars(select(DeliveryWindow)).all()
        assert len(windows) == 4
        assert len(db.scalars(select(Product)).all()) == 8
    engine.dispose()
