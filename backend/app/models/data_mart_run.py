from sqlalchemy import Column, String, Text, DateTime, JSON, Enum, Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class DataMartRunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DataMartRun(Base):
    __tablename__ = "data_mart_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Reference to the data mart
    data_mart_id = Column(UUID(as_uuid=True), ForeignKey("data_marts.id"), nullable=False)
    
    # Run information
    status = Column(Enum(DataMartRunStatus), default=DataMartRunStatus.PENDING)
    
    # Execution details
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    
    # Results and metrics
    rows_processed = Column(Integer, default=0)
    rows_inserted = Column(Integer, default=0)
    rows_updated = Column(Integer, default=0)
    rows_deleted = Column(Integer, default=0)
    
    # Error information
    error_message = Column(Text, nullable=True)
    error_details = Column(JSON, nullable=True)
    
    # Execution logs and metadata
    logs = Column(JSON, nullable=True)  # Structured logs
    run_metadata = Column(JSON, nullable=True)  # Additional run metadata
    
    # Trigger information
    triggered_by = Column(String(100), nullable=True)  # manual, scheduled, api
    trigger_payload = Column(JSON, nullable=True)  # Additional trigger data
    
    # Project information
    project_id = Column(String(255), nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    data_mart = relationship("DataMart", back_populates="runs")
    connector_states = relationship("ConnectorState", back_populates="data_mart_run")
    
    @property
    def duration_seconds(self):
        """Calculate run duration in seconds"""
        if self.started_at and self.finished_at:
            return (self.finished_at - self.started_at).total_seconds()
        return None
    
    @property
    def is_running(self):
        """Check if the run is currently active"""
        return self.status in [DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING]
    
    def __repr__(self):
        return f"<DataMartRun(id={self.id}, data_mart_id={self.data_mart_id}, status='{self.status}')>"
