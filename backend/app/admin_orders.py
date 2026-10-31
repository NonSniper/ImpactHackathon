from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeliveryWindow, DeliveryZone, Order
from app.schemas import AdminMapOrder, AdminMapResponse, OrderLocationUpdate
from app.security import require_admin

router = APIRouter(prefix="/api/admin/orders", tags=["admin orders"], dependencies=[Depends(require_admin)])


@router.get("/map", response_model=AdminMapResponse)
def order_map(
    db: Annotated[Session, Depends(get_db)],
    city: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    zone_id: Annotated[int | None, Query(gt=0)] = None,
    delivery_date: Annotated[date | None, Query(alias="date")] = None,
    window_id: Annotated[int | None, Query(gt=0)] = None,
    status: Annotated[str | None, Query(min_length=1, max_length=30)] = None,
    location_status: Literal["unlocated", "unverified", "verified", "flagged"] | None = None,
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
    if status is not None:
        query = query.where(Order.status == status)
    if location_status is not None:
        query = query.where(Order.location_verification_status == location_status)
    orders = db.scalars(query.order_by(Order.id)).all()
    return AdminMapResponse(
        markers=[AdminMapOrder.model_validate(order) for order in orders if order.latitude is not None],
        unlocated=[AdminMapOrder.model_validate(order) for order in orders if order.latitude is None],
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
