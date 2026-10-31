"""Create the catalog, delivery, and order tables."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("price_bani", sa.Integer(), nullable=False),
        sa.Column("storage_type", sa.String(10), nullable=False),
        sa.Column("available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("demo_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.CheckConstraint("price_bani >= 0", name="ck_products_price_nonnegative"),
        sa.CheckConstraint("storage_type IN ('fresh', 'frozen')", name="ck_products_storage_type"),
    )
    op.create_table(
        "delivery_zones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("neighborhood", sa.String(120), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_table(
        "delivery_windows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("delivery_zones.id"), nullable=False),
        sa.Column("delivery_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ordering_cutoff", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("ordering_cutoff < delivery_at", name="ck_delivery_windows_cutoff_before_delivery"),
    )
    op.create_index("ix_delivery_windows_zone_id", "delivery_windows", ["zone_id"])
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer_name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("address", sa.String(300), nullable=False),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("delivery_zones.id"), nullable=False),
        sa.Column("delivery_window_id", sa.Integer(), sa.ForeignKey("delivery_windows.id"), nullable=False),
        sa.Column("total_bani", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'requested'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("total_bani >= 0", name="ck_orders_total_nonnegative"),
    )
    op.create_table(
        "order_items",
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_bani", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        sa.CheckConstraint("unit_price_bani >= 0", name="ck_order_items_price_nonnegative"),
    )


def downgrade() -> None:
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_index("ix_delivery_windows_zone_id", table_name="delivery_windows")
    op.drop_table("delivery_windows")
    op.drop_table("delivery_zones")
    op.drop_table("products")
