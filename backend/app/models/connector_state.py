from sqlalchemy import Column, String, Text, DateTime, JSON, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class ConnectorStateType(str, enum.Enum):
    INCREMENTAL = "incremental"
    FULL_REFRESH = "full_refresh"
    CHECKPOINT = "checkpoint"


class ConnectorState(Base):
    __tablename__ = "connector_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Reference to the data mart run
    data_mart_run_id = Column(UUID(as_uuid=True), ForeignKey("data_mart_runs.id"), nullable=False)
    
    # Connector identification
    connector_type = Column(String(100), nullable=False)  # e.g., 'facebook_marketing', 'linkedin_ads'
    stream_name = Column(String(255), nullable=False)  # e.g., 'campaigns', 'ad_accounts'
    
    # State information
    state_type = Column(Enum(ConnectorStateType), default=ConnectorStateType.INCREMENTAL)
    state_data = Column(JSON, nullable=False)  # The actual state data (cursors, timestamps, etc.)
    
    # Metadata
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    records_synced = Column(String(50), default="0")
    
    # State validation
    state_version = Column(String(20), default="1.0")
    is_valid = Column(String(10), default="true")
    
    # Project information
    project_id = Column(String(255), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    data_mart_run = relationship("DataMartRun", back_populates="connector_states")
    
    def __repr__(self):
        return f"<ConnectorState(id={self.id}, connector_type='{self.connector_type}', stream='{self.stream_name}')>"
