from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from app.models.data_mart import DataMartStatus, DataMartType


class DataMartBase(BaseModel):
    title: str
    description: Optional[str] = None
    mart_type: DataMartType
    source_platform: Optional[str] = None
    sql_query: Optional[str] = None
    is_scheduled: bool = False


class DataMartCreate(DataMartBase):
    configuration: Optional[Dict[str, Any]] = None
    schedule_config: Optional[Dict[str, Any]] = None


class DataMartUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[DataMartStatus] = None
    configuration: Optional[Dict[str, Any]] = None
    sql_query: Optional[str] = None
    is_scheduled: Optional[bool] = None
    schedule_config: Optional[Dict[str, Any]] = None


class DataMart(DataMartBase):
    id: int
    user_id: int
    status: DataMartStatus
    configuration: Optional[Dict[str, Any]]
    schedule_config: Optional[Dict[str, Any]]
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
