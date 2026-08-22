import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Desertification Risk API"
    EE_PROJECT: str = "desertification-risk"
    
    # HuggingFace Repositories
    HF_REPO_MODEL_A: str = "ahmedfarazsyk/Sindh-Desertification-UNet-ModelA"
    HF_REPO_MODEL_B: str = "ahmedfarazsyk/Sindh-Desertification-ConvGRU-ModelB-v5"

    google_api_key: str
    MONGO_URI: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    
    # Ephemeral storage for ECS/Docker
    TEMP_DIR: str = "/tmp/desertification_api"
    CHECKPOINT_DIR: str = os.path.join(TEMP_DIR, "checkpoints")

    class Config:
        env_file = ".env"

settings = Settings()
os.makedirs(settings.TEMP_DIR, exist_ok=True)
os.makedirs(settings.CHECKPOINT_DIR, exist_ok=True)