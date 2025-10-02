from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID


class PlatformDataCollectionBase(BaseModel):
    platform_name: str
    collection_name: str
    collection_params: Optional[Dict[str, Any]] = None


class PlatformDataCollectionCreate(PlatformDataCollectionBase):
    platform_credential_id: int


class PlatformDataCollectionUpdate(BaseModel):
    collection_name: Optional[str] = None
    status: Optional[str] = None
    total_records: Optional[int] = None
    records_collected: Optional[int] = None
    records_failed: Optional[int] = None
    progress_percentage: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    collected_data: Optional[List[Dict[str, Any]]] = None
    result_summary: Optional[Dict[str, Any]] = None


class PlatformDataCollectionResponse(PlatformDataCollectionBase):
    id: UUID
    user_id: UUID
    platform_credential_id: int
    status: str
    total_records: Optional[int] = None
    records_collected: int
    records_failed: int
    progress_percentage: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    result_summary: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PlatformDataCollectionWithData(PlatformDataCollectionResponse):
    collected_data: Optional[List[Dict[str, Any]]] = None
    error_details: Optional[Dict[str, Any]] = None


# Request schemas for data collection endpoints
class LinkedInDataCollectionRequest(BaseModel):
    platform_credential_id: int
    account_urns: List[str]
    start_date: str
    end_date: str
    fields: List[str]
    collection_name: Optional[str] = None
