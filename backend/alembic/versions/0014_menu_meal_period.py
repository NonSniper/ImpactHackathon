"""Preserve meal periods on family menu allocations.

Revision ID: 0014
Revises: 0013
"""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("menu_allocations") as batch:
        batch.add_column(sa.Column("meal_period", sa.String(10), nullable=True))
        batch.create_check_constraint(
            "ck_allocations_meal_period",
            "meal_period IS NULL OR meal_period IN ('breakfast', 'lunch', 'dinner')",
        )


def downgrade():
    with op.batch_alter_table("menu_allocations") as batch:
        batch.drop_constraint("ck_allocations_meal_period", type_="check")
        batch.drop_column("meal_period")
