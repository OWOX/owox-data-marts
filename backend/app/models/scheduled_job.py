"""
Scheduled Job model for data connector automation
"""
from sqlalchemy import Column, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database.base import Base


class ScheduledJob(Base):
    __tablename__ = "scheduled_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Connector relationship
    connector_id = Column(UUID(as_uuid=True), ForeignKey("data_connectors.id"), nullable=False)
    
    # Scheduling details
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    repeat_type = Column(String(50), nullable=False, default="once")  # once, daily, weekly, monthly
    status = Column(String(50), nullable=False, default="pending")  # pending, running, completed, failed, cancelled
    
    # Execution details
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Metadata
    is_active = Column(Boolean, default=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    connector = relationship("DataConnector", back_populates="scheduled_jobs")
    created_by = relationship("User")
