from fastapi import APIRouter
from app.api.api_v1.endpoints import (
    auth, 
    users, 
    platform_credentials, 
    data_marts, 
    data_collections, 
    reports, 
    platforms,
    data_storages,
    data_destinations,
    data_mart_runs,
    connectors,
    data_connectors,
    connector_runs,
    storage_types,
    health,
    data_browser,
    exports
)

api_router = APIRouter()

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])

# Legacy endpoints (to be deprecated)
api_router.include_router(platform_credentials.router, prefix="/platform-credentials", tags=["platform-credentials"])
api_router.include_router(platforms.router, prefix="/platforms", tags=["platforms"])
api_router.include_router(data_collections.router, prefix="/data-collections", tags=["data-collections"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])

# Health and monitoring
api_router.include_router(health.router, prefix="/health", tags=["health"])

# New OWOX Data Marts endpoints
api_router.include_router(data_marts.router, prefix="/data-marts", tags=["data-marts"])
api_router.include_router(data_storages.router, prefix="/data-storages", tags=["data-storages"])
api_router.include_router(data_destinations.router, prefix="/data-destinations", tags=["data-destinations"])
api_router.include_router(data_mart_runs.router, prefix="/data-mart-runs", tags=["data-mart-runs"])
api_router.include_router(connectors.router, prefix="/connectors", tags=["connectors"])
api_router.include_router(data_connectors.router, prefix="/data-connectors", tags=["data-connectors"])
api_router.include_router(connector_runs.router, prefix="/connector-runs", tags=["connector-runs"])
api_router.include_router(storage_types.router, prefix="/storage", tags=["storage-types"])
api_router.include_router(data_browser.router, prefix="/data-browser", tags=["data-browser"])
api_router.include_router(exports.router, prefix="/exports", tags=["exports"])
