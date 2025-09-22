from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from app.models.data_collection import CollectionStatus


class DataCollectionBase(BaseModel):
    collection_name: str
    collection_params: Optional[Dict[str, Any]] = None


class DataCollectionCreate(DataCollectionBase):
    data_mart_id: int
    platform_credential_id: Optional[int] = None


class DataCollectionUpdate(BaseModel):
    status: Optional[CollectionStatus] = None
    total_records: Optional[int] = None
    processed_records: Optional[int] = None
    failed_records: Optional[int] = None
    progress_percentage: Optional[int] = None
    error_message: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    result_summary: Optional[Dict[str, Any]] = None


class DataCollection(DataCollectionBase):
    id: int
    user_id: int
    data_mart_id: int
    platform_credential_id: Optional[int]
    status: CollectionStatus
    total_records: Optional[int]
    processed_records: int
    failed_records: int
    progress_percentage: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    error_details: Optional[Dict[str, Any]]
    result_summary: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
