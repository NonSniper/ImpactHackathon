"""Save the order-item unit for production reporting."""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("unit_snapshot", sa.String(30), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("order_items") as batch:
        batch.drop_column("unit_snapshot")
