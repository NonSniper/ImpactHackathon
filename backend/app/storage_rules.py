"""Storage compatibility shared by checkout and delivery batching."""
from collections.abc import Iterable

DELIVERABLE_STORAGE_TYPES = frozenset({"fresh", "chilled", "frozen"})


def compatible_storage_type(storage_types: Iterable[str | None]) -> str | None:
    types = set(storage_types)
    if len(types) != 1 or not types.issubset(DELIVERABLE_STORAGE_TYPES):
        return None
    return next(iter(types))
