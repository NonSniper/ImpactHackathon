from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, ForeignKeyConstraint, Integer, String, Text, func, text
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
    image_preview_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_detail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_preview_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    image_detail_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    fulfillment_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    plan_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preparation_level: Mapped[str | None] = mapped_column(String(20), nullable=True)


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
        CheckConstraint("capacity IS NULL OR capacity > 0", name="ck_delivery_windows_capacity_positive"),
        CheckConstraint("reserved_orders >= 0", name="ck_delivery_windows_reserved_nonnegative"),
        CheckConstraint("capacity IS NULL OR reserved_orders <= capacity", name="ck_delivery_windows_capacity_not_exceeded"),
        CheckConstraint("demo_dataset_key IS NULL OR is_demo = true", name="ck_delivery_windows_demo_dataset"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("delivery_zones.id"), nullable=False, index=True)
    delivery_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ordering_cutoff: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reserved_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    demo_dataset_key: Mapped[str | None] = mapped_column(String(60), nullable=True)
    fulfillment_group: Mapped[str | None] = mapped_column(String(10), nullable=True)


class DeliveryBatch(Base):
    __tablename__ = "delivery_batches"
    __table_args__ = (
        CheckConstraint("storage_type IN ('fresh', 'chilled', 'frozen')", name="ck_batches_storage_type"),
        CheckConstraint("status IN ('planned')", name="ck_batches_status"),
        CheckConstraint("estimate_kind IS NULL OR estimate_kind IN ('demo', 'operational')", name="ck_batches_estimate_kind"),
        CheckConstraint("estimated_transport_bani IS NULL OR estimated_transport_bani >= 0", name="ck_batches_transport_nonnegative"),
        CheckConstraint("estimated_packaging_per_order_bani IS NULL OR estimated_packaging_per_order_bani >= 0", name="ck_batches_packaging_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("delivery_zones.id"), nullable=False)
    delivery_window_id: Mapped[int] = mapped_column(ForeignKey("delivery_windows.id"), nullable=False)
    storage_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned", server_default=text("'planned'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    estimate_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    estimated_transport_bani: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_packaging_per_order_bani: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fulfillment_group: Mapped[str | None] = mapped_column(String(10), nullable=True)


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
                        "AND coordinate_source IS NOT NULL AND coordinate_source IN ('manual_map_pin', 'admin', 'simulated'))", name="ck_orders_location_consistent"),
        CheckConstraint("coordinate_source IS NULL OR coordinate_source != 'simulated' OR is_demo = true", name="ck_orders_simulated_source"),
        CheckConstraint("demo_dataset_key IS NULL OR is_demo = true", name="ck_orders_demo_dataset"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    zone_id: Mapped[int] = mapped_column(ForeignKey("delivery_zones.id"), nullable=False)
    delivery_window_id: Mapped[int] = mapped_column(ForeignKey("delivery_windows.id"), nullable=False)
    delivery_batch_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_batches.id"), nullable=True, index=True)
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
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    demo_dataset_key: Mapped[str | None] = mapped_column(String(60), nullable=True)
    fulfillment_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    menu_days: Mapped[int | None] = mapped_column(Integer, nullable=True)


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        CheckConstraint("unit_price_bani >= 0", name="ck_order_items_price_nonnegative"),
        CheckConstraint("storage_type_snapshot IS NULL OR storage_type_snapshot IN ('fresh', 'chilled', 'frozen', 'pending_validation')", name="ck_order_items_storage_snapshot"),
        CheckConstraint("net_weight_g_snapshot IS NULL OR net_weight_g_snapshot > 0", name="ck_order_items_weight_snapshot"),
    )

    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_bani: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_type_snapshot: Mapped[str | None] = mapped_column(String(20), nullable=True)
    net_weight_g_snapshot: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_snapshot: Mapped[str | None] = mapped_column(String(30), nullable=True)
    custom_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))


class MenuAllocation(Base):
    __tablename__ = "menu_allocations"
    __table_args__ = (
        ForeignKeyConstraint(["order_id", "product_id"], ["order_items.order_id", "order_items.product_id"]),
        CheckConstraint("day_index BETWEEN 1 AND 3", name="ck_allocations_day"),
        CheckConstraint("quantity > 0", name="ck_allocations_quantity"),
        CheckConstraint("meal_period IS NULL OR meal_period IN ('breakfast', 'lunch', 'dinner')", name="ck_allocations_meal_period"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    member_label: Mapped[str] = mapped_column(String(60), nullable=False)
    meal_period: Mapped[str | None] = mapped_column(String(10), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
