"""Persistent S3-compatible object storage for product images."""
import os
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from fastapi import HTTPException


class ImageStorage:
    def __init__(self, client, bucket: str, public_base_url: str):
        self.client = client
        self.bucket = bucket
        self.public_base_url = public_base_url.rstrip("/")

    def put(self, key: str, content: bytes) -> str:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content, ContentType="image/webp")
        return f"{self.public_base_url}/{key}"

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


def get_image_storage() -> ImageStorage:
    bucket = os.getenv("IMAGE_STORAGE_BUCKET", "").strip()
    access_key = os.getenv("IMAGE_STORAGE_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("IMAGE_STORAGE_SECRET_ACCESS_KEY", "").strip()
    public_url = os.getenv("IMAGE_PUBLIC_BASE_URL", "").strip()
    endpoint = os.getenv("IMAGE_STORAGE_ENDPOINT", "").strip() or None
    region = os.getenv("IMAGE_STORAGE_REGION", "auto").strip()
    if not all((bucket, access_key, secret_key, public_url, region)):
        raise HTTPException(status_code=503, detail="Image storage is not configured")
    for url in (public_url, endpoint):
        if url:
            parsed = urlsplit(url)
            if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment or parsed.username or parsed.password:
                raise HTTPException(status_code=503, detail="Image storage URL configuration is invalid")
    client = boto3.client(
        "s3", endpoint_url=endpoint, region_name=region,
        aws_access_key_id=access_key, aws_secret_access_key=secret_key,
        config=Config(connect_timeout=5, read_timeout=15, retries={"max_attempts": 2}),
    )
    return ImageStorage(client, bucket, public_url)
