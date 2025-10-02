"""
Pydantic schemas for Data Connector (pipeline orchestration)
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, UUID4


# Base schema with common fields
class DataConnectorBase(BaseModel):
    name: str
    description: Optional[str] = None
    source_collection_id: str
    destination_id: UUID4


# Schema for creating a new data connector
class DataConnectorCreate(DataConnectorBase):
    pass


# Schema for updating a data connector
class DataConnectorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None


# Schema for reading data connector (response)
class DataConnectorResponse(DataConnectorBase):
    id: UUID4
    source_collection_name: str
    destination_name: str
    destination_type: str
    status: str
    is_active: bool
    last_execution_at: Optional[datetime] = None
    last_execution_status: Optional[str] = None
    records_transferred: int
    success_rate: int
    csv_filename: Optional[str] = None  # For CSV downloads
    error_message: Optional[str] = None  # For failed transfers
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by_id: UUID4

    class Config:
        from_attributes = True


# Schema for connector execution request
class DataConnectorExecuteRequest(BaseModel):
    force: Optional[bool] = False  # Force execution even if already running


# Schema for connector execution response
class DataConnectorExecuteResponse(BaseModel):
    status: str
    message: str
    execution_id: Optional[str] = None
    connector_id: UUID4
