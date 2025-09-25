from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_data_mart import data_mart as crud_data_mart
from app.database.database import get_db
from app.models.user import User
from app.schemas.data_mart import DataMart, DataMartCreate, DataMartUpdate

router = APIRouter()


@router.get("/", response_model=List[DataMart])
def read_data_marts(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve data marts for current user
    """
    data_marts = crud_data_mart.get_multi_by_user(
        db, user_id=current_user.id, skip=skip, limit=limit
    )
    return data_marts


@router.post("/", response_model=DataMart)
def create_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_in: DataMartCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new data mart
    """
    data_mart = crud_data_mart.create_with_user(
        db=db, obj_in=data_mart_in, user_id=current_user.id
    )
    return data_mart


@router.put("/{data_mart_id}", response_model=DataMart)
def update_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: int,
    data_mart_in: DataMartUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a data mart
    """
    data_mart = crud_data_mart.get(db=db, id=data_mart_id)
    if not data_mart:
        raise HTTPException(status_code=404, detail="Data mart not found")
    if data_mart.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    data_mart = crud_data_mart.update(db=db, db_obj=data_mart, obj_in=data_mart_in)
    return data_mart


@router.get("/{data_mart_id}", response_model=DataMart)
def read_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get data mart by ID
    """
    data_mart = crud_data_mart.get(db=db, id=data_mart_id)
    if not data_mart:
        raise HTTPException(status_code=404, detail="Data mart not found")
    if data_mart.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return data_mart


@router.delete("/{data_mart_id}")
def delete_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a data mart
    """
    data_mart = crud_data_mart.get(db=db, id=data_mart_id)
    if not data_mart:
        raise HTTPException(status_code=404, detail="Data mart not found")
    if data_mart.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    data_mart = crud_data_mart.remove(db=db, id=data_mart_id)
    return {"message": "Data mart deleted successfully"}
