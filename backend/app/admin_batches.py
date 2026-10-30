from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeliveryBatch, DeliveryWindow, Order, OrderItem, Product
from app.schemas import (BatchCostConfig, BatchCostUpdate, DeliveryBatchCreate, DeliveryBatchDetail,
                         DeliveryBatchRead, DeliveryBatchSummary, FinancialSummary, ProductionProductTotal,
                         ProductionTotals, UnpricedProduct)
from app.security import require_admin

router = APIRouter(prefix="/api/admin/batches", tags=["admin batches"], dependencies=[Depends(require_admin)])
BATCHABLE_STATUSES = ("requested", "confirmed", "packed")


def find_batch(batch_id: int, db: Session) -> DeliveryBatch:
    batch = db.get(DeliveryBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Delivery batch not found")
    return batch


@router.get("", response_model=list[DeliveryBatchRead])
def list_batches(db: Annotated[Session, Depends(get_db)]) -> list[DeliveryBatch]:
    return list(db.scalars(select(DeliveryBatch).order_by(DeliveryBatch.id)))


@router.post("", response_model=DeliveryBatchDetail, status_code=status.HTTP_201_CREATED)
def create_batch(payload: DeliveryBatchCreate, db: Annotated[Session, Depends(get_db)]) -> DeliveryBatchDetail:
    window = db.get(DeliveryWindow, payload.delivery_window_id)
    if window is None or window.zone_id != payload.zone_id:
        raise HTTPException(status_code=400, detail="Delivery window does not belong to the zone")

    orders = db.scalars(select(Order).where(Order.id.in_(payload.order_ids)).order_by(Order.id).with_for_update()).all()
    if len(orders) != len(payload.order_ids):
        raise HTTPException(status_code=400, detail="One or more orders do not exist")
    if any(order.delivery_batch_id is not None for order in orders):
        raise HTTPException(status_code=409, detail="One or more orders are already assigned to a batch")
    if any(order.is_demo != window.is_demo for order in orders):
        raise HTTPException(status_code=400, detail="Demo and real orders and windows cannot be mixed")
    if any(order.zone_id != payload.zone_id or order.delivery_window_id != window.id
           or order.status not in BATCHABLE_STATUSES for order in orders):
        raise HTTPException(status_code=400, detail="Orders must share the zone and window and be eligible for delivery")

    items = db.scalars(select(OrderItem).where(OrderItem.order_id.in_(payload.order_ids))).all()
    if {item.order_id for item in items} != set(payload.order_ids):
        raise HTTPException(status_code=400, detail="Every order must contain items")
    storage_types = {item.storage_type_snapshot for item in items}
    if len(storage_types) != 1 or not storage_types.issubset({"fresh", "chilled", "frozen"}):
        raise HTTPException(status_code=400, detail="Order items require one known, compatible storage type")

    batch = DeliveryBatch(zone_id=payload.zone_id, delivery_window_id=window.id, storage_type=storage_types.pop(),
                          is_demo=window.is_demo, estimate_kind="demo" if window.is_demo else None)
    try:
        db.add(batch)
        db.flush()
        result = db.execute(update(Order).where(
            Order.id.in_(payload.order_ids), Order.delivery_batch_id.is_(None),
            Order.zone_id == payload.zone_id, Order.delivery_window_id == window.id,
            Order.is_demo.is_(window.is_demo),
            Order.status.in_(BATCHABLE_STATUSES),
        ).values(delivery_batch_id=batch.id))
        if result.rowcount != len(payload.order_ids):
            raise HTTPException(status_code=409, detail="One or more orders were assigned or changed concurrently")
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(batch)
    return DeliveryBatchDetail(**DeliveryBatchRead.model_validate(batch).model_dump(),
                               order_ids=sorted(payload.order_ids))


@router.get("/{batch_id}", response_model=DeliveryBatchDetail)
def get_batch(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> DeliveryBatchDetail:
    batch = find_batch(batch_id, db)
    order_ids = list(db.scalars(select(Order.id).where(Order.delivery_batch_id == batch_id).order_by(Order.id)))
    return DeliveryBatchDetail(**DeliveryBatchRead.model_validate(batch).model_dump(), order_ids=order_ids)


@router.get("/{batch_id}/summary", response_model=DeliveryBatchSummary)
def batch_summary(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> DeliveryBatchSummary:
    batch = find_batch(batch_id, db)
    orders = db.scalars(select(Order).where(Order.delivery_batch_id == batch_id)).all()
    items = db.scalars(select(OrderItem).join(Order, OrderItem.order_id == Order.id)
                       .where(Order.delivery_batch_id == batch_id)).all()
    known_weight = sum(item.quantity * item.net_weight_g_snapshot for item in items if item.net_weight_g_snapshot is not None)
    return DeliveryBatchSummary(
        batch_id=batch_id,
        is_demo=batch.is_demo,
        household_count=len(orders),
        total_item_quantity=sum(item.quantity for item in items),
        total_sales_bani=sum(order.total_bani for order in orders),
        total_weight_g=known_weight if all(item.net_weight_g_snapshot is not None for item in items) else None,
        known_weight_g=known_weight,
    )


@router.get("/{batch_id}/production", response_model=ProductionTotals)
def production_totals(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> ProductionTotals:
    batch = find_batch(batch_id, db)
    rows = db.execute(
        select(OrderItem, Product)
        .join(Order, OrderItem.order_id == Order.id)
        .join(Product, OrderItem.product_id == Product.id)
        .where(Order.delivery_batch_id == batch_id)
        .order_by(Product.id, OrderItem.order_id)
    ).all()
    totals: dict[tuple[int, str | None], ProductionProductTotal] = {}
    for item, product in rows:
        key = (product.id, item.unit_snapshot)
        if key not in totals:
            totals[key] = ProductionProductTotal(product_id=product.id, name=product.name, sku=product.sku,
                                                 unit=item.unit_snapshot, quantity=0, total_weight_g=0,
                                                 known_weight_g=0)
        total = totals[key]
        total.quantity += item.quantity
        if item.net_weight_g_snapshot is None:
            total.total_weight_g = None
        else:
            weight = item.quantity * item.net_weight_g_snapshot
            total.known_weight_g += weight
            if total.total_weight_g is not None:
                total.total_weight_g += weight
    return ProductionTotals(batch_id=batch_id, is_demo=batch.is_demo, products=list(totals.values()))


@router.get("/{batch_id}/costs", response_model=BatchCostConfig)
def get_batch_costs(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> DeliveryBatch:
    return find_batch(batch_id, db)


@router.patch("/{batch_id}/costs", response_model=BatchCostConfig)
def update_batch_costs(batch_id: int, payload: BatchCostUpdate, db: Annotated[Session, Depends(get_db)]) -> DeliveryBatch:
    batch = find_batch(batch_id, db)
    if batch.is_demo and payload.estimate_kind == "operational":
        raise HTTPException(status_code=400, detail="Demo batches cannot use operational cost assumptions")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(batch, field, value)
    db.commit()
    db.refresh(batch)
    return batch


@router.get("/{batch_id}/financial-summary", response_model=FinancialSummary)
def financial_summary(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> FinancialSummary:
    batch = find_batch(batch_id, db)
    orders = db.scalars(select(Order).where(Order.delivery_batch_id == batch_id)).all()
    rows = db.execute(select(OrderItem, Product).join(Order, OrderItem.order_id == Order.id)
                      .join(Product, OrderItem.product_id == Product.id)
                      .where(Order.delivery_batch_id == batch_id)).all()
    known_food_cost = 0
    missing: set[tuple[int, str]] = set()
    for item, product in rows:
        if item.unit_snapshot is None:
            missing.add((product.id, "unknown_order_unit"))
        elif item.unit_snapshot != product.unit or item.net_weight_g_snapshot != product.net_weight_g:
            missing.add((product.id, "unit_or_weight_changed"))
        elif product.production_cost_bani is None:
            missing.add((product.id, "missing_cost"))
        else:
            known_food_cost += item.quantity * product.production_cost_bani

    count = len(orders)
    revenue = sum(order.total_bani for order in orders)
    food = known_food_cost if not missing else None
    packaging = (batch.estimated_packaging_per_order_bani * count
                 if batch.estimated_packaging_per_order_bani is not None else None)
    transport = batch.estimated_transport_bani
    delivery_per_order = (transport + count - 1) // count if transport is not None and count else None
    complete = bool(count and batch.estimate_kind is not None and food is not None
                    and packaging is not None and transport is not None)
    contribution = None
    orders_needed = None
    break_even_possible = None
    if complete:
        assert food is not None and packaging is not None and transport is not None
        margin_before_transport = revenue - food - packaging
        contribution = margin_before_transport - transport
        if transport == 0:
            break_even_possible, orders_needed = True, 0
        elif margin_before_transport > 0:
            break_even_possible = True
            orders_needed = (transport * count + margin_before_transport - 1) // margin_before_transport
        else:
            break_even_possible = False

    return FinancialSummary(
        batch_id=batch.id, is_demo=batch.is_demo, estimate_kind=batch.estimate_kind, estimate_complete=complete,
        household_count=count, revenue_bani=revenue, estimated_food_cost_bani=food,
        known_food_cost_bani=known_food_cost,
        unpriced_products=[UnpricedProduct(product_id=product_id, reason=reason)
                           for product_id, reason in sorted(missing)],
        estimated_packaging_cost_bani=packaging, estimated_transport_bani=transport,
        delivery_cost_per_household_bani=delivery_per_order,
        contribution_before_overhead_bani=contribution,
        orders_needed_to_cover_transport=orders_needed, transport_break_even_possible=break_even_possible,
    )
