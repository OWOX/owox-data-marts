"""
Connectors API endpoints
Based on base/backend/src/data-marts/controllers/connector.controller.ts
"""

from typing import Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.auth.idp_guard import get_current_active_user, require_permission
from app.models import User
from app.connectors.base_connector import ConnectorType, ConnectorConfig
from app.services.connectors.connector_execution_service import connector_execution_service
from app.connectors.connector_registry import connector_registry
from pydantic import BaseModel

router = APIRouter()


class ConnectorConfigRequest(BaseModel):
    connector_type: str
    credentials: Dict[str, Any]
    config: Dict[str, Any] = {}


class ConnectorSpecRequest(BaseModel):
    connector_type: str
    credentials: Dict[str, Any]


class ConnectorTestRequest(BaseModel):
    connector_type: str
    credentials: Dict[str, Any]
    config: Dict[str, Any] = {}


@router.get("/available")
def get_available_connectors(
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get list of available connector types
    """
    connectors = connector_execution_service.get_available_connectors()
    return {"connectors": connectors}


@router.post("/validate")
def validate_connector_config(
    *,
    db: Session = Depends(get_db),
    config_request: ConnectorConfigRequest,
    current_user: User = Depends(require_permission("connectors", "validate")),
) -> Any:
    """
    Validate connector configuration
    """
    try:
        connector_type = ConnectorType(config_request.connector_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown connector type: {config_request.connector_type}"
        )
    
    config = {
        "credentials": config_request.credentials,
        "config": config_request.config
    }
    
    result = connector_execution_service.validate_connector_config(
        connector_type=connector_type,
        config=config
    )
    
    return result


@router.post("/test-connection")
def test_connector_connection(
    *,
    db: Session = Depends(get_db),
    test_request: ConnectorTestRequest,
    current_user: User = Depends(require_permission("connectors", "test")),
) -> Any:
    """
    Test connector connection
    """
    try:
        connector_type = ConnectorType(test_request.connector_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown connector type: {test_request.connector_type}"
        )
    
    # Create connector config
    connector_config = ConnectorConfig(
        connector_type=connector_type,
        credentials=test_request.credentials,
        config=test_request.config
    )
    
    try:
        # Create connector instance
        connector = connector_registry.create_connector(connector_config)
        
        # Test connection
        result = connector.check_connection()
        
        return result
        
    except Exception as e:
        return {
            "status": "failed",
            "message": str(e)
        }


@router.post("/discover")
def discover_connector_streams(
    *,
    db: Session = Depends(get_db),
    spec_request: ConnectorSpecRequest,
    current_user: User = Depends(require_permission("connectors", "discover")),
) -> Any:
    """
    Discover available streams for a connector
    """
    try:
        connector_type = ConnectorType(spec_request.connector_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown connector type: {spec_request.connector_type}"
        )
    
    try:
        result = connector_execution_service.get_connector_specification(
            connector_type=connector_type,
            credentials=spec_request.credentials
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to discover streams: {str(e)}"
        )


@router.get("/types")
def get_connector_types(
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get all supported connector types
    """
    connector_types = []
    for connector_type in ConnectorType:
        connector_types.append({
            "type": connector_type.value,
            "name": connector_type.value.replace("_", " ").title(),
            "registered": connector_registry.is_registered(connector_type)
        })
    
    return {"connector_types": connector_types}


@router.get("/types/{connector_type}")
def get_connector_type_info(
    *,
    connector_type: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get information about a specific connector type
    """
    try:
        connector_type_enum = ConnectorType(connector_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown connector type: {connector_type}"
        )
    
    info = connector_registry.get_connector_info(connector_type_enum)
    if not info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector type {connector_type} is not registered"
        )
    
    return info


@router.post("/execute")
async def execute_connector(
    *,
    db: Session = Depends(get_db),
    data_mart_run_id: str,
    config_request: ConnectorConfigRequest,
    streams: List[str] = None,
    state: Dict[str, Any] = None,
    current_user: User = Depends(require_permission("connectors", "execute")),
) -> Any:
    """
    Execute a connector (for testing purposes)
    """
    try:
        connector_type = ConnectorType(config_request.connector_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown connector type: {config_request.connector_type}"
        )
    
    config = {
        "credentials": config_request.credentials,
        "config": config_request.config
    }
    
    try:
        execution_id = await connector_execution_service.execute_connector(
            db=db,
            data_mart_run_id=data_mart_run_id,
            connector_type=connector_type,
            config=config,
            streams=streams,
            state=state
        )
        
        return {
            "message": "Connector execution started",
            "execution_id": execution_id,
            "data_mart_run_id": data_mart_run_id
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute connector: {str(e)}"
        )


@router.post("/cancel/{execution_id}")
async def cancel_connector_execution(
    *,
    db: Session = Depends(get_db),
    execution_id: str,
    current_user: User = Depends(require_permission("connectors", "cancel")),
) -> Any:
    """
    Cancel a running connector execution
    """
    success = await connector_execution_service.cancel_connector_execution(
        db=db,
        execution_id=execution_id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found or cannot be cancelled"
        )
    
    return {"message": "Connector execution cancelled successfully"}
