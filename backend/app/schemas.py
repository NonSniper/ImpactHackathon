from datetime import datetime, timezone
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    category: str
    price_bani: int
    storage_type: str
    available: bool
    demo_only: bool
    sku: str | None
    product_type: Literal["meal_plan", "individual_dish"]
    unit: str
    net_weight_g: int | None
    preparation_type: str | None
    ingredients: str | None
    allergens: str | None
    shelf_life_days: int | None
    preparation_instructions: str | None
    supplier: str
    image_preview_url: str | None
    fulfillment_group: Literal["meals", "frozen"] | None = None
    plan_duration_days: Literal[2, 3] | None = None
    preparation_level: Literal["ready", "semi_prepared"] | None = None


class ProductDetailRead(ProductRead):
    image_detail_url: str | None


class AdminProductRead(ProductDetailRead):
    production_cost_bani: int | None


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    category: str = Field(min_length=1, max_length=100)
    price_bani: int = Field(strict=True, ge=0, le=2_147_483_647)
    storage_type: Literal["fresh", "chilled", "frozen", "pending_validation"]
    available: bool = False
    demo_only: bool = True
    sku: str | None = Field(default=None, min_length=1, max_length=60)
    product_type: Literal["meal_plan", "individual_dish"] = "individual_dish"
    unit: str = Field(default="pack", min_length=1, max_length=30)
    net_weight_g: int | None = Field(default=None, strict=True, gt=0, le=2_147_483_647)
    production_cost_bani: int | None = Field(default=None, strict=True, ge=0, le=2_147_483_647)
    preparation_type: str | None = Field(default=None, max_length=100)
    ingredients: str | None = Field(default=None, max_length=5000)
    allergens: str | None = Field(default=None, max_length=5000)
    shelf_life_days: int | None = Field(default=None, strict=True, gt=0, le=2_147_483_647)
    preparation_instructions: str | None = Field(default=None, max_length=5000)
    supplier: str = Field(default="CREDEM", min_length=1, max_length=120)
    fulfillment_group: Literal["meals", "frozen"] | None = None
    plan_duration_days: Literal[2, 3] | None = None
    preparation_level: Literal["ready", "semi_prepared"] | None = None


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    price_bani: int | None = Field(default=None, strict=True, ge=0, le=2_147_483_647)
    storage_type: Literal["fresh", "chilled", "frozen", "pending_validation"] | None = None
    available: bool | None = None
    demo_only: bool | None = None
    sku: str | None = Field(default=None, min_length=1, max_length=60)
    product_type: Literal["meal_plan", "individual_dish"] | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    net_weight_g: int | None = Field(default=None, strict=True, gt=0, le=2_147_483_647)
    production_cost_bani: int | None = Field(default=None, strict=True, ge=0, le=2_147_483_647)
    preparation_type: str | None = Field(default=None, max_length=100)
    ingredients: str | None = Field(default=None, max_length=5000)
    allergens: str | None = Field(default=None, max_length=5000)
    shelf_life_days: int | None = Field(default=None, strict=True, gt=0, le=2_147_483_647)
    preparation_instructions: str | None = Field(default=None, max_length=5000)
    supplier: str | None = Field(default=None, min_length=1, max_length=120)
    fulfillment_group: Literal["meals", "frozen"] | None = None
    plan_duration_days: Literal[2, 3] | None = None
    preparation_level: Literal["ready", "semi_prepared"] | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_required_fields(cls, data: object) -> object:
        if isinstance(data, dict):
            required = {"name", "description", "category", "price_bani", "storage_type", "available",
                        "demo_only", "product_type", "unit", "supplier"}
            if any(key in data and data[key] is None for key in required):
                raise ValueError("Required product fields cannot be null")
        return data


class DeliveryZoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    city: str
    neighborhood: str
    name: str
    active: bool
    parent_zone_id: int | None
    minimum_basket_bani: int
    delivery_fee_bani: int


class DeliveryZoneCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    city: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    parent_zone_id: int | None = Field(default=None, strict=True, gt=0)
    active: bool = False
    minimum_basket_bani: int = Field(default=60_000, strict=True, ge=0, le=2_147_483_647)
    delivery_fee_bani: int = Field(default=0, strict=True, ge=0, le=2_147_483_647)


class DeliveryZoneUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    city: str | None = Field(default=None, min_length=1, max_length=120)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_zone_id: int | None = Field(default=None, strict=True, gt=0)
    active: bool | None = None
    minimum_basket_bani: int | None = Field(default=None, strict=True, ge=0, le=2_147_483_647)
    delivery_fee_bani: int | None = Field(default=None, strict=True, ge=0, le=2_147_483_647)

    @model_validator(mode="before")
    @classmethod
    def reject_null_required_fields(cls, data: object) -> object:
        if isinstance(data, dict):
            required = {"city", "name", "active", "minimum_basket_bani", "delivery_fee_bani"}
            if any(key in data and data[key] is None for key in required):
                raise ValueError("Required zone fields cannot be null")
        return data


class DeliveryWindowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    zone_id: int
    delivery_at: datetime
    ordering_cutoff: datetime
    fulfillment_group: Literal["meals", "frozen"] | None = None

    @field_validator("delivery_at", "ordering_cutoff")
    @classmethod
    def normalize_to_utc(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class AdminDeliveryWindowRead(DeliveryWindowRead):
    active: bool
    capacity: int | None
    reserved_orders: int
    is_demo: bool


class DeliveryWindowCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zone_id: int = Field(strict=True, gt=0)
    fulfillment_group: Literal["meals", "frozen"]
    delivery_at: datetime
    ordering_cutoff: datetime
    active: bool = True
    capacity: int | None = Field(default=None, strict=True, gt=0, le=2_147_483_647)

    @field_validator("delivery_at", "ordering_cutoff")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("A timezone is required")
        return value.astimezone(timezone.utc)


class DeliveryWindowUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    delivery_at: datetime | None = None
    ordering_cutoff: datetime | None = None
    active: bool | None = None
    capacity: int | None = Field(default=None, strict=True, gt=0, le=2_147_483_647)
    fulfillment_group: Literal["meals", "frozen"] | None = None

    @field_validator("delivery_at", "ordering_cutoff")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("A timezone is required")
            return value.astimezone(timezone.utc)
        return None

    @model_validator(mode="before")
    @classmethod
    def reject_null_required_fields(cls, data: object) -> object:
        if isinstance(data, dict) and any(key in data and data[key] is None for key in ("delivery_at", "ordering_cutoff", "active")):
            raise ValueError("Date, cutoff and active cannot be null")
        return data


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["requested", "confirmed", "packed", "dispatched", "delivered"]


class OrderStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str


class OrderItemCreate(BaseModel):
    product_id: int = Field(strict=True, gt=0)
    quantity: int = Field(strict=True, gt=0, le=1000)
    custom_quantity: int = Field(default=0, strict=True, ge=0, le=1000)


class MenuAllocationInput(BaseModel):
    meal_period: Literal["breakfast", "lunch", "dinner"] | None = None
    product_id: int = Field(strict=True, gt=0)
    day_index: int = Field(strict=True, ge=1, le=3)
    member_label: str = Field(min_length=1, max_length=60)
    quantity: int = Field(strict=True, gt=0, le=1000)

    @field_validator("member_label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Member label cannot be blank")
        return value


class OrderCreate(BaseModel):
    fulfillment_group: Literal["meals", "frozen"]
    customer_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=30)
    address: str = Field(min_length=1, max_length=300)
    zone_id: int = Field(strict=True, gt=0)
    delivery_window_id: int = Field(strict=True, gt=0)
    items: list[OrderItemCreate] = Field(min_length=1, max_length=100)
    menu_days: int | None = Field(default=None, strict=True, ge=1, le=3)
    allocations: list[MenuAllocationInput] = Field(default_factory=list, max_length=1000)
    latitude: float | None = Field(default=None, strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, strict=True, ge=-180, le=180, allow_inf_nan=False)
    coordinate_source: Literal["manual_map_pin"] | None = None
    delivery_instructions: str | None = Field(default=None, max_length=1000)

    @field_validator("customer_name", "phone", "address", mode="before")
    @classmethod
    def trim_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        if len(re.sub(r"\D", "", value)) < 7:
            raise ValueError("Enter a phone number containing at least 7 digits")
        return value

    @model_validator(mode="after")
    def validate_unique_products(self) -> "OrderCreate":
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Each product may only appear once in items")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together")
        if self.latitude is None and self.coordinate_source is not None:
            raise ValueError("Coordinate source requires a map pin")
        if self.allocations and (self.fulfillment_group != "meals" or self.menu_days is None):
            raise ValueError("Family allocations require a meals menu duration")
        totals: dict[int, int] = {}
        for allocation in self.allocations:
            if allocation.day_index > (self.menu_days or 0):
                raise ValueError("Allocation day exceeds menu duration")
            totals[allocation.product_id] = totals.get(allocation.product_id, 0) + allocation.quantity
        if any(item.custom_quantity > item.quantity or totals.get(item.product_id, 0) != item.custom_quantity for item in self.items):
            raise ValueError("Allocations must match custom quantities")
        if set(totals) - set(product_ids):
            raise ValueError("Allocations must reference an order item")
        return self


class OrderLocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    latitude: float | None = Field(default=None, strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, strict=True, ge=-180, le=180, allow_inf_nan=False)
    location_verification_status: Literal["unlocated", "unverified", "verified", "flagged"] | None = None
    location_review_note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_location_fields(self) -> "OrderLocationUpdate":
        if ("latitude" in self.model_fields_set) != ("longitude" in self.model_fields_set):
            raise ValueError("Latitude and longitude must be updated together")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must both be set or both be null")
        if "location_verification_status" in self.model_fields_set and self.location_verification_status is None:
            raise ValueError("Location verification status cannot be null")
        return self


