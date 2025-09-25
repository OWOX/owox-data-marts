from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.database import Base
import enum


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

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    data_mart_id = Column(Integer, ForeignKey("data_marts.id"), nullable=False)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Report configuration
    report_type = Column(Enum(ReportType), nullable=False)
    status = Column(Enum(ReportStatus), default=ReportStatus.DRAFT)
    
    # Report definition
    report_config = Column(JSON, nullable=True)  # Chart configs, filters, etc.
    
    # Sharing and permissions
    is_public = Column(Boolean, default=False)
    share_token = Column(String(255), nullable=True, unique=True)
    
    # Caching
    cached_data = Column(JSON, nullable=True)
    cache_expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    view_count = Column(Integer, default=0)
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="reports")
    data_mart = relationship("DataMart", back_populates="reports")
