"""
Connector Run Pydantic schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from uuid import UUID


# Shared properties
class ConnectorRunBase(BaseModel):
    execution_id: str
    status: str = "pending"
    source_collection_name: Optional[str] = None
    destination_name: Optional[str] = None
    destination_type: Optional[str] = None


# Properties to receive on run creation
class ConnectorRunCreate(ConnectorRunBase):
    connector_id: UUID
    triggered_by_id: UUID
    scheduled_job_id: Optional[UUID] = None


# Properties to receive on run update
class ConnectorRunUpdate(BaseModel):
    status: Optional[str] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    extracted_records: Optional[int] = None
    transformed_records: Optional[int] = None
    loaded_records: Optional[int] = None
    failed_records: Optional[int] = None
    error_message: Optional[str] = None


# Properties shared by models stored in DB
class ConnectorRunInDBBase(ConnectorRunBase):
    id: UUID
    connector_id: UUID
    scheduled_job_id: Optional[UUID] = None
    triggered_by_id: UUID
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    extracted_records: int = 0
    transformed_records: int = 0
    loaded_records: int = 0
    failed_records: int = 0
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


# Properties to return to client
class ConnectorRun(ConnectorRunInDBBase):
    pass


# Properties stored in DB
class ConnectorRunInDB(ConnectorRunInDBBase):
    pass
