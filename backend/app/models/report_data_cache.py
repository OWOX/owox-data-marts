from sqlalchemy import Column, String, Text, DateTime, JSON, Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import uuid


class ReportDataCache(Base):
    __tablename__ = "report_data_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Reference to the report
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id"), nullable=False)
    
    # Cache key and metadata
    cache_key = Column(String(255), nullable=False, unique=True, index=True)
    cache_version = Column(String(50), default="1.0")
    
    # Cached data
    data = Column(JSON, nullable=False)  # The actual cached report data
    cache_metadata = Column(JSON, nullable=True)  # Additional metadata about the cache
    
    # Cache statistics
    data_size_bytes = Column(Integer, default=0)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    
    # Cache lifecycle
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_accessed_at = Column(DateTime(timezone=True), nullable=True)
    access_count = Column(Integer, default=0)
    
    # Cache status
    is_valid = Column(Boolean, default=True)
    is_compressed = Column(Boolean, default=False)
    
    # Generation information
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    generation_duration_ms = Column(Integer, nullable=True)
    
    # Project information
    project_id = Column(String(255), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    report = relationship("Report", back_populates="data_cache")
    
    @property
    def is_expired(self):
        """Check if the cache has expired"""
        if not self.expires_at:
            return False
        from datetime import datetime, timezone
        return datetime.now(timezone.utc) > self.expires_at
    
    @property
    def size_mb(self):
        """Get cache size in MB"""
        if self.data_size_bytes:
            return round(self.data_size_bytes / (1024 * 1024), 2)
        return 0
    
    def touch(self):
        """Update last accessed time and increment access count"""
        from datetime import datetime, timezone
        self.last_accessed_at = datetime.now(timezone.utc)
        self.access_count += 1
    
    def __repr__(self):
        return f"<ReportDataCache(id={self.id}, report_id={self.report_id}, cache_key='{self.cache_key}')>"
