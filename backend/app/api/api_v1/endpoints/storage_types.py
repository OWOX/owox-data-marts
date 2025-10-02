"""
Storage Types and Utilities API endpoints
"""

from typing import Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database.database import get_db
from app.auth.idp_guard import get_current_active_user
from app.models import User
from app.schemas.data_destination import (
    StorageTypeInfo,
    ValidationResult
)

router = APIRouter()


@router.get("/types", response_model=List[StorageTypeInfo])
def get_supported_storage_types(
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get list of supported storage destination types
    """
    storage_types = [
        {
            "type": "csv",
            "name": "CSV File",
            "description": "Simple file-based storage with merge capabilities",
            "capabilities": ["merge", "append", "overwrite", "file_rotation"],
            "required_credentials": [],
            "max_buffer_size": 10000
        },
        {
            "type": "postgres",
            "name": "PostgreSQL",
            "description": "Full-featured database with ACID transactions",
            "capabilities": ["merge", "append", "overwrite", "transactions", "constraints"],
            "required_credentials": [],
            "max_buffer_size": 50000
        },
        {
            "type": "bigquery",
            "name": "Google BigQuery",
            "description": "Cloud data warehouse for large-scale analytics",
            "capabilities": ["merge", "append", "overwrite", "partitioning", "clustering"],
            "required_credentials": ["google"],
            "max_buffer_size": 1000000
        },
        {
            "type": "sheets",
            "name": "Google Sheets",
            "description": "Cloud spreadsheet for collaborative data management",
            "capabilities": ["append", "overwrite", "formatting"],
            "required_credentials": ["google"],
            "max_buffer_size": 5000
        },
        {
            "type": "athena",
            "name": "AWS Athena",
            "description": "Serverless query service for S3 data",
            "capabilities": ["append", "overwrite", "partitioning", "compression"],
            "required_credentials": ["aws"],
            "max_buffer_size": 100000
        }
    ]
    return storage_types


class ConfigValidationRequest(BaseModel):
    storage_type: str
    config: Dict[str, Any]

@router.post("/validate-config", response_model=ValidationResult)
def validate_storage_configuration(
    *,
    request: ConfigValidationRequest,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Validate storage configuration for a specific type
    """
    storage_type = request.storage_type
    config = request.config
    errors = []
    warnings = []
    
    # Basic validation based on storage type
    if storage_type == "csv":
        if not config.get("file_path"):
            errors.append("file_path is required for CSV storage")
        if config.get("max_file_size_mb", 0) > 1000:
            warnings.append("Large file size may impact performance")
            
    elif storage_type == "postgres":
        required_fields = ["host", "database", "username", "password", "table_name"]
        for field in required_fields:
            if not config.get(field):
                errors.append(f"{field} is required for PostgreSQL storage")
                
        if config.get("port") and (config["port"] < 1 or config["port"] > 65535):
            errors.append("Port must be between 1 and 65535")
            
    elif storage_type == "bigquery":
        required_fields = ["destination_project_id", "destination_dataset_id", "destination_table_name"]
        for field in required_fields:
            if not config.get(field):
                errors.append(f"{field} is required for BigQuery storage")
                
        if config.get("clustering_fields") and len(config["clustering_fields"]) > 4:
            warnings.append("BigQuery supports maximum 4 clustering fields")
            
    elif storage_type == "sheets":
        if not config.get("destination_spreadsheet_id"):
            errors.append("destination_spreadsheet_id is required for Sheets storage")
        if config.get("cleanup_window_days", 0) > 365:
            warnings.append("Cleanup window longer than 1 year may affect performance")
            
    elif storage_type == "athena":
        required_fields = ["aws_region", "s3_bucket_name", "athena_database_name", "athena_output_location"]
        for field in required_fields:
            if not config.get(field):
                errors.append(f"{field} is required for Athena storage")
    else:
        errors.append(f"Unsupported storage type: {storage_type}")
    
    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }
