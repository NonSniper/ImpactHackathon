from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeliveryWindow, DeliveryZone, Order, OrderItem, Product
from app.schemas import (AdminMapOrder, AdminMapResponse, AdminOrderDetail, AdminOrderItem, AdminOrderSummary,
                         OrderLocationUpdate, OrderStatusRead, OrderStatusUpdate)
from app.security import require_admin

router = APIRouter(prefix="/api/admin/orders", tags=["admin orders"], dependencies=[Depends(require_admin)])
NEXT_STATUS = {"requested": "confirmed", "confirmed": "packed", "packed": "dispatched", "dispatched": "delivered"}


def order_summary(order: Order, window: DeliveryWindow) -> AdminOrderSummary:
    return AdminOrderSummary(
        id=order.id, customer_name=order.customer_name, zone_id=order.zone_id,
        delivery_window_id=order.delivery_window_id, delivery_at=window.delivery_at,
        delivery_batch_id=order.delivery_batch_id, subtotal_bani=order.subtotal_bani,
        delivery_fee_bani=order.delivery_fee_bani, total_bani=order.total_bani,
        status=order.status, created_at=order.created_at, is_demo=order.is_demo,
    )


@router.get("", response_model=list[AdminOrderSummary])
def list_orders(
    db: Annotated[Session, Depends(get_db)],
    zone_id: Annotated[int | None, Query(gt=0)] = None,
    window_id: Annotated[int | None, Query(gt=0)] = None,
    batch_id: Annotated[int | None, Query(gt=0)] = None,
    status: Literal["requested", "confirmed", "packed", "dispatched", "delivered"] | None = None,
    is_demo: bool | None = None,
    unbatched: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AdminOrderSummary]:
    query = select(Order, DeliveryWindow).join(DeliveryWindow, Order.delivery_window_id == DeliveryWindow.id)
    if zone_id is not None:
        query = query.where(Order.zone_id == zone_id)
    if window_id is not None:
        query = query.where(Order.delivery_window_id == window_id)
    if batch_id is not None:
        query = query.where(Order.delivery_batch_id == batch_id)
    if status is not None:
        query = query.where(Order.status == status)
    if is_demo is not None:
        query = query.where(Order.is_demo.is_(is_demo))
    if unbatched:
        query = query.where(Order.delivery_batch_id.is_(None))
    rows = db.execute(query.order_by(Order.created_at.desc(), Order.id.desc()).limit(limit).offset(offset)).all()
    return [order_summary(order, window) for order, window in rows]


@router.get("/map", response_model=AdminMapResponse)
def order_map(
    db: Annotated[Session, Depends(get_db)],
    city: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    zone_id: Annotated[int | None, Query(gt=0)] = None,
    delivery_date: Annotated[date | None, Query(alias="date")] = None,
    window_id: Annotated[int | None, Query(gt=0)] = None,
    batch_id: Annotated[int | None, Query(gt=0)] = None,
    status: Annotated[str | None, Query(min_length=1, max_length=30)] = None,
    location_status: Literal["unlocated", "unverified", "verified", "flagged"] | None = None,
    is_demo: bool | None = None,
) -> AdminMapResponse:
    query = select(Order).join(DeliveryZone, Order.zone_id == DeliveryZone.id).join(
        DeliveryWindow, Order.delivery_window_id == DeliveryWindow.id
    )
    if city is not None:
        query = query.where(DeliveryZone.city == city)
    if zone_id is not None:
        query = query.where(Order.zone_id == zone_id)
    if delivery_date is not None:
        start = datetime.combine(delivery_date, time.min, tzinfo=timezone.utc)
        query = query.where(DeliveryWindow.delivery_at >= start)
        if delivery_date != date.max:
            query = query.where(DeliveryWindow.delivery_at < start + timedelta(days=1))
    if window_id is not None:
        query = query.where(Order.delivery_window_id == window_id)
    if batch_id is not None:
        query = query.where(Order.delivery_batch_id == batch_id)
    if status is not None:
        query = query.where(Order.status == status)
    if location_status is not None:
        query = query.where(Order.location_verification_status == location_status)
    if is_demo is not None:
        query = query.where(Order.is_demo.is_(is_demo))
    orders = db.scalars(query.order_by(Order.id)).all()
    return AdminMapResponse(
        markers=[AdminMapOrder.model_validate(order) for order in orders if order.latitude is not None],
        unlocated=[AdminMapOrder.model_validate(order) for order in orders if order.latitude is None],
    )


@router.get("/{order_id}", response_model=AdminOrderDetail)
def get_order(order_id: int, db: Annotated[Session, Depends(get_db)]) -> AdminOrderDetail:
    row = db.execute(select(Order, DeliveryWindow).join(
        DeliveryWindow, Order.delivery_window_id == DeliveryWindow.id
    ).where(Order.id == order_id)).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")
    order, window = row
    rows = db.execute(select(OrderItem, Product).outerjoin(Product, OrderItem.product_id == Product.id)
                      .where(OrderItem.order_id == order_id).order_by(OrderItem.product_id)).all()
    items = [AdminOrderItem(
        product_id=item.product_id, product_name=product.name if product else None,
        product_sku=product.sku if product else None, quantity=item.quantity,
        unit_price_bani=item.unit_price_bani, line_total_bani=item.quantity * item.unit_price_bani,
        storage_type_snapshot=item.storage_type_snapshot, net_weight_g_snapshot=item.net_weight_g_snapshot,
        unit_snapshot=item.unit_snapshot,
    ) for item, product in rows]
    return AdminOrderDetail(
        **order_summary(order, window).model_dump(), phone=order.phone, address=order.address,
        latitude=order.latitude, longitude=order.longitude, coordinate_source=order.coordinate_source,
        location_verification_status=order.location_verification_status, location_review_note=order.location_review_note,
        delivery_instructions=order.delivery_instructions, items=items,
    )


@router.patch("/{order_id}/location", response_model=AdminMapOrder)
def update_order_location(
    order_id: int, payload: OrderLocationUpdate, db: Annotated[Session, Depends(get_db)]
) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    values = payload.model_dump(exclude_unset=True)
    coordinates_changed = "latitude" in values
    latitude = values.get("latitude", order.latitude)
    longitude = values.get("longitude", order.longitude)
    if "location_verification_status" in values:
        location_status = values["location_verification_status"]
    elif coordinates_changed:
        location_status = "unverified" if latitude is not None else "unlocated"
    else:
        location_status = order.location_verification_status
    if (latitude is None and location_status != "unlocated") or (latitude is not None and location_status == "unlocated"):
        raise HTTPException(status_code=400, detail="Verification status must match the presence of coordinates")

    if coordinates_changed:
        order.latitude = latitude
        order.longitude = longitude
        order.coordinate_source = "admin" if latitude is not None else None
        order.location_review_note = None
    order.location_verification_status = location_status
    if "location_review_note" in values:
        order.location_review_note = values["location_review_note"]
    db.commit()
    db.refresh(order)
    return order


@router.patch("/{order_id}/status", response_model=OrderStatusRead)
def update_order_status(order_id: int, payload: OrderStatusUpdate, db: Annotated[Session, Depends(get_db)]) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == payload.status:
        return order
    if NEXT_STATUS.get(order.status) != payload.status:
        raise HTTPException(status_code=409, detail="Invalid order status transition")
    result = db.execute(update(Order).where(Order.id == order_id, Order.status == order.status)
                        .values(status=payload.status).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="Order status changed concurrently")
    db.commit()
    db.refresh(order)
    return order
