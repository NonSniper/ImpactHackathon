import os
from datetime import datetime, timezone
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeliveryWindow, DeliveryZone, Order, OrderItem, Product
from app.schemas import DeliveryWindowRead, DeliveryZoneRead, OrderCreate, OrderCreated, ProductRead

load_dotenv()
app = FastAPI(title="CREDEM Home API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
MINIMUM_ORDER_BANI = 60_000


def utc_datetime(value: datetime) -> datetime:
    # SQLite returns naive timestamps; our database convention stores them as UTC.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/products", response_model=list[ProductRead])
def list_products(db: Annotated[Session, Depends(get_db)]) -> list[Product]:
    return list(db.scalars(select(Product).where(Product.available.is_(True)).order_by(Product.id)))


@app.get("/api/delivery-zones", response_model=list[DeliveryZoneRead])
def list_delivery_zones(db: Annotated[Session, Depends(get_db)]) -> list[DeliveryZone]:
    return list(db.scalars(select(DeliveryZone).where(DeliveryZone.active.is_(True)).order_by(DeliveryZone.id)))


@app.get("/api/delivery-windows", response_model=list[DeliveryWindowRead])
def list_delivery_windows(db: Annotated[Session, Depends(get_db)], zone_id: Annotated[int, Query(gt=0)]) -> list[DeliveryWindowRead]:
    now = datetime.now(timezone.utc)
    windows = db.scalars(
        select(DeliveryWindow)
        .join(DeliveryZone, DeliveryWindow.zone_id == DeliveryZone.id)
        .where(
            DeliveryWindow.zone_id == zone_id,
            DeliveryZone.active.is_(True),
            DeliveryWindow.ordering_cutoff > now,
            DeliveryWindow.delivery_at > now,
        )
        .order_by(DeliveryWindow.delivery_at, DeliveryWindow.id)
    )
    return [DeliveryWindowRead(
        id=window.id,
        zone_id=window.zone_id,
        delivery_at=utc_datetime(window.delivery_at),
        ordering_cutoff=utc_datetime(window.ordering_cutoff),
    ) for window in windows]


@app.post("/api/orders", response_model=OrderCreated, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: Annotated[Session, Depends(get_db)]) -> Order:
    zone = db.get(DeliveryZone, payload.zone_id)
    if zone is None or not zone.active:
        raise HTTPException(status_code=400, detail="Delivery zone is unavailable")

    window = db.get(DeliveryWindow, payload.delivery_window_id)
    now = datetime.now(timezone.utc)
    if (window is None or window.zone_id != zone.id
            or utc_datetime(window.ordering_cutoff) <= now
            or utc_datetime(window.delivery_at) <= now):
        raise HTTPException(status_code=400, detail="Delivery window is unavailable for this zone")

    product_ids = [item.product_id for item in payload.items]
    products = {product.id: product for product in db.scalars(select(Product).where(Product.id.in_(product_ids)))}
    if any(product_id not in products or not products[product_id].available or products[product_id].demo_only
           for product_id in product_ids):
        raise HTTPException(status_code=400, detail="One or more products are unavailable for ordering")

    total_bani = sum(products[item.product_id].price_bani * item.quantity for item in payload.items)
    if total_bani < MINIMUM_ORDER_BANI:
        raise HTTPException(status_code=400, detail="Minimum order value is 600 MDL")
    if total_bani > 2_147_483_647:
        raise HTTPException(status_code=400, detail="Order total is too large")

    order = Order(customer_name=payload.customer_name, phone=payload.phone, address=payload.address,
                  zone_id=zone.id, delivery_window_id=window.id, total_bani=total_bani, status="requested")
    try:
        db.add(order)
        db.flush()
        db.add_all([OrderItem(order_id=order.id, product_id=item.product_id, quantity=item.quantity,
                              unit_price_bani=products[item.product_id].price_bani) for item in payload.items])
        db.commit()
    except Exception:
        db.rollback()
        raise
    return order
