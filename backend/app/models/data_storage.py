from sqlalchemy import Column, String, Text, DateTime, JSON, Enum, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class DataStorageType(str, enum.Enum):
    BIGQUERY = "bigquery"
    ATHENA = "athena"


class DataStorage(Base):
    __tablename__ = "data_storages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Basic information
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Storage type and configuration
    storage_type = Column(Enum(DataStorageType), nullable=False)
    
    # Configuration specific to storage type (BigQuery, Athena, etc.)
    config = Column(JSON, nullable=False)  # Storage-specific configuration
    
    # Credentials (encrypted)
    credentials = Column(JSON, nullable=False)  # Encrypted credentials
    
    # Connection settings
    is_active = Column(Boolean, default=True)
    connection_timeout = Column(String(50), default="30s")
    
    # Project/workspace information
    project_id = Column(String(255), nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    data_marts = relationship("DataMart", back_populates="storage")
    user = relationship("User", back_populates="data_storages")
    
    def __repr__(self):
        return f"<DataStorage(id={self.id}, title='{self.title}', type='{self.storage_type}')>"
