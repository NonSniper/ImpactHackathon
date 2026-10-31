"""Create fictional local examples. Never run against production data."""
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import DATABASE_URL, engine
from app.models import DeliveryWindow, DeliveryZone, Product

PHOTO = "/images/examples/rice-stew.jpg"
SOUP_PHOTO = "/images/examples/vegetable-soup.jpg"
EXAMPLES = [
    ("FAMILY-2A", "Plan local clasic · 2 zile", "Planuri test", "meal_plan", "meals", "chilled", 2, 50000, "ready"),
    ("FAMILY-2B", "Plan local vegetarian · 2 zile", "Planuri test", "meal_plan", "meals", "chilled", 2, 56000, "ready"),
    ("FAMILY-3A", "Plan local clasic · 3 zile", "Planuri test", "meal_plan", "meals", "chilled", 3, 75000, "ready"),
    ("FAMILY-3B", "Plan local pentru familie · 3 zile", "Planuri test", "meal_plan", "meals", "chilled", 3, 90000, "ready"),
    ("FAMILY-DISH1", "Supă de legume · test", "Preparate test", "individual_dish", "meals", "chilled", None, 14000, "ready"),
    ("FAMILY-DISH2", "Pui cu orez · test", "Preparate test", "individual_dish", "meals", "chilled", None, 20000, "ready"),
    ("FAMILY-FROZEN1", "Colțunași congelați · test", "Congelate test", "individual_dish", "frozen", "frozen", None, 30000, "semi_prepared"),
    ("FAMILY-FROZEN2", "Legume congelate · test", "Congelate test", "individual_dish", "frozen", "frozen", None, 20000, "semi_prepared"),
]


def main():
    if os.environ.get("CREDEM_LOCAL_SAMPLE") != "1" or not DATABASE_URL.startswith("sqlite:///") or not DATABASE_URL.endswith("/credem-local.sqlite3"):
        raise SystemExit("Requires CREDEM_LOCAL_SAMPLE=1 and the dedicated local credem-local.sqlite3 database")
    with Session(engine) as db:
        zone = db.scalar(select(DeliveryZone).where(DeliveryZone.active.is_(True)).order_by(DeliveryZone.id))
        if zone is None:
            raise SystemExit("Seed an active local zone first")
        for sku, name, category, kind, group, storage, days, price, level in EXAMPLES:
            if db.scalar(select(Product).where(Product.sku == sku)):
                continue
            db.add(Product(name=name, description="Exemplu fictiv pentru testarea locală; fotografia este ilustrativă.",
                           category=category, product_type=kind, fulfillment_group=group, storage_type=storage,
                           plan_duration_days=days, preparation_level=level, price_bani=price, sku=sku,
                           available=True, demo_only=False, unit="pachet", net_weight_g=500,
                           production_cost_bani=price // 2, shelf_life_days=2 if group == "meals" else 30,
                           preparation_instructions="Instrucțiuni ilustrative; verificați ambalajul." if group == "frozen" else None,
                           image_preview_url=(SOUP_PHOTO if sku == "FAMILY-DISH1" else PHOTO) if group == "meals" else None,
                           image_detail_url=(SOUP_PHOTO if sku == "FAMILY-DISH1" else PHOTO) if group == "meals" else None, supplier="TEST LOCAL FICTIV"))
        now = datetime.now(timezone.utc)
        for group in ("meals", "frozen"):
            existing = db.scalar(select(DeliveryWindow).where(DeliveryWindow.zone_id == zone.id,
                DeliveryWindow.fulfillment_group == group, DeliveryWindow.active.is_(True),
                DeliveryWindow.is_demo.is_(False), DeliveryWindow.ordering_cutoff > now))
            if not existing:
                db.add(DeliveryWindow(zone_id=zone.id, fulfillment_group=group, delivery_at=now + timedelta(days=3),
                                      ordering_cutoff=now + timedelta(days=2), active=True))
        db.commit()
    print("Local fictional catalog and separate windows are ready.")


if __name__ == "__main__":
    main()
