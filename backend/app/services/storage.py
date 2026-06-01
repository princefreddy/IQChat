import os
import boto3
import logging

logger = logging.getLogger(__name__)

# S3 Configuration
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")  # E.g., https://<account_id>.r2.cloudflarestorage.com
S3_PUBLIC_URL = os.getenv("S3_PUBLIC_URL")        # E.g., https://pub-xxx.r2.dev or custom domain

def is_s3_configured() -> bool:
    return bool(S3_BUCKET_NAME and S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY)

def upload_file_to_s3(file_content: bytes, filename: str, content_type: str) -> str:
    """
    Upload a file to S3/Cloudflare R2 and return the public URL.
    """
    try:
        # Create boto3 client with custom endpoint if provided (for R2)
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
            endpoint_url=S3_ENDPOINT_URL,  # Optional, defaults to AWS S3
        )
        
        # Upload file content
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=filename,
            Body=file_content,
            ContentType=content_type,
        )
        
        # Build URL
        if S3_PUBLIC_URL:
            # Ensure the public URL doesn't have a trailing slash
            public_url = S3_PUBLIC_URL.rstrip('/')
            return f"{public_url}/{filename}"
        elif S3_ENDPOINT_URL:
            return f"{S3_ENDPOINT_URL.rstrip('/')}/{S3_BUCKET_NAME}/{filename}"
        else:
            return f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{filename}"
            
    except Exception as e:
        logger.error(f"S3 Upload failed: {e}")
        raise e
