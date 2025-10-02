"""
Data Connector model for pipeline orchestration between collections and destinations
"""
from sqlalchemy import Column, String, DateTime, Boolean, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database.base import Base

class DataConnector(Base):
    __tablename__ = "data_connectors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text)
    
    # Source: Data Collection
    source_collection_id = Column(String, nullable=False, index=True)
    source_collection_name = Column(String, nullable=False)
    
    # Target: Storage Destination
    destination_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    destination_name = Column(String, nullable=False)
    destination_type = Column(String, nullable=False)
    
    # Status and execution tracking
    status = Column(String, default="idle")  # idle, running, completed, failed, paused
    is_active = Column(Boolean, default=True)
    last_execution_at = Column(DateTime(timezone=True))
    last_execution_status = Column(String)
    
    # Metrics
    records_transferred = Column(Integer, default=0)
    success_rate = Column(Integer, default=0)  # percentage
    
    # Transfer details (for CSV downloads and error messages)
    csv_filename = Column(String)  # CSV export filename (if destination is CSV)
    error_message = Column(Text)  # Last error message (if failed)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Relationships
    created_by = relationship("User", back_populates="data_connectors")
    scheduled_jobs = relationship("ScheduledJob", back_populates="connector", cascade="all, delete-orphan")
