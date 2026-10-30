"""Store product image URLs and object storage keys."""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("image_preview_url", sa.Text(), nullable=True))
    op.add_column("products", sa.Column("image_detail_url", sa.Text(), nullable=True))
    op.add_column("products", sa.Column("image_preview_key", sa.String(300), nullable=True))
    op.add_column("products", sa.Column("image_detail_key", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "image_detail_key")
    op.drop_column("products", "image_preview_key")
    op.drop_column("products", "image_detail_url")
    op.drop_column("products", "image_preview_url")
