import base64
import uuid
import os
from supabase import create_client, Client

from app.core.config import settings

# TODO: Replace with your actual Supabase URL and Anon Key
SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_KEY = settings.SUPABASE_KEY

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "desertification-visuals"

def upload_base64_image(base64_str: str, folder: str, file_extension: str) -> str:
    """Decodes a base64 string, uploads it to Supabase Storage, and returns the public URL."""
    image_bytes = base64.b64decode(base64_str)
    filename = f"{folder}/{uuid.uuid4().hex}.{file_extension}"
    content_type = 'image/gif' if file_extension == 'gif' else 'image/png'
    
    supabase.storage.from_(BUCKET_NAME).upload(
        file=image_bytes,
        path=filename,
        file_options={"content-type": content_type}
    )
    
    return supabase.storage.from_(BUCKET_NAME).get_public_url(filename)

def save_analysis_record(analysis_type: str, coords: list, area_sq_km: float, visual_urls: dict) -> str:
    """Saves the metadata and the newly generated image URLs to the PostgreSQL database."""
    data = {
        "analysis_type": analysis_type,
        "coordinates": coords,
        "area_sq_km": area_sq_km,
        "visualizations": visual_urls
    }
    
    response = supabase.table("analyses").insert(data).execute()
    return response.data[0]['id']