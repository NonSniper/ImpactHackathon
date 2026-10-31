from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product
from app.schemas import AdminProductRead, ProductCreate, ProductUpdate
from app.security import require_admin

router = APIRouter(prefix="/api/admin/products", tags=["admin products"], dependencies=[Depends(require_admin)])


def validate_offer(product: Product) -> None:
    if product.available and not product.demo_only:
        if product.fulfillment_group not in ("meals", "frozen") or not product.preparation_level:
            raise HTTPException(status_code=400, detail="Approved products require fulfillment and preparation classifications")
        if product.storage_type != ("chilled" if product.fulfillment_group == "meals" else "frozen"):
            raise HTTPException(status_code=400, detail="Storage type must match the approved fulfillment group")
        if product.fulfillment_group == "meals" and product.preparation_level != "ready":
            raise HTTPException(status_code=400, detail="Meals require ready-prepared products")
        if product.product_type == "meal_plan":
            if product.fulfillment_group != "meals" or product.plan_duration_days not in (2, 3):
                raise HTTPException(status_code=400, detail="Meal plans require a two- or three-day duration")
            if product.price_bani < product.plan_duration_days * 25000:
                raise HTTPException(status_code=400, detail="Meal plan price must be at least 250 MDL per day")
        elif product.plan_duration_days is not None:
            raise HTTPException(status_code=400, detail="Only meal plans have a duration")


def get_product(product_id: int, db: Session) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def save_product(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Product could not be saved; SKU may already exist") from error


@router.get("", response_model=list[AdminProductRead])
def list_products(db: Annotated[Session, Depends(get_db)]) -> list[Product]:
    return list(db.scalars(select(Product).order_by(Product.id)))


@router.post("", response_model=AdminProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Annotated[Session, Depends(get_db)]) -> Product:
    product = Product(**payload.model_dump())
    validate_offer(product)
    db.add(product)
    save_product(db)
    db.refresh(product)
    return product


@router.patch("/{product_id}", response_model=AdminProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Annotated[Session, Depends(get_db)]) -> Product:
    product = get_product(product_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    validate_offer(product)
    save_product(db)
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(product_id: int, db: Annotated[Session, Depends(get_db)]) -> Response:
    product = get_product(product_id, db)
    product.available = False
    save_product(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
