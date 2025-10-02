from typing import Optional, Dict, Any
from pydantic import BaseModel, UUID4, Field
from datetime import datetime
from app.models.data_mart import DataMartStatus, DataMartDefinitionType


class DataMartBase(BaseModel):
    title: str
    description: Optional[str] = None
    storage_id: Optional[UUID4] = None  # Optional - can use destination_id instead
    destination_id: Optional[UUID4] = None
    definition_type: Optional[DataMartDefinitionType] = None
    definition: Optional[Dict[str, Any]] = None
    schema_definition: Optional[Dict[str, Any]] = Field(None, alias='schema')
    
    class Config:
        populate_by_name = True


class DataMartCreate(DataMartBase):
    pass


class DataMartUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    storage_id: Optional[UUID4] = None
    destination_id: Optional[UUID4] = None
    definition_type: Optional[DataMartDefinitionType] = None
    definition: Optional[Dict[str, Any]] = None
    schema_definition: Optional[Dict[str, Any]] = Field(None, alias='schema')
    status: Optional[DataMartStatus] = None
    
    class Config:
        populate_by_name = True


class DataMartResponse(DataMartBase):
    id: UUID4
    status: DataMartStatus
    project_id: str
    created_by_id: UUID4
    created_at: datetime
    updated_at: Optional[datetime]
    deleted_at: Optional[datetime]

    class Config:
        from_attributes = True


# Legacy alias for backward compatibility
DataMart = DataMartResponse
