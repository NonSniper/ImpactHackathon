from datetime import date, timedelta
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


PACKAGE_IDS = {"family-classic", "family-vegetarian"}


class OrderCreate(BaseModel):
    package_id: str
    contact_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    phone: str = Field(min_length=7, max_length=30)
    delivery_address: str = Field(min_length=5, max_length=300)
    delivery_city: str = Field(min_length=2, max_length=120)
    delivery_postal_code: str = Field(min_length=2, max_length=20)
    delivery_date: date
    delivery_instructions: str | None = Field(default=None, max_length=1000)

    @field_validator("package_id")
    @classmethod
    def validate_package(cls, value: str) -> str:
        if value not in PACKAGE_IDS:
            raise ValueError("Select one of the available meal packages")
        return value

    @field_validator("contact_name", "delivery_address", "delivery_city", "delivery_postal_code", mode="before")
    @classmethod
    def trim_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        value = value.strip()
        if len(re.sub(r"\D", "", value)) < 7:
            raise ValueError("Enter a valid phone number")
        return value

    @field_validator("delivery_instructions")
    @classmethod
    def trim_instructions(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("delivery_date")
    @classmethod
    def validate_delivery_date(cls, value: date) -> date:
        if value < date.today() + timedelta(days=1):
            raise ValueError("Choose a delivery date at least one day in the future")
        return value


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    package_id: str
