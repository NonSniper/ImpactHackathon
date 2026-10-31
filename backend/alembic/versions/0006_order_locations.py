"""Store order map pins and manual verification state."""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("longitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("coordinate_source", sa.String(30), nullable=True))
        batch.add_column(sa.Column("location_verification_status", sa.String(20), nullable=False, server_default="unlocated"))
        batch.add_column(sa.Column("location_review_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("delivery_instructions", sa.Text(), nullable=True))
        batch.create_check_constraint("ck_orders_coordinate_pair", "(latitude IS NULL AND longitude IS NULL) OR "
                                      "(latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 "
                                      "AND longitude BETWEEN -180 AND 180)")
        batch.create_check_constraint("ck_orders_location_status", "location_verification_status IN ('unlocated', 'unverified', 'verified', 'flagged')")
        batch.create_check_constraint("ck_orders_location_consistent", "(latitude IS NULL AND location_verification_status = 'unlocated' AND coordinate_source IS NULL) OR "
                                      "(latitude IS NOT NULL AND location_verification_status IN ('unverified', 'verified', 'flagged') "
                                      "AND coordinate_source IS NOT NULL AND coordinate_source IN ('manual_map_pin', 'admin'))")


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        for name in ("ck_orders_coordinate_pair", "ck_orders_location_status", "ck_orders_location_consistent"):
            batch.drop_constraint(name, type_="check")
        for column in ("latitude", "longitude", "coordinate_source", "location_verification_status", "location_review_note", "delivery_instructions"):
            batch.drop_column(column)
