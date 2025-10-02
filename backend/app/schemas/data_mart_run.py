"""
Data Mart Run schemas for request/response validation
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, UUID4
from datetime import datetime
from app.models.data_mart_run import DataMartRunStatus


class DataMartRunBase(BaseModel):
    triggered_by: Optional[str] = "manual"
    trigger_payload: Optional[Dict[str, Any]] = None


class DataMartRunCreate(DataMartRunBase):
    data_mart_id: UUID4


class DataMartRunUpdate(BaseModel):
    status: Optional[DataMartRunStatus] = None
    rows_processed: Optional[int] = None
    rows_inserted: Optional[int] = None
    rows_updated: Optional[int] = None
    rows_deleted: Optional[int] = None
    error_message: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    logs: Optional[Dict[str, Any]] = None
    run_metadata: Optional[Dict[str, Any]] = None


class DataMartRunResponse(BaseModel):
    id: UUID4
    data_mart_id: UUID4
    status: DataMartRunStatus
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    rows_processed: int
    rows_inserted: int
    rows_updated: int
    rows_deleted: int
    error_message: Optional[str]
    error_details: Optional[Dict[str, Any]]
    logs: Optional[Dict[str, Any]]
    run_metadata: Optional[Dict[str, Any]]
    triggered_by: Optional[str]
    trigger_payload: Optional[Dict[str, Any]]
    project_id: str
    created_by_id: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class DataMartRunExecute(BaseModel):
    """Schema for executing a data mart run"""
    streams: Optional[list[str]] = None
    config_override: Optional[Dict[str, Any]] = None


class DataMartRunMetrics(BaseModel):
    """Schema for run metrics"""
    rows_processed: int = 0
    rows_inserted: int = 0
    rows_updated: int = 0
    rows_deleted: int = 0
    duration_seconds: Optional[float] = None


class DataMartRunLog(BaseModel):
    """Schema for run log entry"""
    level: str  # INFO, WARNING, ERROR, DEBUG
    message: str
    timestamp: Optional[datetime] = None
    details: Optional[Dict[str, Any]] = None
