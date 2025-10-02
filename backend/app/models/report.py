from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ReportType(str, enum.Enum):
    DASHBOARD = "dashboard"
    TABLE = "table"
    CHART = "chart"
    EXPORT = "export"


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Reference to data mart
    data_mart_id = Column(UUID(as_uuid=True), ForeignKey("data_marts.id"), nullable=False)
    
    # Basic information
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Report configuration
    report_type = Column(Enum(ReportType), nullable=False)
    status = Column(Enum(ReportStatus), default=ReportStatus.DRAFT)
    
    # Report definition and configuration
    config = Column(JSON, nullable=True)  # Report configuration (filters, charts, etc.)
    query = Column(Text, nullable=True)  # SQL query for the report
    
    # Sharing and permissions
    is_public = Column(Boolean, default=False)
    share_token = Column(String(255), nullable=True, unique=True)
    
    # Metadata
    view_count = Column(String(50), default="0")
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Project and ownership
    project_id = Column(String(255), nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    data_mart = relationship("DataMart", back_populates="reports")
    data_cache = relationship("ReportDataCache", back_populates="report", uselist=False)
    
    def __repr__(self):
        return f"<Report(id={self.id}, title='{self.title}', type='{self.report_type}')>"
