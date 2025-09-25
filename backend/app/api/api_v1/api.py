from fastapi import APIRouter
from app.api.api_v1.endpoints import auth, users, platform_credentials, data_marts, data_collections, reports, platforms

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(platform_credentials.router, prefix="/platform-credentials", tags=["platform-credentials"])
api_router.include_router(platforms.router, prefix="/platforms", tags=["platforms"])
api_router.include_router(data_marts.router, prefix="/data-marts", tags=["data-marts"])
api_router.include_router(data_collections.router, prefix="/data-collections", tags=["data-collections"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
