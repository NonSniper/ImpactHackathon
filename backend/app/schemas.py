from datetime import datetime
import re
from typing import Literal

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


class AdminProductRead(ProductRead):
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


class OrderItemCreate(BaseModel):
    product_id: int = Field(strict=True, gt=0)
    quantity: int = Field(strict=True, gt=0, le=1000)


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=30)
    address: str = Field(min_length=1, max_length=300)
    zone_id: int = Field(strict=True, gt=0)
    delivery_window_id: int = Field(strict=True, gt=0)
    items: list[OrderItemCreate] = Field(min_length=1, max_length=100)
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
    delivery_batch_id: int | None = None


class AdminMapResponse(BaseModel):
    markers: list[AdminMapOrder]
    unlocated: list[AdminMapOrder]


class OrderCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subtotal_bani: int
    delivery_fee_bani: int
    total_bani: int
    status: str
