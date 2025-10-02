from sqlalchemy import Column, String, Text, DateTime, JSON, Enum, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class ScheduledTriggerType(str, enum.Enum):
    CRON = "cron"
    INTERVAL = "interval"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    HOURLY = "hourly"
    CUSTOM = "custom"


class ScheduledTriggerStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PAUSED = "paused"


class DataMartScheduledTrigger(Base):
    __tablename__ = "data_mart_scheduled_triggers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Reference to the data mart
    data_mart_id = Column(UUID(as_uuid=True), ForeignKey("data_marts.id"), nullable=False)
    
    # Basic information
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Trigger configuration
    trigger_type = Column(Enum(ScheduledTriggerType), nullable=False)
    status = Column(Enum(ScheduledTriggerStatus), default=ScheduledTriggerStatus.ACTIVE)
    
    # Schedule configuration
    cron_expression = Column(String(100), nullable=True)  # For cron-based triggers
    interval_seconds = Column(String(50), nullable=True)  # For interval-based triggers
    
    # Advanced scheduling options
    timezone = Column(String(50), default="UTC")
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    
    # Execution configuration
    config = Column(JSON, nullable=True)  # Additional trigger configuration
    payload = Column(JSON, nullable=True)  # Payload to pass to the data mart run
    
    # Execution tracking
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    run_count = Column(String(50), default="0")
    
    # Error handling
    max_retries = Column(String(10), default="3")
    retry_delay_seconds = Column(String(50), default="300")  # 5 minutes
    
    # Project information
    project_id = Column(String(255), nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    data_mart = relationship("DataMart", back_populates="scheduled_triggers")
    
    @property
    def is_active(self):
        """Check if the trigger is currently active"""
        return self.status == ScheduledTriggerStatus.ACTIVE
    
    def __repr__(self):
        return f"<DataMartScheduledTrigger(id={self.id}, data_mart_id={self.data_mart_id}, type='{self.trigger_type}')>"
