from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[str] = mapped_column(String(40), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    delivery_address: Mapped[str] = mapped_column(String(300), nullable=False)
    delivery_city: Mapped[str] = mapped_column(String(120), nullable=False)
    delivery_postal_code: Mapped[str] = mapped_column(String(20), nullable=False)
    delivery_date: Mapped[date] = mapped_column(Date, nullable=False)
    delivery_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
