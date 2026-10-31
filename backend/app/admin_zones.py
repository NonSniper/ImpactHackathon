from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeliveryZone
from app.schemas import DeliveryZoneCreate, DeliveryZoneRead, DeliveryZoneUpdate
from app.security import require_admin

router = APIRouter(prefix="/api/admin/delivery-zones", tags=["admin delivery zones"], dependencies=[Depends(require_admin)])


def is_zone_active(db: Session, zone: DeliveryZone | None) -> bool:
    if zone is None or not zone.active:
        return False
    if zone.parent_zone_id is None:
        return True
    parent = db.get(DeliveryZone, zone.parent_zone_id)
    return parent is not None and parent.active and parent.parent_zone_id is None


def validate_parent(db: Session, city: str, parent_id: int | None, zone: DeliveryZone | None = None) -> None:
    if zone is not None and parent_id == zone.id:
        raise HTTPException(status_code=400, detail="A zone cannot be its own parent")
    if parent_id is not None:
        parent = db.get(DeliveryZone, parent_id)
        if parent is None or parent.parent_zone_id is not None or parent.city.casefold() != city.casefold():
            raise HTTPException(status_code=400, detail="Parent must be a sector in the same city")
        if zone is not None and db.scalar(select(DeliveryZone.id).where(DeliveryZone.parent_zone_id == zone.id).limit(1)):
            raise HTTPException(status_code=400, detail="A sector with subzones cannot become a subzone")
    if zone is not None:
        children = db.scalars(select(DeliveryZone).where(DeliveryZone.parent_zone_id == zone.id))
        if any(child.city.casefold() != city.casefold() for child in children):
            raise HTTPException(status_code=400, detail="Subzones must remain in the same city")


@router.get("", response_model=list[DeliveryZoneRead])
def list_zones(db: Annotated[Session, Depends(get_db)]) -> list[DeliveryZone]:
    return list(db.scalars(select(DeliveryZone).order_by(DeliveryZone.id)))


@router.post("", response_model=DeliveryZoneRead, status_code=status.HTTP_201_CREATED)
def create_zone(payload: DeliveryZoneCreate, db: Annotated[Session, Depends(get_db)]) -> DeliveryZone:
    values = payload.model_dump()
    validate_parent(db, values["city"], values["parent_zone_id"])
    values["neighborhood"] = values.pop("name")
    zone = DeliveryZone(**values)
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return zone


@router.patch("/{zone_id}", response_model=DeliveryZoneRead)
def update_zone(zone_id: int, payload: DeliveryZoneUpdate, db: Annotated[Session, Depends(get_db)]) -> DeliveryZone:
    zone = db.get(DeliveryZone, zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail="Delivery zone not found")
    values = payload.model_dump(exclude_unset=True)
    validate_parent(db, values.get("city", zone.city), values.get("parent_zone_id", zone.parent_zone_id), zone)
    if "name" in values:
        values["neighborhood"] = values.pop("name")
    for field, value in values.items():
        setattr(zone, field, value)
    db.commit()
    db.refresh(zone)
    return zone
