"""
Data Destination API endpoints
Based on base/backend/src/data-marts/controllers/data-destination.controller.ts
"""

from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.auth.idp_guard import get_current_active_user, require_permission
from app.models import User
from app.schemas.data_destination import (
    DataDestinationResponse, 
    DataDestinationCreate, 
    DataDestinationUpdate,
    DataDestinationConnectionTest,
    SecretKeyRotation,
    StorageValidation,
    ValidationResult,
    StorageTypeInfo
)
from app.services.data_marts.data_destination_service import data_destination_service

router = APIRouter()


@router.get("/", response_model=List[DataDestinationResponse])
def read_data_destinations(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    project_id: str = "default"  # TODO: Get from user context
) -> Any:
    """
    Retrieve data destinations for current project
    """
    destinations = data_destination_service.get_by_project(
        db, project_id=project_id, skip=skip, limit=limit
    )
    return destinations


@router.post("/", response_model=DataDestinationResponse)
def create_data_destination(
    *,
    db: Session = Depends(get_db),
    destination_in: DataDestinationCreate,
    current_user: User = Depends(get_current_active_user),  # Simplified for now
    project_id: str = "default"  # TODO: Get from user context
) -> Any:
    """
    Create new data destination
    """
    destination = data_destination_service.create_data_destination(
        db=db, 
        destination_data=destination_in, 
        created_by_id=str(current_user.id),
        project_id=project_id
    )
    return destination


@router.put("/{destination_id}", response_model=DataDestinationResponse)
def update_data_destination(
    *,
    db: Session = Depends(get_db),
    destination_id: str,
    destination_in: DataDestinationUpdate,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Update a data destination
    """
    destination = data_destination_service.update_data_destination(
        db=db, destination_id=destination_id, destination_data=destination_in
    )
    if not destination:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data destination not found"
        )
    return destination


@router.get("/{destination_id}", response_model=DataDestinationResponse)
def read_data_destination(
    *,
    db: Session = Depends(get_db),
    destination_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get data destination by ID
    """
    # Validate UUID format
    try:
        from uuid import UUID
        UUID(destination_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid UUID format: {destination_id}. Expected a valid UUID."
        )
    
    destination = data_destination_service.get_by_id(db=db, destination_id=destination_id)
    if not destination:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data destination not found"
        )
    return destination


@router.delete("/{destination_id}")
def delete_data_destination(
    *,
    db: Session = Depends(get_db),
    destination_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Delete a data destination
    """
    success = data_destination_service.delete_data_destination(db=db, destination_id=destination_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data destination not found"
        )
    return {"message": "Data destination deleted successfully"}


@router.post("/{destination_id}/test-connection", response_model=DataDestinationConnectionTest)
def test_destination_connection(
    *,
    db: Session = Depends(get_db),
    destination_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Test connection to a data destination
    """
    result = data_destination_service.test_connection(db=db, destination_id=destination_id)
    return result


@router.post("/{destination_id}/rotate-secret-key", response_model=SecretKeyRotation)
def rotate_destination_secret_key(
    *,
    db: Session = Depends(get_db),
    destination_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Rotate secret key for a data destination
    """
    result = data_destination_service.rotate_secret_key(db=db, destination_id=destination_id)
    return result


@router.post("/{destination_id}/validate", response_model=StorageValidation)
def validate_destination_configuration(
    *,
    db: Session = Depends(get_db),
    destination_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Validate a data destination configuration
    """
    result = data_destination_service.validate_configuration(db=db, destination_id=destination_id)
    return result


@router.get("/{destination_id}/schema")
def get_destination_schema(
    *,
    db: Session = Depends(get_db),
    destination_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get schema information for a destination
    """
    destination = data_destination_service.get_by_id(db=db, destination_id=destination_id)
    if not destination:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data destination not found"
        )
    
    return {
        "storage_destination_id": destination.id,
        "unique_key_columns": destination.unique_key_columns,
        "schema_definition": destination.schema_definition,
        "storage_type": destination.storage_type,
        "configuration": destination.configuration
    }
