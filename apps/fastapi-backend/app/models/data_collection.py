from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.database import Base
import enum


class CollectionStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DataCollection(Base):
    __tablename__ = "data_collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    data_mart_id = Column(Integer, ForeignKey("data_marts.id"), nullable=False)
    platform_credential_id = Column(Integer, ForeignKey("platform_credentials.id"), nullable=True)
    
    # Collection details
    collection_name = Column(String(255), nullable=False)
    status = Column(Enum(CollectionStatus), default=CollectionStatus.PENDING)
    
    # Progress tracking
    total_records = Column(Integer, nullable=True)
    processed_records = Column(Integer, default=0)
    failed_records = Column(Integer, default=0)
    progress_percentage = Column(Integer, default=0)
    
    # Time tracking
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Error handling
    error_message = Column(Text, nullable=True)
    error_details = Column(JSON, nullable=True)
    
    # Collection parameters
    collection_params = Column(JSON, nullable=True)  # Date ranges, filters, etc.
    
    # Results metadata
    result_summary = Column(JSON, nullable=True)  # Summary of collected data
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="data_collections")
    data_mart = relationship("DataMart", back_populates="data_collections")
    platform_credential = relationship("PlatformCredential", back_populates="data_collections")
