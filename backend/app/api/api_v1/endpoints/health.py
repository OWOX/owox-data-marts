"""
Health Check API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database.database import get_db
from app.core.config import settings
import redis
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "service": "OWOX Data Marts API",
        "version": "1.0.0"
    }


@router.get("/detailed")
def detailed_health_check(db: Session = Depends(get_db)):
    """Detailed health check including database and Redis"""
    health_status = {
        "status": "healthy",
        "service": "OWOX Data Marts API",
        "version": "1.0.0",
        "checks": {}
    }
    
    # Database check
    try:
        result = db.execute(text("SELECT 1"))
        result.fetchone()
        health_status["checks"]["database"] = {
            "status": "healthy",
            "message": "Database connection successful"
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "message": f"Database connection failed: {str(e)}"
        }
        health_status["status"] = "unhealthy"
    
    # Redis check
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        health_status["checks"]["redis"] = {
            "status": "healthy",
            "message": "Redis connection successful"
        }
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        health_status["checks"]["redis"] = {
            "status": "unhealthy",
            "message": f"Redis connection failed: {str(e)}"
        }
        if health_status["status"] == "healthy":
            health_status["status"] = "degraded"
    
    # Configuration check
    health_status["checks"]["configuration"] = {
        "status": "healthy",
        "database_url": settings.DATABASE_URL.split('@')[0] + "@***",  # Hide credentials
        "redis_url": settings.REDIS_URL.split('@')[0] + "@***" if '@' in settings.REDIS_URL else settings.REDIS_URL,
        "environment": "development" if settings.DEBUG else "production"
    }
    
    return health_status


@router.get("/ready")
def readiness_check(db: Session = Depends(get_db)):
    """Readiness check for Kubernetes/Docker health checks"""
    try:
        # Check database connection
        db.execute(text("SELECT 1"))
        
        # Check Redis connection
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail="Service not ready")


@router.get("/live")
def liveness_check():
    """Liveness check for Kubernetes/Docker health checks"""
    return {"status": "alive"}
