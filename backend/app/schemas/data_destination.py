"""
Data Destination schemas for request/response validation
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, UUID4
from datetime import datetime
from app.models.data_destination import DataDestinationType


class DataDestinationBase(BaseModel):
    name: str
    description: Optional[str] = None
    storage_type: str
    unique_key_columns: List[str] = []
    configuration: Dict[str, Any]
    platform_credential_id: Optional[str] = None
    schema_definition: Optional[List[Dict[str, Any]]] = None


class DataDestinationCreate(DataDestinationBase):
    pass


class DataDestinationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    configuration: Optional[Dict[str, Any]] = None
    unique_key_columns: Optional[List[str]] = None
    schema_definition: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


class DataDestinationResponse(BaseModel):
    id: UUID4
    name: str
    description: Optional[str]
    storage_type: str
    configuration: Dict[str, Any]
    unique_key_columns: List[str]
    platform_credential_id: Optional[str]
    schema_definition: Optional[List[Dict[str, Any]]] = None
    is_active: bool
    project_id: str
    created_by_id: UUID4
    created_at: datetime
    updated_at: Optional[datetime]
    deleted_at: Optional[datetime]

    class Config:
        from_attributes = True


class DataDestinationConnectionTest(BaseModel):
    """Schema for connection test results"""
    status: str
    message: str
    details: Optional[Dict[str, Any]] = None


class SecretKeyRotation(BaseModel):
    """Schema for secret key rotation results"""
    status: str
    message: str
    new_key_id: Optional[str] = None


# BigQuery specific schemas
class BigQueryDestinationConfig(BaseModel):
    project_id: str
    dataset_id: str
    table_id: str
    write_disposition: Optional[str] = "WRITE_APPEND"


# Google Sheets specific schemas
class GoogleSheetsDestinationConfig(BaseModel):
    spreadsheet_id: str
    sheet_name: str
    range: Optional[str] = "A1"


# Webhook specific schemas
class WebhookDestinationConfig(BaseModel):
    url: str
    method: str = "POST"
    headers: Optional[Dict[str, str]] = None
    timeout: Optional[int] = 30


# Email specific schemas
class EmailDestinationConfig(BaseModel):
    recipients: list[str]
    subject_template: str
    body_template: str
    format: Optional[str] = "html"


# Additional schemas for storage validation and types
class StorageValidation(BaseModel):
    """Schema for storage validation results"""
    id: Optional[str] = None
    storage_destination_id: Optional[str] = None
    is_valid: bool
    validation_message: Optional[str] = None
    validation_details: Optional[Dict[str, Any]] = None
    response_time_ms: Optional[int] = None
    validated_at: Optional[datetime] = None


class ValidationResult(BaseModel):
    """Schema for configuration validation results"""
    is_valid: bool
    errors: Optional[List[str]] = None
    warnings: Optional[List[str]] = None


class StorageTypeInfo(BaseModel):
    """Schema for storage type information"""
    type: str
    name: str
    description: str
    capabilities: List[str]
    required_credentials: List[str]
    max_buffer_size: int
