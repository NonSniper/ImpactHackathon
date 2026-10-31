"""Add product administration fields while preserving existing order items."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("products") as batch:
        batch.drop_constraint("ck_products_storage_type", type_="check")
        batch.alter_column("storage_type", existing_type=sa.String(10), type_=sa.String(20), existing_nullable=False)
        batch.add_column(sa.Column("sku", sa.String(60), nullable=True))
        batch.add_column(sa.Column("product_type", sa.String(20), nullable=False, server_default="individual_dish"))
        batch.add_column(sa.Column("unit", sa.String(30), nullable=False, server_default="pack"))
        batch.add_column(sa.Column("net_weight_g", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("production_cost_bani", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("preparation_type", sa.String(100), nullable=True))
        batch.add_column(sa.Column("ingredients", sa.Text(), nullable=True))
        batch.add_column(sa.Column("allergens", sa.Text(), nullable=True))
        batch.add_column(sa.Column("shelf_life_days", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("preparation_instructions", sa.Text(), nullable=True))
        batch.add_column(sa.Column("supplier", sa.String(120), nullable=False, server_default="CREDEM"))
        batch.create_unique_constraint("uq_products_sku", ["sku"])
        batch.create_check_constraint("ck_products_storage_type", "storage_type IN ('fresh', 'chilled', 'frozen', 'pending_validation')")
        batch.create_check_constraint("ck_products_product_type", "product_type IN ('meal_plan', 'individual_dish')")
        batch.create_check_constraint("ck_products_cost_nonnegative", "production_cost_bani IS NULL OR production_cost_bani >= 0")
        batch.create_check_constraint("ck_products_weight_positive", "net_weight_g IS NULL OR net_weight_g > 0")
        batch.create_check_constraint("ck_products_shelf_life_positive", "shelf_life_days IS NULL OR shelf_life_days > 0")
    op.execute("UPDATE products SET product_type = 'meal_plan' WHERE category = 'meal_plan'")


def downgrade() -> None:
    with op.batch_alter_table("products") as batch:
        for name in ("ck_products_storage_type", "ck_products_product_type", "ck_products_cost_nonnegative",
                     "ck_products_weight_positive", "ck_products_shelf_life_positive"):
            batch.drop_constraint(name, type_="check")
        batch.drop_constraint("uq_products_sku", type_="unique")
        for column in ("sku", "product_type", "unit", "net_weight_g", "production_cost_bani", "preparation_type",
                       "ingredients", "allergens", "shelf_life_days", "preparation_instructions", "supplier"):
            batch.drop_column(column)
        batch.alter_column("storage_type", existing_type=sa.String(20), type_=sa.String(10), existing_nullable=False)
        batch.create_check_constraint("ck_products_storage_type", "storage_type IN ('fresh', 'frozen')")
