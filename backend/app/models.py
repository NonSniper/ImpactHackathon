from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price_bani >= 0", name="ck_products_price_nonnegative"),
        CheckConstraint("storage_type IN ('fresh', 'chilled', 'frozen', 'pending_validation')", name="ck_products_storage_type"),
        CheckConstraint("product_type IN ('meal_plan', 'individual_dish')", name="ck_products_product_type"),
        CheckConstraint("production_cost_bani IS NULL OR production_cost_bani >= 0", name="ck_products_cost_nonnegative"),
        CheckConstraint("net_weight_g IS NULL OR net_weight_g > 0", name="ck_products_weight_positive"),
        CheckConstraint("shelf_life_days IS NULL OR shelf_life_days > 0", name="ck_products_shelf_life_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    price_bani: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_type: Mapped[str] = mapped_column(String(20), nullable=False)
    available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    demo_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    sku: Mapped[str | None] = mapped_column(String(60), nullable=True, unique=True)
    product_type: Mapped[str] = mapped_column(String(20), nullable=False, default="individual_dish", server_default=text("'individual_dish'"))
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="pack", server_default=text("'pack'"))
    net_weight_g: Mapped[int | None] = mapped_column(Integer, nullable=True)
    production_cost_bani: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preparation_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ingredients: Mapped[str | None] = mapped_column(Text, nullable=True)
    allergens: Mapped[str | None] = mapped_column(Text, nullable=True)
    shelf_life_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preparation_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    supplier: Mapped[str] = mapped_column(String(120), nullable=False, default="CREDEM", server_default=text("'CREDEM'"))


class DeliveryZone(Base):
    __tablename__ = "delivery_zones"
    __table_args__ = (
        CheckConstraint("minimum_basket_bani >= 0", name="ck_zones_minimum_nonnegative"),
        CheckConstraint("delivery_fee_bani >= 0", name="ck_zones_fee_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(120), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    parent_zone_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_zones.id"), nullable=True)
    minimum_basket_bani: Mapped[int] = mapped_column(Integer, nullable=False, default=60_000, server_default=text("60000"))
    delivery_fee_bani: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    @property
    def name(self) -> str:
        return self.neighborhood


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
    __table_args__ = (
        CheckConstraint("total_bani >= 0", name="ck_orders_total_nonnegative"),
        CheckConstraint("subtotal_bani >= 0", name="ck_orders_subtotal_nonnegative"),
        CheckConstraint("delivery_fee_bani >= 0", name="ck_orders_fee_nonnegative"),
        CheckConstraint("(latitude IS NULL AND longitude IS NULL) OR "
                        "(latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 "
                        "AND longitude BETWEEN -180 AND 180)", name="ck_orders_coordinate_pair"),
        CheckConstraint("location_verification_status IN ('unlocated', 'unverified', 'verified', 'flagged')", name="ck_orders_location_status"),
        CheckConstraint("(latitude IS NULL AND location_verification_status = 'unlocated' AND coordinate_source IS NULL) OR "
                        "(latitude IS NOT NULL AND location_verification_status IN ('unverified', 'verified', 'flagged') "
                        "AND coordinate_source IS NOT NULL AND coordinate_source IN ('manual_map_pin', 'admin'))", name="ck_orders_location_consistent"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    zone_id: Mapped[int] = mapped_column(ForeignKey("delivery_zones.id"), nullable=False)
    delivery_window_id: Mapped[int] = mapped_column(ForeignKey("delivery_windows.id"), nullable=False)
    total_bani: Mapped[int] = mapped_column(Integer, nullable=False)
    subtotal_bani: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    delivery_fee_bani: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    coordinate_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    location_verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unlocated", server_default=text("'unlocated'"))
    location_review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
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
