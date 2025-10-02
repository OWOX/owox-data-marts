"""
Data Storage API endpoints
Based on base/backend/src/data-marts/controllers/data-storage.controller.ts
"""

from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.auth.idp_guard import get_current_active_user, require_permission
from app.models import User
from app.schemas.data_storage import (
    DataStorageResponse, 
    DataStorageCreate, 
    DataStorageUpdate,
    DataStorageConnectionTest
)
from app.services.data_marts.data_storage_service import data_storage_service

router = APIRouter()


@router.get("/", response_model=List[DataStorageResponse])
def read_data_storages(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    project_id: str = "default"  # TODO: Get from user context
) -> Any:
    """
    Retrieve data storages for current project
    """
    storages = data_storage_service.get_by_project(
        db, project_id=project_id, skip=skip, limit=limit
    )
    return storages


@router.post("/", response_model=DataStorageResponse)
def create_data_storage(
    *,
    db: Session = Depends(get_db),
    storage_in: DataStorageCreate,
    current_user: User = Depends(require_permission("data_storages", "create")),
    project_id: str = "default"  # TODO: Get from user context
) -> Any:
    """
    Create new data storage
    """
    storage = data_storage_service.create_data_storage(
        db=db, 
        storage_data=storage_in, 
        created_by_id=str(current_user.id),
        project_id=project_id
    )
    return storage


@router.put("/{storage_id}", response_model=DataStorageResponse)
def update_data_storage(
    *,
    db: Session = Depends(get_db),
    storage_id: str,
    storage_in: DataStorageUpdate,
    current_user: User = Depends(require_permission("data_storages", "update")),
) -> Any:
    """
    Update a data storage
    """
    storage = data_storage_service.update_data_storage(
        db=db, storage_id=storage_id, storage_data=storage_in
    )
    if not storage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data storage not found"
        )
    return storage


@router.get("/{storage_id}", response_model=DataStorageResponse)
def read_data_storage(
    *,
    db: Session = Depends(get_db),
    storage_id: str,
    current_user: User = Depends(require_permission("data_storages", "read")),
) -> Any:
    """
    Get data storage by ID
    """
    storage = data_storage_service.get_by_id(db=db, storage_id=storage_id)
    if not storage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data storage not found"
        )
    return storage


@router.delete("/{storage_id}")
def delete_data_storage(
    *,
    db: Session = Depends(get_db),
    storage_id: str,
    current_user: User = Depends(require_permission("data_storages", "delete")),
) -> Any:
    """
    Delete a data storage
    """
    success = data_storage_service.delete_data_storage(db=db, storage_id=storage_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data storage not found"
        )
    return {"message": "Data storage deleted successfully"}


@router.post("/{storage_id}/test-connection", response_model=DataStorageConnectionTest)
def test_storage_connection(
    *,
    db: Session = Depends(get_db),
    storage_id: str,
    current_user: User = Depends(require_permission("data_storages", "test")),
) -> Any:
    """
    Test connection to a data storage
    """
    result = data_storage_service.test_connection(db=db, storage_id=storage_id)
    return result
