from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price_bani >= 0", name="ck_products_price_nonnegative"),
        CheckConstraint("storage_type IN ('fresh', 'frozen')", name="ck_products_storage_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    price_bani: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_type: Mapped[str] = mapped_column(String(10), nullable=False)
    available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    demo_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))


class DeliveryZone(Base):
    __tablename__ = "delivery_zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(120), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))


class DeliveryWindow(Base):
    __tablename__ = "delivery_windows"
    __table_args__ = (
        CheckConstraint("ordering_cutoff < delivery_at", name="ck_delivery_windows_cutoff_before_delivery"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("delivery_zones.id"), nullable=False, index=True)
    delivery_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ordering_cutoff: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (CheckConstraint("total_bani >= 0", name="ck_orders_total_nonnegative"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    zone_id: Mapped[int] = mapped_column(ForeignKey("delivery_zones.id"), nullable=False)
    delivery_window_id: Mapped[int] = mapped_column(ForeignKey("delivery_windows.id"), nullable=False)
    total_bani: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="requested", server_default=text("'requested'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        CheckConstraint("unit_price_bani >= 0", name="ck_order_items_price_nonnegative"),
    )

    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_bani: Mapped[int] = mapped_column(Integer, nullable=False)
