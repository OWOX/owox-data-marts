from typing import List, Optional
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://owox_user:password@localhost:5432/owox_data_marts"
    
    # Security
    SECRET_KEY: str = "your-super-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # API
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "OWOX Data Marts API"
    DEBUG: bool = True
    
    # CORS
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []
    
    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: str | List[str]) -> List[str] | str:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
