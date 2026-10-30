"""Add illustrative catalog and delivery data. Run with python -m app.seed."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import DeliveryWindow, DeliveryZone, Product


PRODUCTS = [
    {
        "name": "Plan de mese pentru 3 zile — clasic",
        "description": "Plan demonstrativ de mese pentru trei zile. Preț ilustrativ.",
        "category": "meal_plan", "price_bani": 65_000, "storage_type": "fresh",
        "available": True, "demo_only": False,
    },
    {
        "name": "Plan de mese pentru 3 zile — vegetarian",
        "description": "Plan demonstrativ vegetarian pentru trei zile. Preț ilustrativ.",
        "category": "meal_plan", "price_bani": 69_000, "storage_type": "fresh",
        "available": True, "demo_only": False,
    },
    {
        "name": "Supă de legume",
        "description": "Supă proaspătă de legume. Preț ilustrativ.",
        "category": "soup", "price_bani": 8_500, "storage_type": "fresh",
        "available": True, "demo_only": False,
    },
    {
        "name": "Supă de pui",
        "description": "Supă proaspătă de pui. Preț ilustrativ.",
        "category": "soup", "price_bani": 9_500, "storage_type": "fresh",
        "available": True, "demo_only": False,
    },
    {
        "name": "Orez cu legume",
        "description": "Orez proaspăt cu legume. Preț ilustrativ.",
        "category": "main", "price_bani": 12_000, "storage_type": "fresh",
        "available": True, "demo_only": False,
    },
    {
        "name": "Pui cu garnitură",
        "description": "Preparat proaspăt de pui cu garnitură. Preț ilustrativ.",
        "category": "main", "price_bani": 15_000, "storage_type": "fresh",
        "available": True, "demo_only": False,
    },
    {
        "name": "Chifteluțe congelate — demonstrație",
        "description": "Produs demonstrativ neaprobat; indisponibil pentru livrare comercială. Preț ilustrativ.",
        "category": "main", "price_bani": 14_000, "storage_type": "frozen",
        "available": False, "demo_only": True,
    },
    {
        "name": "Legume congelate — demonstrație",
        "description": "Produs demonstrativ neaprobat; indisponibil pentru livrare comercială. Preț ilustrativ.",
        "category": "side", "price_bani": 9_000, "storage_type": "frozen",
        "available": False, "demo_only": True,
    },
]


def seed(db: Session, now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Seed time must include a timezone")
    now = now.astimezone(timezone.utc)

    for product_data in PRODUCTS:
        existing = db.scalar(select(Product).where(Product.name == product_data["name"]))
        if existing is None:
            db.add(Product(**product_data))

    for neighborhood in ("Buiucani", "Botanica"):
        zone = db.scalar(select(DeliveryZone).where(
            DeliveryZone.city == "Chișinău", DeliveryZone.neighborhood == neighborhood
        ))
        if zone is None:
            zone = DeliveryZone(city="Chișinău", neighborhood=neighborhood, active=True)
            db.add(zone)
            db.flush()

        existing_window = db.scalar(select(DeliveryWindow).where(
            DeliveryWindow.zone_id == zone.id,
            DeliveryWindow.delivery_at > now,
            DeliveryWindow.ordering_cutoff > now,
        ).limit(1))
        if existing_window is None:
            delivery_at = (now + timedelta(days=3)).replace(hour=12, minute=0, second=0, microsecond=0)
            db.add(DeliveryWindow(
                zone_id=zone.id,
                delivery_at=delivery_at,
                ordering_cutoff=delivery_at - timedelta(days=1),
            ))

    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed(db)
    print("Demo data is ready. Prices are illustrative; demo-only products cannot be ordered.")


if __name__ == "__main__":
    main()
