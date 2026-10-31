"""Find legacy seeded names for manual review; never change product data."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Product

LEGACY_NAMES = (
    "Plan de mese pentru 3 zile — clasic",
    "Plan de mese pentru 3 zile — vegetarian",
    "Supă de legume",
    "Supă de pui",
    "Orez cu legume",
    "Pui cu garnitură",
)


def candidates(db: Session) -> list[Product]:
    return list(db.scalars(select(Product).where(Product.name.in_(LEGACY_NAMES)).order_by(Product.id)))


def main() -> None:
    with SessionLocal() as db:
        products = candidates(db)
        print("Possible legacy demo products; review approval manually. No changes were made.")
        for product in products:
            print(f"id={product.id} name={product.name!r} available={product.available} "
                  f"demo_only={product.demo_only} price_bani={product.price_bani}")
        print(f"Found {len(products)} exact-name matches. Renamed products are not detected.")


if __name__ == "__main__":
    main()
