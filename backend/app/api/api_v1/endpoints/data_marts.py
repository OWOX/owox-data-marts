from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.auth.idp_guard import get_current_active_user, require_permission
from app.models import User
from app.schemas.data_mart import DataMartResponse, DataMartCreate, DataMartUpdate
from app.services.data_marts.data_mart_service import data_mart_service

router = APIRouter()


@router.get("/", response_model=List[DataMartResponse])
def read_data_marts(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    project_id: str = "default"  # TODO: Get from user context
) -> Any:
    """
    Retrieve data marts for current project
    """
    data_marts = data_mart_service.get_by_project(
        db, project_id=project_id, skip=skip, limit=limit
    )
    return data_marts


@router.post("/", response_model=DataMartResponse)
def create_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_in: DataMartCreate,
    current_user: User = Depends(get_current_active_user),
    project_id: str = "default"  # TODO: Get from user context
) -> Any:
    """
    Create new data mart
    """
    data_mart = data_mart_service.create_data_mart(
        db=db, 
        data_mart_data=data_mart_in, 
        created_by_id=str(current_user.id),
        project_id=project_id
    )
    return data_mart


@router.put("/{data_mart_id}", response_model=DataMartResponse)
def update_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: str,
    data_mart_in: DataMartUpdate,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Update a data mart
    """
    data_mart = data_mart_service.update_data_mart(
        db=db, data_mart_id=data_mart_id, data_mart_data=data_mart_in
    )
    if not data_mart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart not found"
        )
    return data_mart


@router.get("/{data_mart_id}", response_model=DataMartResponse)
def read_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get data mart by ID
    """
    data_mart = data_mart_service.get_by_id(db=db, data_mart_id=data_mart_id)
    if not data_mart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart not found"
        )
    return data_mart


@router.delete("/{data_mart_id}")
def delete_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Delete a data mart
    """
    success = data_mart_service.delete_data_mart(db=db, data_mart_id=data_mart_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart not found"
        )
    return {"message": "Data mart deleted successfully"}


@router.put("/{data_mart_id}/publish", response_model=DataMartResponse)
def publish_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Publish a data mart
    """
    data_mart = data_mart_service.publish_data_mart(db=db, data_mart_id=data_mart_id)
    if not data_mart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart not found"
        )
    return data_mart
