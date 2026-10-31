"""Create isolated simulated orders. Run with python -m app.seed_demo_orders [--reset]."""
import argparse
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import DeliveryBatch, DeliveryWindow, DeliveryZone, Order, OrderItem, Product

DATASET_KEY = "riscani-demo-v1"
DEMO_PRODUCTS = [
    ("DEMO-PLAN-3D", "DEMO: plan de mese", 65_000, 30_000, 1500, "meal_plan"),
    ("DEMO-SUPA", "DEMO: supă", 8_500, 3_500, 500, "individual_dish"),
    ("DEMO-GARNITURA", "DEMO: garnitură", 12_000, 5_000, 500, "individual_dish"),
    ("DEMO-FEL-PRINCIPAL", "DEMO: fel principal", 15_000, 6_000, 500, "individual_dish"),
]


def seed_demo(db: Session, reset: bool = False, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Seed time must include a timezone")
    now = now.astimezone(timezone.utc)
    zone = db.scalar(select(DeliveryZone).where(
        DeliveryZone.city == "Chișinău", DeliveryZone.neighborhood == "Rîșcani",
        DeliveryZone.parent_zone_id.is_(None),
    ))
    if zone is None:
        raise ValueError("Run python -m app.seed first to create the Rîșcani sector")

    existing = db.scalars(select(Order).where(Order.is_demo.is_(True), Order.demo_dataset_key == DATASET_KEY)).all()
    if not reset and existing:
        if len(existing) != 50:
            raise ValueError("Demo dataset is incomplete; use --reset to recreate it")
        return 0

    products = []
    for sku, name, price, cost, weight, product_type in DEMO_PRODUCTS:
        product = db.scalar(select(Product).where(Product.sku == sku))
        if product is None:
            product = Product(sku=sku, name=name, description="SIMULARE: produs și costuri inventate, necomercializabil.",
                              category="demo", price_bani=price, production_cost_bani=cost,
                              net_weight_g=weight, product_type=product_type, unit="pack", storage_type="fresh",
                              available=False, demo_only=True, supplier="DEMO")
            db.add(product)
            db.flush()
        if not product.demo_only or product.available or product.storage_type != "fresh":
            raise ValueError(f"{sku} must remain a non-orderable fresh simulation product")
        products.append(product)

    if reset and existing:
        batch_ids = {order.delivery_batch_id for order in existing if order.delivery_batch_id is not None}
        window_ids = {order.delivery_window_id for order in existing}
        for batch_id in batch_ids:
            batch = db.get(DeliveryBatch, batch_id)
            if batch is None or not batch.is_demo:
                raise ValueError("Refusing to reset demo orders linked to a non-demo batch")
        for window_id in window_ids:
            window = db.get(DeliveryWindow, window_id)
            if window is None or not window.is_demo or window.demo_dataset_key != DATASET_KEY:
                raise ValueError("Refusing to reset demo orders linked to a non-demo window")
        order_ids = [order.id for order in existing]
        db.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_ids)))
        db.execute(delete(Order).where(Order.id.in_(order_ids), Order.is_demo.is_(True), Order.demo_dataset_key == DATASET_KEY))
        db.flush()
        for batch_id in batch_ids:
            if db.scalar(select(Order.id).where(Order.delivery_batch_id == batch_id).limit(1)) is None:
                db.delete(db.get(DeliveryBatch, batch_id))
        for window_id in window_ids:
            window = db.get(DeliveryWindow, window_id)
            window.reserved_orders = db.scalar(select(func.count()).select_from(Order).where(Order.delivery_window_id == window_id))
        db.flush()

    window = db.scalar(select(DeliveryWindow).where(
        DeliveryWindow.is_demo.is_(True), DeliveryWindow.demo_dataset_key == DATASET_KEY,
        DeliveryWindow.zone_id == zone.id, DeliveryWindow.active.is_(True),
        DeliveryWindow.ordering_cutoff > now, DeliveryWindow.reserved_orders == 0,
        DeliveryWindow.fulfillment_group == "meals",
    ).order_by(DeliveryWindow.id).limit(1))
    if window is None:
        delivery_at = (now + timedelta(days=3)).replace(hour=12, minute=0, second=0, microsecond=0)
        window = DeliveryWindow(zone_id=zone.id, delivery_at=delivery_at, ordering_cutoff=delivery_at - timedelta(days=1),
                                active=True, capacity=50, reserved_orders=0, is_demo=True, demo_dataset_key=DATASET_KEY,
                                fulfillment_group="meals")
        db.add(window)
        db.flush()
    if window.capacity is not None and window.capacity < 50:
        raise ValueError("The demo window capacity must allow 50 orders")

    for index in range(50):
        choices = [(products[0], 1), (products[1 + index % 3], 1 + index % 3)]
        subtotal = sum(product.price_bani * quantity for product, quantity in choices)
        order = Order(customer_name=f"Client simulat {index + 1:02d}", phone=f"DEMO-{index + 1:04d}",
                      address=f"Adresă fictivă {index + 1:02d} — doar pentru demonstrație", zone_id=zone.id,
                      delivery_window_id=window.id, subtotal_bani=subtotal, delivery_fee_bani=0, total_bani=subtotal,
                      status="requested", latitude=round(47.04 + (index % 10) * 0.0008, 6),
                      longitude=round(28.85 + (index // 10) * 0.001, 6), coordinate_source="simulated",
                      location_verification_status="unverified", is_demo=True, demo_dataset_key=DATASET_KEY,
                      fulfillment_group="meals")
        db.add(order)
        db.flush()
        db.add_all([OrderItem(order_id=order.id, product_id=product.id, quantity=quantity,
                              unit_price_bani=product.price_bani, storage_type_snapshot=product.storage_type,
                              net_weight_g_snapshot=product.net_weight_g, unit_snapshot=product.unit)
                    for product, quantity in choices])
    window.reserved_orders = 50
    db.commit()
    return 50


def main() -> None:
    parser = argparse.ArgumentParser(description="Create 50 simulated Rîșcani orders; never real customers.")
    parser.add_argument("--reset", action="store_true", help="Replace only this script's simulated orders")
    args = parser.parse_args()
    with SessionLocal() as db:
        count = seed_demo(db, reset=args.reset)
    print(f"Created {count} simulated orders; all coordinates and costs are illustrative.")


if __name__ == "__main__":
    main()
