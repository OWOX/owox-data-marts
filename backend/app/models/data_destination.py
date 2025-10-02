from sqlalchemy import Column, String, Text, DateTime, JSON, Enum, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class DataDestinationType(str, enum.Enum):
    BIGQUERY = "bigquery"
    GOOGLE_SHEETS = "google_sheets"
    LOOKER_STUDIO = "looker_studio"
    WEBHOOK = "webhook"
    EMAIL = "email"
    # New storage types for frontend compatibility
    CSV = "csv"
    POSTGRES = "postgres"
    SHEETS = "sheets"  # Alias for google_sheets
    ATHENA = "athena"


class DataDestination(Base):
    __tablename__ = "data_destinations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Basic information
    title = Column(String(255), nullable=False)  # Legacy field, use name instead
    name = Column(String(255), nullable=True)  # New field for frontend compatibility
    description = Column(Text, nullable=True)
    
    # Destination type and configuration
    destination_type = Column(Enum(DataDestinationType), nullable=False)  # Legacy field
    storage_type = Column(String(100), nullable=True)  # New field for frontend compatibility
    
    # Configuration specific to destination type
    config = Column(JSON, nullable=False)  # Legacy field, use configuration instead
    configuration = Column(JSON, nullable=True)  # New field for frontend compatibility
    
    # Schema and unique keys for data merging
    unique_key_columns = Column(JSON, nullable=True, default=lambda: [])
    schema_definition = Column(JSON, nullable=True)
    platform_credential_id = Column(String(255), nullable=True)
    
    # Credentials (encrypted)
    credentials = Column(JSON, nullable=True)  # Optional encrypted credentials
    
    # Connection settings
    is_active = Column(Boolean, default=True)
    
    # Project/workspace information
    project_id = Column(String(255), nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    data_marts = relationship("DataMart", back_populates="destination")
    user = relationship("User", back_populates="data_destinations")
    
    def __repr__(self):
        return f"<DataDestination(id={self.id}, title='{self.title}', type='{self.destination_type}')>"
