"""Add configurable delivery zones and save order fee snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_zones") as batch:
        batch.add_column(sa.Column("parent_zone_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("minimum_basket_bani", sa.Integer(), nullable=False, server_default="60000"))
        batch.add_column(sa.Column("delivery_fee_bani", sa.Integer(), nullable=False, server_default="0"))
        batch.create_foreign_key("fk_zones_parent_zone", "delivery_zones", ["parent_zone_id"], ["id"])
        batch.create_check_constraint("ck_zones_minimum_nonnegative", "minimum_basket_bani >= 0")
        batch.create_check_constraint("ck_zones_fee_nonnegative", "delivery_fee_bani >= 0")
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("subtotal_bani", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("delivery_fee_bani", sa.Integer(), nullable=False, server_default="0"))
        batch.create_check_constraint("ck_orders_subtotal_nonnegative", "subtotal_bani >= 0")
        batch.create_check_constraint("ck_orders_fee_nonnegative", "delivery_fee_bani >= 0")
    op.execute("UPDATE orders SET subtotal_bani = total_bani")
    # The original demo seed enabled these sectors; the new pilot starts in Rîșcani.
    op.execute("UPDATE delivery_zones SET active = false WHERE city = 'Chișinău' "
               "AND neighborhood IN ('Buiucani', 'Botanica') AND parent_zone_id IS NULL")


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_constraint("ck_orders_subtotal_nonnegative", type_="check")
        batch.drop_constraint("ck_orders_fee_nonnegative", type_="check")
        batch.drop_column("subtotal_bani")
        batch.drop_column("delivery_fee_bani")
    with op.batch_alter_table("delivery_zones") as batch:
        batch.drop_constraint("fk_zones_parent_zone", type_="foreignkey")
        batch.drop_constraint("ck_zones_minimum_nonnegative", type_="check")
        batch.drop_constraint("ck_zones_fee_nonnegative", type_="check")
        batch.drop_column("parent_zone_id")
        batch.drop_column("minimum_basket_bani")
        batch.drop_column("delivery_fee_bani")
