from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeliveryWindow, DeliveryZone
from app.schemas import AdminDeliveryWindowRead, DeliveryWindowCreate, DeliveryWindowUpdate
from app.security import require_admin

router = APIRouter(prefix="/api/admin/delivery-windows", tags=["admin delivery windows"], dependencies=[Depends(require_admin)])


def utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


@router.get("", response_model=list[AdminDeliveryWindowRead])
def list_windows(db: Annotated[Session, Depends(get_db)], zone_id: Annotated[int | None, Query(gt=0)] = None) -> list[DeliveryWindow]:
    query = select(DeliveryWindow)
    if zone_id is not None:
        query = query.where(DeliveryWindow.zone_id == zone_id)
    return list(db.scalars(query.order_by(DeliveryWindow.delivery_at, DeliveryWindow.id)))


@router.post("", response_model=AdminDeliveryWindowRead, status_code=status.HTTP_201_CREATED)
def create_window(payload: DeliveryWindowCreate, db: Annotated[Session, Depends(get_db)]) -> DeliveryWindow:
    if db.get(DeliveryZone, payload.zone_id) is None:
        raise HTTPException(status_code=400, detail="Delivery zone not found")
    if payload.ordering_cutoff <= datetime.now(timezone.utc) or payload.ordering_cutoff >= payload.delivery_at:
        raise HTTPException(status_code=400, detail="Cutoff must be in the future and before delivery")
    window = DeliveryWindow(**payload.model_dump())
    db.add(window)
    db.commit()
    db.refresh(window)
    return window


@router.patch("/{window_id}", response_model=AdminDeliveryWindowRead)
def update_window(window_id: int, payload: DeliveryWindowUpdate, db: Annotated[Session, Depends(get_db)]) -> DeliveryWindow:
    window = db.scalar(select(DeliveryWindow).where(DeliveryWindow.id == window_id).with_for_update())
    if window is None:
        raise HTTPException(status_code=404, detail="Delivery window not found")
    values = payload.model_dump(exclude_unset=True)
    changing_times = "delivery_at" in values or "ordering_cutoff" in values
    changing_group = "fulfillment_group" in values and values["fulfillment_group"] != window.fulfillment_group
    if changing_group and window.reserved_orders:
        raise HTTPException(status_code=409, detail="Cannot change group after orders have been placed")
    delivery_at = utc_datetime(values.get("delivery_at", window.delivery_at))
    cutoff = utc_datetime(values.get("ordering_cutoff", window.ordering_cutoff))
    if cutoff >= delivery_at:
        raise HTTPException(status_code=400, detail="Cutoff must be before delivery")
    if (changing_times or values.get("active") is True) and cutoff <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Cutoff must be in the future")
    if changing_times and window.reserved_orders:
        raise HTTPException(status_code=409, detail="Cannot change times after orders have been placed")
    if values.get("capacity") is not None and values["capacity"] < window.reserved_orders:
        raise HTTPException(status_code=409, detail="Capacity cannot be below the number of reserved orders")
    if not values:
        return window

    query = update(DeliveryWindow).where(DeliveryWindow.id == window_id)
    if changing_times or changing_group:
        query = query.where(DeliveryWindow.reserved_orders == 0)
    if values.get("capacity") is not None:
        query = query.where(DeliveryWindow.reserved_orders <= values["capacity"])
    result = db.execute(query.values(**values).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="Window reservations changed concurrently")
    db.commit()
    db.refresh(window)
    return window
