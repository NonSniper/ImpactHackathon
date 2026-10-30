"""Add delivery batches and order-item handling snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "delivery_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("delivery_zones.id"), nullable=False),
        sa.Column("delivery_window_id", sa.Integer(), sa.ForeignKey("delivery_windows.id"), nullable=False),
        sa.Column("storage_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("storage_type IN ('fresh', 'chilled', 'frozen')", name="ck_batches_storage_type"),
        sa.CheckConstraint("status IN ('planned')", name="ck_batches_status"),
    )
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("delivery_batch_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_orders_delivery_batch", "delivery_batches", ["delivery_batch_id"], ["id"])
        batch.create_index("ix_orders_delivery_batch_id", ["delivery_batch_id"])
    with op.batch_alter_table("order_items") as batch:
        batch.add_column(sa.Column("storage_type_snapshot", sa.String(20), nullable=True))
        batch.add_column(sa.Column("net_weight_g_snapshot", sa.Integer(), nullable=True))
        batch.create_check_constraint("ck_order_items_storage_snapshot", "storage_type_snapshot IS NULL OR storage_type_snapshot IN ('fresh', 'chilled', 'frozen', 'pending_validation')")
        batch.create_check_constraint("ck_order_items_weight_snapshot", "net_weight_g_snapshot IS NULL OR net_weight_g_snapshot > 0")


def downgrade() -> None:
    with op.batch_alter_table("order_items") as batch:
        batch.drop_constraint("ck_order_items_storage_snapshot", type_="check")
        batch.drop_constraint("ck_order_items_weight_snapshot", type_="check")
        batch.drop_column("storage_type_snapshot")
        batch.drop_column("net_weight_g_snapshot")
    with op.batch_alter_table("orders") as batch:
        batch.drop_index("ix_orders_delivery_batch_id")
        batch.drop_constraint("fk_orders_delivery_batch", type_="foreignkey")
        batch.drop_column("delivery_batch_id")
    op.drop_table("delivery_batches")
