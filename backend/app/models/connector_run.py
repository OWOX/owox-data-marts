"""
Connector Run model for tracking data connector executions
"""
from sqlalchemy import Column, String, DateTime, Integer, Float, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database.base import Base


class ConnectorRun(Base):
    __tablename__ = "connector_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    execution_id = Column(String(255), unique=True, index=True, nullable=False)
    
    # Foreign keys
    connector_id = Column(UUID(as_uuid=True), ForeignKey("data_connectors.id"), nullable=False, index=True)
    scheduled_job_id = Column(UUID(as_uuid=True), ForeignKey("scheduled_jobs.id"), nullable=True, index=True)
    triggered_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Execution details
    status = Column(String(50), nullable=False, default="pending")  # pending, running, completed, failed
    started_at = Column(DateTime(timezone=True), default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    
    # Data processing metrics
    extracted_records = Column(Integer, default=0)
    transformed_records = Column(Integer, default=0)
    loaded_records = Column(Integer, default=0)
    failed_records = Column(Integer, default=0)
    
    # Source and destination info
    source_collection_name = Column(String(255), nullable=True)
    destination_name = Column(String(255), nullable=True)
    destination_type = Column(String(100), nullable=True)
    
    # Error handling
    error_message = Column(Text, nullable=True)
    error_details = Column(Text, nullable=True)
    
    # Relationships
    connector = relationship("DataConnector")
    scheduled_job = relationship("ScheduledJob")
    triggered_by = relationship("User")
