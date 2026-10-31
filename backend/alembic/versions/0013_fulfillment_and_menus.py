"""Separate fulfillment groups and preserve family-menu allocations.

Revision ID: 0013_fulfillment_and_menus
Revises: 0012_product_images
"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("fulfillment_group", sa.String(10), nullable=True))
    op.add_column("products", sa.Column("plan_duration_days", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("preparation_level", sa.String(20), nullable=True))
    op.add_column("delivery_windows", sa.Column("fulfillment_group", sa.String(10), nullable=True))
    op.add_column("orders", sa.Column("fulfillment_group", sa.String(10), nullable=True))
    op.add_column("orders", sa.Column("menu_days", sa.Integer(), nullable=True))
    op.add_column("delivery_batches", sa.Column("fulfillment_group", sa.String(10), nullable=True))
    op.add_column("order_items", sa.Column("custom_quantity", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "menu_allocations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("product_name_snapshot", sa.String(200), nullable=False),
        sa.Column("day_index", sa.Integer(), nullable=False),
        sa.Column("member_label", sa.String(60), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["order_id", "product_id"], ["order_items.order_id", "order_items.product_id"]),
        sa.CheckConstraint("day_index BETWEEN 1 AND 3", name="ck_allocations_day"),
        sa.CheckConstraint("quantity > 0", name="ck_allocations_quantity"),
    )


def downgrade():
    op.drop_table("menu_allocations")
    with op.batch_alter_table("order_items") as batch:
        batch.drop_column("custom_quantity")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("menu_days")
        batch.drop_column("fulfillment_group")
    with op.batch_alter_table("delivery_windows") as batch:
        batch.drop_column("fulfillment_group")
    with op.batch_alter_table("delivery_batches") as batch:
        batch.drop_column("fulfillment_group")
    with op.batch_alter_table("products") as batch:
        batch.drop_column("preparation_level")
        batch.drop_column("plan_duration_days")
        batch.drop_column("fulfillment_group")
