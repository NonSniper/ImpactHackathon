"""Label simulated orders, batches and isolated demo windows."""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_windows") as batch:
        batch.add_column(sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("demo_dataset_key", sa.String(60), nullable=True))
        batch.create_check_constraint("ck_delivery_windows_demo_dataset", "demo_dataset_key IS NULL OR is_demo = true")
    with op.batch_alter_table("delivery_batches") as batch:
        batch.add_column(sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("demo_dataset_key", sa.String(60), nullable=True))
        batch.drop_constraint("ck_orders_location_consistent", type_="check")
        batch.create_check_constraint("ck_orders_location_consistent", "(latitude IS NULL AND location_verification_status = 'unlocated' AND coordinate_source IS NULL) OR "
                                      "(latitude IS NOT NULL AND location_verification_status IN ('unverified', 'verified', 'flagged') "
                                      "AND coordinate_source IS NOT NULL AND coordinate_source IN ('manual_map_pin', 'admin', 'simulated'))")
        batch.create_check_constraint("ck_orders_simulated_source", "coordinate_source IS NULL OR coordinate_source != 'simulated' OR is_demo = true")
        batch.create_check_constraint("ck_orders_demo_dataset", "demo_dataset_key IS NULL OR is_demo = true")


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_constraint("ck_orders_demo_dataset", type_="check")
        batch.drop_constraint("ck_orders_simulated_source", type_="check")
        batch.drop_constraint("ck_orders_location_consistent", type_="check")
        batch.create_check_constraint("ck_orders_location_consistent", "(latitude IS NULL AND location_verification_status = 'unlocated' AND coordinate_source IS NULL) OR "
                                      "(latitude IS NOT NULL AND location_verification_status IN ('unverified', 'verified', 'flagged') "
                                      "AND coordinate_source IS NOT NULL AND coordinate_source IN ('manual_map_pin', 'admin'))")
        batch.drop_column("demo_dataset_key")
        batch.drop_column("is_demo")
    with op.batch_alter_table("delivery_batches") as batch:
        batch.drop_column("is_demo")
    with op.batch_alter_table("delivery_windows") as batch:
        batch.drop_constraint("ck_delivery_windows_demo_dataset", type_="check")
        batch.drop_column("demo_dataset_key")
        batch.drop_column("is_demo")
