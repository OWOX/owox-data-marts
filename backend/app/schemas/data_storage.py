"""
Data Storage schemas for request/response validation
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, UUID4
from datetime import datetime
from app.models.data_storage import DataStorageType


class DataStorageBase(BaseModel):
    title: str
    description: Optional[str] = None
    storage_type: DataStorageType
    config: Dict[str, Any]
    credentials: Dict[str, Any]


class DataStorageCreate(DataStorageBase):
    pass


class DataStorageUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    credentials: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class DataStorageResponse(BaseModel):
    id: UUID4
    title: str
    description: Optional[str]
    storage_type: DataStorageType
    config: Dict[str, Any]
    # Note: credentials are excluded from response for security
    is_active: bool
    project_id: str
    created_by_id: str
    created_at: datetime
    updated_at: Optional[datetime]
    deleted_at: Optional[datetime]

    class Config:
        from_attributes = True


class DataStorageConnectionTest(BaseModel):
    """Schema for connection test results"""
    status: str
    message: str
    details: Optional[Dict[str, Any]] = None


# BigQuery specific schemas
class BigQueryConfig(BaseModel):
    project_id: str
    dataset_id: str
    location: Optional[str] = "US"


class BigQueryCredentials(BaseModel):
    service_account_key: Dict[str, Any]


# Athena specific schemas
class AthenaConfig(BaseModel):
    database: str
    workgroup: str
    s3_output_location: str
    region: Optional[str] = "us-east-1"


class AthenaCredentials(BaseModel):
    access_key_id: str
    secret_access_key: str
    session_token: Optional[str] = None