class AdminMapOrder(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    address: str
    zone_id: int
    delivery_window_id: int
    latitude: float | None
    longitude: float | None
    coordinate_source: str | None
    location_verification_status: str
    location_review_note: str | None
    delivery_instructions: str | None
    total_bani: int
    status: str
    delivery_batch_id: int | None
    is_demo: bool


class AdminMapResponse(BaseModel):
    markers: list[AdminMapOrder]
    unlocated: list[AdminMapOrder]


class AdminOrderSummary(BaseModel):
    id: int
    customer_name: str
    zone_id: int
    delivery_window_id: int
    delivery_at: datetime
    delivery_batch_id: int | None
    subtotal_bani: int
    delivery_fee_bani: int
    total_bani: int
    status: str
    created_at: datetime
    is_demo: bool
    fulfillment_group: Literal["meals", "frozen"] | None = None

    @field_validator("delivery_at", "created_at")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class AdminOrderItem(BaseModel):
    product_id: int
    product_name: str | None
    product_sku: str | None
    quantity: int
    unit_price_bani: int
    line_total_bani: int
    storage_type_snapshot: str | None
    net_weight_g_snapshot: int | None
    unit_snapshot: str | None
    custom_quantity: int = 0


class MenuAllocationRead(BaseModel):
    meal_period: Literal["breakfast", "lunch", "dinner"] | None = None
    model_config = ConfigDict(from_attributes=True)
    product_id: int
    product_name_snapshot: str
    day_index: int
    member_label: str
    quantity: int


class AdminOrderDetail(AdminOrderSummary):
    phone: str
    address: str
    latitude: float | None
    longitude: float | None
    coordinate_source: str | None
    location_verification_status: str
    location_review_note: str | None
    delivery_instructions: str | None
    items: list[AdminOrderItem]
    menu_days: int | None = None
    allocations: list[MenuAllocationRead] = Field(default_factory=list)


class DeliveryBatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zone_id: int = Field(strict=True, gt=0)
    delivery_window_id: int = Field(strict=True, gt=0)
    order_ids: list[Annotated[int, Field(strict=True, gt=0)]] = Field(min_length=1, max_length=500)

    @field_validator("order_ids")
    @classmethod
    def validate_order_ids(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("Order IDs must be unique")
        return value


class DeliveryBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    zone_id: int
    delivery_window_id: int
    storage_type: str
    status: str
    created_at: datetime
    is_demo: bool
    fulfillment_group: Literal["meals", "frozen"] | None = None


class DeliveryBatchDetail(DeliveryBatchRead):
    order_ids: list[int]


class DeliveryBatchSummary(BaseModel):
    batch_id: int
    is_demo: bool
    household_count: int
    total_item_quantity: int
    total_sales_bani: int
    total_weight_g: int | None
    known_weight_g: int


class ProductionProductTotal(BaseModel):
    product_id: int
    name: str
    sku: str | None
    unit: str | None
    quantity: int
    total_weight_g: int | None
    known_weight_g: int


class ProductionTotals(BaseModel):
    batch_id: int
    is_demo: bool
    products: list[ProductionProductTotal]


class BatchCostUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estimate_kind: Literal["demo", "operational"] | None = None
    estimated_transport_bani: int | None = Field(default=None, strict=True, ge=0, le=2_147_483_647)
    estimated_packaging_per_order_bani: int | None = Field(default=None, strict=True, ge=0, le=2_147_483_647)


class BatchCostConfig(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_demo: bool
    estimate_kind: Literal["demo", "operational"] | None
    estimated_transport_bani: int | None
    estimated_packaging_per_order_bani: int | None


class UnpricedProduct(BaseModel):
    product_id: int
    reason: Literal["missing_cost", "unknown_order_unit", "unit_or_weight_changed"]


class FinancialSummary(BaseModel):
    batch_id: int
    is_demo: bool
    estimate_kind: Literal["demo", "operational"] | None
    estimate_complete: bool
    household_count: int
    revenue_bani: int
    estimated_food_cost_bani: int | None
    known_food_cost_bani: int
    unpriced_products: list[UnpricedProduct]
    estimated_packaging_cost_bani: int | None
    estimated_transport_bani: int | None
    delivery_cost_per_household_bani: int | None
    contribution_before_overhead_bani: int | None
    orders_needed_to_cover_transport: int | None
    transport_break_even_possible: bool | None


class PackingItem(BaseModel):
    product_id: int
    name: str
    sku: str | None
    quantity: int
    unit: str | None
    net_weight_g: int | None


class PackingOrder(BaseModel):
    order_id: int
    is_demo: bool
    customer_name: str
    items: list[PackingItem]


class PackingReport(BaseModel):
    batch_id: int
    orders: list[PackingOrder]


class DeliveryStop(BaseModel):
    order_id: int
    is_demo: bool
    customer_name: str
    phone: str
    address: str
    latitude: float | None
    longitude: float | None
    location_verification_status: str
    delivery_instructions: str | None
    status: str
    total_bani: int


class DeliveryManifest(BaseModel):
    batch_id: int
    zone_id: int
    delivery_window_id: int
    stops: list[DeliveryStop]


class OrderCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subtotal_bani: int
    delivery_fee_bani: int
    total_bani: int
    status: str
    fulfillment_group: Literal["meals", "frozen"] | None = None
