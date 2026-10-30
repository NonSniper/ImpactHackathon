from datetime import datetime
import re

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


class DeliveryZoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    city: str
    neighborhood: str
    active: bool


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
        return self


class OrderCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    total_bani: int
    status: str
