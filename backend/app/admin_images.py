"""Validate product images and replace them without breaking existing URLs."""
import io
import logging
import uuid
import warnings
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import update
from sqlalchemy.orm import Session

from app import image_storage
from app.admin_products import get_product
from app.database import get_db
from app.models import Product
from app.schemas import AdminProductRead
from app.security import require_admin

router = APIRouter(prefix="/api/admin/products", tags=["admin product images"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


def validate_image(upload: UploadFile, name: str, max_bytes: int, max_dimension: int) -> bytes:
    data = upload.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"{name} image exceeds the file size limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=("JPEG", "PNG", "WEBP")) as image:
                if max(image.size) > max_dimension or min(image.size) <= 0:
                    raise HTTPException(status_code=422, detail=f"{name} image dimensions exceed the limit")
                if getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(status_code=422, detail=f"{name} image must not be animated")
                image.verify()
            with Image.open(io.BytesIO(data), formats=("JPEG", "PNG", "WEBP")) as image:
                image.load()
                # Re-encode pixel data only: remove metadata and any appended payload.
                clean = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
                output = io.BytesIO()
                clean.save(output, format="WEBP", quality=85, exif=b"", icc_profile=None)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=422, detail=f"{name} must be a valid JPEG, PNG or WebP image") from error
    if output.tell() > max_bytes:
        raise HTTPException(status_code=413, detail=f"{name} image exceeds the file size limit after processing")
    return output.getvalue()


def cleanup(storage: image_storage.ImageStorage, keys: list[str | None]) -> None:
    for key in keys:
        if key:
            try:
                storage.delete(key)
            except Exception:
                logger.exception("Could not delete an unused product image object: %s", key)


@router.post("/{product_id}/images", response_model=AdminProductRead)
def upload_images(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
    preview: Annotated[UploadFile, File()],
    detail: Annotated[UploadFile, File()],
) -> Product:
    product = get_product(product_id, db)
    preview_data = validate_image(preview, "preview", 1024 * 1024, 320)
    detail_data = validate_image(detail, "detail", 5 * 1024 * 1024, 1280)
    storage = image_storage.get_image_storage()
    previous_keys = [product.image_preview_key, product.image_detail_key]
    prefix = f"products/{product_id}/{uuid.uuid4().hex}"
    new_keys = [f"{prefix}/preview.webp", f"{prefix}/detail.webp"]
    try:
        preview_url = storage.put(new_keys[0], preview_data)
        detail_url = storage.put(new_keys[1], detail_data)
    except Exception as error:
        cleanup(storage, new_keys)
        raise HTTPException(status_code=503, detail="Image storage upload failed") from error
    try:
        result = db.execute(update(Product).where(
            Product.id == product_id,
            Product.image_preview_key == previous_keys[0], Product.image_detail_key == previous_keys[1],
        ).values(image_preview_key=new_keys[0], image_detail_key=new_keys[1],
                 image_preview_url=preview_url, image_detail_url=detail_url))
        if result.rowcount != 1:
            raise HTTPException(status_code=409, detail="Product images changed; retry the upload")
        db.commit()
    except Exception:
        db.rollback()
        cleanup(storage, new_keys)
        raise
    cleanup(storage, previous_keys)
    db.refresh(product)
    return product


@router.delete("/{product_id}/images", status_code=status.HTTP_204_NO_CONTENT)
def delete_images(product_id: int, db: Annotated[Session, Depends(get_db)]) -> Response:
    product = get_product(product_id, db)
    previous_keys = [product.image_preview_key, product.image_detail_key]
    if not any(previous_keys):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    storage = image_storage.get_image_storage()
    result = db.execute(update(Product).where(
        Product.id == product_id,
        Product.image_preview_key == previous_keys[0], Product.image_detail_key == previous_keys[1],
    ).values(image_preview_key=None, image_detail_key=None, image_preview_url=None, image_detail_url=None))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="Product images changed; retry the deletion")
    db.commit()
    cleanup(storage, previous_keys)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
