"""Add per-batch cost assumptions, separate from actual expenses."""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_batches") as batch:
        batch.add_column(sa.Column("estimate_kind", sa.String(20), nullable=True))
        batch.add_column(sa.Column("estimated_transport_bani", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("estimated_packaging_per_order_bani", sa.Integer(), nullable=True))
        batch.create_check_constraint("ck_batches_estimate_kind", "estimate_kind IS NULL OR estimate_kind IN ('demo', 'operational')")
        batch.create_check_constraint("ck_batches_transport_nonnegative", "estimated_transport_bani IS NULL OR estimated_transport_bani >= 0")
        batch.create_check_constraint("ck_batches_packaging_nonnegative", "estimated_packaging_per_order_bani IS NULL OR estimated_packaging_per_order_bani >= 0")


def downgrade() -> None:
    with op.batch_alter_table("delivery_batches") as batch:
        for name in ("ck_batches_estimate_kind", "ck_batches_transport_nonnegative", "ck_batches_packaging_nonnegative"):
            batch.drop_constraint(name, type_="check")
        for column in ("estimate_kind", "estimated_transport_bani", "estimated_packaging_per_order_bani"):
            batch.drop_column(column)
