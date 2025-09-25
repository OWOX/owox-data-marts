from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_data_collection import data_collection as crud_data_collection
from app.database.database import get_db
from app.models.user import User
from app.schemas.data_collection import DataCollection, DataCollectionCreate, DataCollectionUpdate

router = APIRouter()


@router.get("/", response_model=List[DataCollection])
def read_data_collections(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve data collections for current user
    """
    collections = crud_data_collection.get_multi_by_user(
        db, user_id=current_user.id, skip=skip, limit=limit
    )
    return collections


@router.post("/", response_model=DataCollection)
def create_data_collection(
    *,
    db: Session = Depends(get_db),
    collection_in: DataCollectionCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new data collection
    """
    collection = crud_data_collection.create_with_user(
        db=db, obj_in=collection_in, user_id=current_user.id
    )
    return collection


@router.put("/{collection_id}", response_model=DataCollection)
def update_data_collection(
    *,
    db: Session = Depends(get_db),
    collection_id: int,
    collection_in: DataCollectionUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a data collection
    """
    collection = crud_data_collection.get(db=db, id=collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Data collection not found")
    if collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    collection = crud_data_collection.update(db=db, db_obj=collection, obj_in=collection_in)
    return collection


@router.get("/{collection_id}", response_model=DataCollection)
def read_data_collection(
    *,
    db: Session = Depends(get_db),
    collection_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get data collection by ID
    """
    collection = crud_data_collection.get(db=db, id=collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Data collection not found")
    if collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return collection


@router.delete("/{collection_id}")
def delete_data_collection(
    *,
    db: Session = Depends(get_db),
    collection_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a data collection
    """
    collection = crud_data_collection.get(db=db, id=collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Data collection not found")
    if collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    collection = crud_data_collection.remove(db=db, id=collection_id)
    return {"message": "Data collection deleted successfully"}


@router.post("/{collection_id}/start")
def start_data_collection(
    *,
    db: Session = Depends(get_db),
    collection_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Start a data collection process
    """
    collection = crud_data_collection.get(db=db, id=collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Data collection not found")
    if collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # TODO: Implement actual data collection logic with Celery
    # For now, just update the status
    from app.models.data_collection import CollectionStatus
    from datetime import datetime
    
    collection.status = CollectionStatus.RUNNING
    collection.started_at = datetime.utcnow()
    db.add(collection)
    db.commit()
    db.refresh(collection)
    
    return {"message": "Data collection started", "collection_id": collection_id}
