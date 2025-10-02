from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, Enum, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class PlatformCollectionStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PlatformDataCollection(Base):
    __tablename__ = "platform_data_collections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # User and platform references
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    platform_credential_id = Column(Integer, ForeignKey("platform_credentials.id"), nullable=False)
    
    # Collection details
    platform_name = Column(String(100), nullable=False)  # linkedin, google_sheets, etc.
    collection_name = Column(String(255), nullable=False)
    status = Column(Enum(PlatformCollectionStatus), default=PlatformCollectionStatus.PENDING)
    
    # Collection parameters
    collection_params = Column(JSON, nullable=True)  # account_urns, date ranges, fields, etc.
    
    # Progress tracking
    total_records = Column(Integer, nullable=True)
    records_collected = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    progress_percentage = Column(Integer, default=0)
    
    # Time tracking
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Error handling
    error_message = Column(Text, nullable=True)
    error_details = Column(JSON, nullable=True)
    
    # Results storage
    collected_data = Column(JSON, nullable=True)  # The actual collected data
    result_summary = Column(JSON, nullable=True)  # Summary statistics
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User")
    platform_credential = relationship("PlatformCredential")
