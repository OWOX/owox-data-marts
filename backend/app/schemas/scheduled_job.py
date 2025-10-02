"""
Scheduled Job Pydantic schemas
"""
from datetime import datetime
from typing import Optional, Union
from pydantic import BaseModel, validator
from uuid import UUID


# Shared properties
class ScheduledJobBase(BaseModel):
    name: str
    description: Optional[str] = None
    scheduled_at: datetime
    repeat_type: str = "once"  # once, daily, weekly, monthly


# Properties to receive on job creation
class ScheduledJobCreate(ScheduledJobBase):
    connector_id: Optional[UUID] = None  # Will be set by the API endpoint
    
    @validator('scheduled_at', pre=True)
    def parse_scheduled_at(cls, v):
        if isinstance(v, str):
            try:
                # Try parsing with timezone
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                # Try parsing without timezone, assume UTC
                return datetime.fromisoformat(v)
        return v


# Properties to receive on job update
class ScheduledJobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    repeat_type: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


# Properties shared by models stored in DB
class ScheduledJobInDBBase(ScheduledJobBase):
    id: UUID
    connector_id: UUID
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    is_active: bool
    created_by_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Properties to return to client
class ScheduledJob(ScheduledJobInDBBase):
    pass


# Properties stored in DB
class ScheduledJobInDB(ScheduledJobInDBBase):
    pass
