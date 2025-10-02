from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum
import uuid


class DataMartStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class DataMartDefinitionType(str, enum.Enum):
    CONNECTOR = "connector"
    SQL = "sql"
    TABLE = "table"


class DataMart(Base):
    __tablename__ = "data_marts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Basic information
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Storage reference (optional - being phased out in favor of destination_id)
    storage_id = Column(UUID(as_uuid=True), ForeignKey("data_storages.id"), nullable=True)
    
    # Destination reference (primary storage location)
    destination_id = Column(UUID(as_uuid=True), ForeignKey("data_destinations.id"), nullable=True)
    
    # Data mart schema and definition
    schema = Column(JSON, nullable=True)  # DataMartSchema
    definition_type = Column(Enum(DataMartDefinitionType), nullable=True)
    definition = Column(JSON, nullable=True)  # DataMartDefinition
    
    # Status
    status = Column(Enum(DataMartStatus), default=DataMartStatus.DRAFT)
    
    # Project and ownership
    project_id = Column(String(255), nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    storage = relationship("DataStorage", back_populates="data_marts")
    destination = relationship("DataDestination", back_populates="data_marts")
    user = relationship("User", back_populates="data_marts")
    runs = relationship("DataMartRun", back_populates="data_mart")
    scheduled_triggers = relationship("DataMartScheduledTrigger", back_populates="data_mart")
    reports = relationship("Report", back_populates="data_mart")
    data_collections = relationship("DataCollection", back_populates="data_mart")
    
    def __repr__(self):
        return f"<DataMart(id={self.id}, title='{self.title}', status='{self.status}')>"
