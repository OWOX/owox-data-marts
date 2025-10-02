import logging
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.core.config import settings
from app.api.api_v1.api import api_router

# Configure logging for LinkedIn debugging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/app/linkedin_debug.log', mode='a')
    ]
)

# Set specific logger levels for LinkedIn debugging
logging.getLogger('app.services.platforms.linkedin_service').setLevel(logging.INFO)
logging.getLogger('app.api.api_v1.endpoints.platforms').setLevel(logging.INFO)
logging.getLogger('httpx').setLevel(logging.DEBUG)  # To see HTTP requests

logger = logging.getLogger(__name__)
logger.info("🚀 FastAPI application starting with enhanced LinkedIn logging")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="FastAPI backend for OWOX Data Marts - Self-Service Analytics Platform",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js frontend
        "http://localhost:8000",  # FastAPI backend (for Swagger UI)
        "http://127.0.0.1:8000",  # Alternative localhost
        "*"  # Allow all origins in development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

# Create uploads directory if it doesn't exist and mount static files
uploads_dir = Path("/app/uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


@app.get("/")
async def root():
    return {
        "message": "OWOX Data Marts API",
        "version": "1.0.0",
        "docs": f"{settings.API_V1_STR}/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
