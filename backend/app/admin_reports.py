import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin_batches import find_batch, production_totals
from app.database import get_db
from app.models import Order, OrderItem, Product
from app.schemas import DeliveryManifest, DeliveryStop, PackingItem, PackingOrder, PackingReport
from app.security import require_admin

router = APIRouter(prefix="/api/admin/batches", tags=["admin reports"], dependencies=[Depends(require_admin)])


def batch_orders(batch_id: int, db: Session) -> list[Order]:
    return list(db.scalars(select(Order).where(Order.delivery_batch_id == batch_id).order_by(Order.id)))


def build_manifest(batch_id: int, db: Session) -> DeliveryManifest:
    batch = find_batch(batch_id, db)
    return DeliveryManifest(
        batch_id=batch.id, zone_id=batch.zone_id, delivery_window_id=batch.delivery_window_id,
        stops=[DeliveryStop(order_id=order.id, is_demo=order.is_demo, customer_name=order.customer_name, phone=order.phone,
                            address=order.address, latitude=order.latitude, longitude=order.longitude,
                            location_verification_status=order.location_verification_status,
                            delivery_instructions=order.delivery_instructions, status=order.status,
                            total_bani=order.total_bani) for order in batch_orders(batch_id, db)],
    )


@router.get("/{batch_id}/packing-list", response_model=PackingReport)
def packing_list(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> PackingReport:
    find_batch(batch_id, db)
    orders = batch_orders(batch_id, db)
    groups = {order.id: PackingOrder(order_id=order.id, is_demo=order.is_demo, customer_name=order.customer_name, items=[]) for order in orders}
    rows = db.execute(select(OrderItem, Product).join(Order, OrderItem.order_id == Order.id)
                      .join(Product, OrderItem.product_id == Product.id)
                      .where(Order.delivery_batch_id == batch_id)
                      .order_by(Order.id, Product.id)).all()
    for item, product in rows:
        groups[item.order_id].items.append(PackingItem(
            product_id=product.id, name=product.name, sku=product.sku, quantity=item.quantity,
            unit=item.unit_snapshot, net_weight_g=item.net_weight_g_snapshot,
        ))
    return PackingReport(batch_id=batch_id, orders=list(groups.values()))


@router.get("/{batch_id}/delivery-manifest", response_model=DeliveryManifest)
def delivery_manifest(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> DeliveryManifest:
    return build_manifest(batch_id, db)


def csv_cell(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, str) and value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
        return "'" + value
    if isinstance(value, str) and value.startswith(("\t", "\r", "\n")):
        return "'" + value
    return value


def csv_response(filename: str, headings: list[str], rows: list[list[object]]) -> Response:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headings)
    writer.writerows([[csv_cell(value) for value in row] for row in rows])
    return Response(content="\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/{batch_id}/exports/orders.csv", response_class=Response)
def export_orders(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> Response:
    manifest = build_manifest(batch_id, db)
    headings = ["order_id", "is_demo", "customer_name", "phone", "address", "latitude", "longitude",
                "location_verification_status", "delivery_instructions", "status", "total_bani"]
    rows = [[stop.order_id, stop.is_demo, stop.customer_name, stop.phone, stop.address, stop.latitude, stop.longitude,
             stop.location_verification_status, stop.delivery_instructions, stop.status, stop.total_bani]
            for stop in manifest.stops]
    return csv_response(f"batch-{batch_id}-orders.csv", headings, rows)


@router.get("/{batch_id}/exports/production.csv", response_class=Response)
def export_production(batch_id: int, db: Annotated[Session, Depends(get_db)]) -> Response:
    report = production_totals(batch_id, db)
    headings = ["is_demo", "product_id", "name", "sku", "unit", "quantity", "total_weight_g", "known_weight_g"]
    rows = [[report.is_demo, item.product_id, item.name, item.sku, item.unit, item.quantity, item.total_weight_g,
             item.known_weight_g] for item in report.products]
    return csv_response(f"batch-{batch_id}-production.csv", headings, rows)
