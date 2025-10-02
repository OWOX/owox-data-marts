from typing import Optional, Dict, Any
from pydantic import BaseModel, UUID4
from datetime import datetime
from app.models.report import ReportStatus, ReportType


class ReportBase(BaseModel):
    title: str
    description: Optional[str] = None
    report_type: ReportType
    is_public: bool = False


class ReportCreate(ReportBase):
    data_mart_id: UUID4
    report_config: Optional[Dict[str, Any]] = None


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ReportStatus] = None
    report_config: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = None


class Report(ReportBase):
    id: UUID4
    created_by_id: UUID4
    data_mart_id: UUID4
    status: ReportStatus
    project_id: str
    config: Optional[Dict[str, Any]]
    query: Optional[str]
    share_token: Optional[str]
    view_count: str
    last_viewed_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
