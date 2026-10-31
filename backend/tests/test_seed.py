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
        assert len(products) == 11
        assert all(product.demo_only and not product.available for product in products)
        assert len([product for product in products if product.category == "meal_plan"]) == 2
        frozen = [product for product in products if product.storage_type == "frozen"]
        assert len(frozen) == 2
        assert all(product.demo_only and not product.available for product in frozen)
        samples = {product.sku: product for product in products if product.sku is not None}
        assert {sku: product.price_bani for sku, product in samples.items()} == {
            "CREDEM-SAR-500": 15_000, "CREDEM-ZRA-500": 20_500, "CREDEM-CAR-500": 9_500,
        }
        assert all(product.demo_only and not product.available and product.net_weight_g == 500
                   and product.storage_type == "pending_validation" for product in samples.values())
        assert {zone.neighborhood for zone in zones} == {"Rîșcani", "Buiucani", "Botanica", "Centru", "Ciocana"}
        assert [zone.neighborhood for zone in zones if zone.active] == ["Rîșcani"]
        assert len(windows) == 1
        assert windows[0].zone_id == next(zone.id for zone in zones if zone.active)

        seed(db, now + timedelta(days=10))
        windows = db.scalars(select(DeliveryWindow)).all()
        assert len(windows) == 2
        assert len(db.scalars(select(Product)).all()) == 11
    engine.dispose()


def test_seed_preserves_existing_product_approval_and_audit_is_read_only(tmp_path):
    from app.audit_seed_products import candidates

    engine = create_engine(f"sqlite:///{tmp_path / 'review.db'}")
    Base.metadata.create_all(engine)
    with Session(engine, autoflush=False) as db:
        seed(db)
        candidate = candidates(db)[0]
        candidate.available = True
        candidate.demo_only = False
        candidate.price_bani = 77_000
        db.commit()
        seed(db)
        reviewed = candidates(db)
        assert len(reviewed) == 6
        assert reviewed[0].available and not reviewed[0].demo_only and reviewed[0].price_bani == 77_000
    engine.dispose()
