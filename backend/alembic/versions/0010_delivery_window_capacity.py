"""Add delivery window availability and atomic order capacity."""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_windows") as batch:
        batch.add_column(sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")))
        batch.add_column(sa.Column("capacity", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("reserved_orders", sa.Integer(), nullable=False, server_default="0"))
        batch.create_check_constraint("ck_delivery_windows_capacity_positive", "capacity IS NULL OR capacity > 0")
        batch.create_check_constraint("ck_delivery_windows_reserved_nonnegative", "reserved_orders >= 0")
        batch.create_check_constraint("ck_delivery_windows_capacity_not_exceeded", "capacity IS NULL OR reserved_orders <= capacity")
    op.execute("UPDATE delivery_windows SET reserved_orders = (SELECT COUNT(*) FROM orders WHERE orders.delivery_window_id = delivery_windows.id)")


def downgrade() -> None:
    with op.batch_alter_table("delivery_windows") as batch:
        for name in ("ck_delivery_windows_capacity_positive", "ck_delivery_windows_reserved_nonnegative",
                     "ck_delivery_windows_capacity_not_exceeded"):
            batch.drop_constraint(name, type_="check")
        for column in ("active", "capacity", "reserved_orders"):
            batch.drop_column(column)
