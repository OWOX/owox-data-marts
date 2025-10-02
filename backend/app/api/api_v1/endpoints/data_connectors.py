"""
API endpoints for Data Connectors (pipeline orchestration)
"""
from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.database.database import get_db
from app.models.user import User
from app.crud.crud_data_connector import data_connector
from app.crud.crud_scheduled_job import scheduled_job
from app.crud.crud_connector_run import connector_run
from app.schemas.data_connector import (
    DataConnectorCreate, 
    DataConnectorUpdate, 
    DataConnectorResponse,
    DataConnectorExecuteRequest,
    DataConnectorExecuteResponse
)
from app.schemas.scheduled_job import ScheduledJobCreate, ScheduledJobUpdate, ScheduledJob
import logging
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[DataConnectorResponse])
def get_data_connectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = Query(default=100, le=100),
    status: Optional[str] = None
) -> Any:
    """
    Retrieve data connectors for the current user
    """
    logger.info(f"🔗 [DATA CONNECTORS API] Getting connectors for user {current_user.id}")
    
    try:
        if status and status != "all":
            connectors = data_connector.get_by_user_and_status(
                db, user_id=current_user.id, status=status, skip=skip, limit=limit
            )
        else:
            connectors = data_connector.get_by_user(
                db, user_id=current_user.id, skip=skip, limit=limit
            )
        
        logger.info(f"✅ [DATA CONNECTORS API] Found {len(connectors)} connectors")
        return connectors
        
    except Exception as e:
        logger.error(f"❌ [DATA CONNECTORS API] Error getting connectors: {str(e)}")
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=f"Failed to get connectors: {str(e)}")


@router.post("/", response_model=DataConnectorResponse)
def create_data_connector(
    *,
    db: Session = Depends(get_db),
    connector_in: DataConnectorCreate,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Create a new data connector
    """
    logger.info(f"🚀 [DATA CONNECTORS API] Creating connector for user {current_user.id}")
    logger.info(f"📋 [DATA CONNECTORS API] Connector data: {connector_in.dict()}")
    
    try:
        # Resolve collection name (this would normally query the collections table)
        # For now, we'll use a placeholder
        source_collection_name = f"Collection {connector_in.source_collection_id}"
        
        # Resolve destination details (this would normally query the destinations table)
        # For now, we'll use placeholders
        destination_name = f"Destination {connector_in.destination_id}"
        destination_type = "POSTGRES"  # This should be fetched from the actual destination
        
        # TODO: Add actual lookups for collection and destination details
        # from app.crud.crud_platform_data_collection import platform_data_collection
        # from app.services.data_marts.data_destination_service import DataDestinationService
        
        connector = data_connector.create_with_user(
            db=db,
            obj_in=connector_in,
            user_id=current_user.id,
            source_collection_name=source_collection_name,
            destination_name=destination_name,
            destination_type=destination_type
        )
        
        logger.info(f"✅ [DATA CONNECTORS API] Created connector {connector.id}")
        return connector
        
    except Exception as e:
        logger.error(f"❌ [DATA CONNECTORS API] Error creating connector: {str(e)}")
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=f"Failed to create connector: {str(e)}")


@router.get("/{connector_id}", response_model=DataConnectorResponse)
def get_data_connector(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get a specific data connector by ID
    """
    logger.info(f"🔍 [DATA CONNECTORS API] Getting connector {connector_id} for user {current_user.id}")
    
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    logger.info(f"✅ [DATA CONNECTORS API] Found connector {connector.name}")
    return connector


@router.put("/{connector_id}", response_model=DataConnectorResponse)
def update_data_connector(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    connector_in: DataConnectorUpdate,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Update a data connector
    """
    logger.info(f"✏️ [DATA CONNECTORS API] Updating connector {connector_id}")
    
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    connector = data_connector.update(db, db_obj=connector, obj_in=connector_in)
    
    logger.info(f"✅ [DATA CONNECTORS API] Updated connector {connector.name}")
    return connector


@router.delete("/{connector_id}")
def delete_data_connector(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    current_user: User = Depends(deps.get_current_user),
    force: bool = Query(default=False, description="Force delete even if connector is running")
) -> Any:
    """
    Delete a data connector
    """
    logger.info(f"🗑️ [DATA CONNECTORS API] Deleting connector {connector_id} (force={force})")
    
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    if connector.status == "running" and not force:
        raise HTTPException(status_code=400, detail="Cannot delete a running connector. Use force=true to override.")
    
    if connector.status == "running" and force:
        logger.warning(f"⚠️ [DATA CONNECTORS API] Force deleting running connector {connector.name}")
        # Update status to stopped before deletion
        data_connector.update_execution_status(
            db, connector_id=connector_id, status="stopped"
        )
    
    data_connector.remove(db, id=connector_id)
    
    logger.info(f"✅ [DATA CONNECTORS API] Deleted connector {connector.name}")
    return {"message": "Connector deleted successfully"}


@router.post("/{connector_id}/execute", response_model=DataConnectorExecuteResponse)
async def execute_data_connector(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    execute_request: DataConnectorExecuteRequest = DataConnectorExecuteRequest(),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Execute a data connector (start data transfer)
    """
    logger.info(f"▶️ [DATA CONNECTORS API] Executing connector {connector_id}")
    
    try:
        connector = data_connector.get_by_id_and_user(
            db, connector_id=connector_id, user_id=current_user.id
        )
        if not connector:
            raise HTTPException(status_code=404, detail="Connector not found")
        
        if not connector.is_active:
            raise HTTPException(status_code=400, detail="Connector is not active")
        
        if connector.status == "running" and not execute_request.force:
            raise HTTPException(status_code=400, detail="Connector is already running. Use force=true to override.")
        
        # Update status to running
        data_connector.update_execution_status(
            db, connector_id=connector_id, status="running"
        )
        
        # Perform actual data transfer
        import asyncio
        import uuid
        from datetime import datetime
        execution_id = str(uuid.uuid4())
        
        logger.info(f"🎯 [DATA CONNECTORS API] Started execution {execution_id} for connector {connector.name}")
        logger.info(f"📊 [DATA CONNECTORS API] Transferring data from {connector.source_collection_name} to {connector.destination_name}")
        
        try:
            # Perform real data transfer
            from app.services.data_transfer_service import DataTransferService
            transfer_service = DataTransferService()
            
            logger.info(f"🔄 [DATA CONNECTORS API] Starting real data transfer...")
            
            # Execute actual data transfer
            transfer_result = await transfer_service.transfer_data(
                db, connector.source_collection_id, str(connector.destination_id)
            )
            
            if not transfer_result['success']:
                raise Exception(transfer_result.get('error', 'Data transfer failed'))
            
            records_transferred = transfer_result['records_transferred']
            success_rate = 100  # Assume 100% success for now
            
            logger.info(f"📈 [DATA CONNECTORS API] Transfer completed: {records_transferred} records")
            logger.info(f"🎯 [DATA CONNECTORS API] Destination: {transfer_result.get('destination_info', 'Unknown')}")
            
            # Update connector with completion status
            data_connector.update_execution_status(
                db, 
                connector_id=connector_id, 
                status="completed",
                records_transferred=records_transferred,
                success_rate=success_rate,
                execution_time=datetime.now().isoformat(),
                csv_filename=transfer_result.get('filename'),  # Save CSV filename if applicable
                error_message=None  # Clear any previous errors
            )
            
            logger.info(f"✅ [DATA CONNECTORS API] Completed execution {execution_id}")
            logger.info(f"📈 [DATA CONNECTORS API] Transferred {records_transferred} records with {success_rate}% success rate")
            
            return DataConnectorExecuteResponse(
                status="completed",
                message=f"Successfully transferred {records_transferred} records from {connector.source_collection_name} to {connector.destination_name}",
                execution_id=execution_id,
                connector_id=connector_id
            )
            
        except Exception as transfer_error:
            error_msg = str(transfer_error)
            
            # Update connector with failed status
            data_connector.update_execution_status(
                db, 
                connector_id=connector_id, 
                status="failed",
                execution_time=datetime.now().isoformat(),
                error_message=error_msg  # Save error message
            )
            
            logger.error(f"❌ [DATA CONNECTORS API] Execution {execution_id} failed: {error_msg}")
            
            return DataConnectorExecuteResponse(
                status="failed",
                message=f"Data transfer failed: {error_msg}",
                execution_id=execution_id,
                connector_id=connector_id
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [DATA CONNECTORS API] Error executing connector: {str(e)}")
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=f"Failed to execute connector: {str(e)}")


@router.post("/{connector_id}/pause", response_model=DataConnectorExecuteResponse)
def pause_data_connector(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Pause a running data connector
    """
    logger.info(f"⏸️ [DATA CONNECTORS API] Pausing connector {connector_id}")
    
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    if connector.status != "running":
        raise HTTPException(status_code=400, detail="Connector is not running")
    
    # Update status to paused
    data_connector.update_execution_status(
        db, connector_id=connector_id, status="paused"
    )
    
    logger.info(f"⏸️ [DATA CONNECTORS API] Paused connector {connector.name}")
    return {"status": "success", "message": f"Connector {connector.name} execution paused"}


# Scheduled Jobs endpoints
@router.get("/{connector_id}/scheduled-jobs", response_model=List[ScheduledJob])
def get_scheduled_jobs(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all scheduled jobs for a connector
    """
    logger.info(f"📅 [SCHEDULED JOBS API] Getting scheduled jobs for connector {connector_id}")
    
    # Verify connector exists and belongs to user
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    jobs = scheduled_job.get_by_connector_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    
    logger.info(f"✅ [SCHEDULED JOBS API] Found {len(jobs)} scheduled jobs")
    return jobs


@router.post("/{connector_id}/scheduled-jobs", response_model=ScheduledJob)
def create_scheduled_job(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    job_in: ScheduledJobCreate,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Create a new scheduled job for a connector
    """
    logger.info(f"📅 [SCHEDULED JOBS API] Creating scheduled job for connector {connector_id}")
    logger.info(f"📋 [SCHEDULED JOBS API] Job data: {job_in.dict()}")
    
    # Verify connector exists and belongs to user
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    # Set connector_id in the job data
    job_in.connector_id = connector_id
    
    try:
        job = scheduled_job.create_with_user(
            db=db,
            obj_in=job_in,
            user_id=current_user.id
        )
        
        logger.info(f"✅ [SCHEDULED JOBS API] Created scheduled job {job.id}")
        return job
        
    except Exception as e:
        logger.error(f"❌ [SCHEDULED JOBS API] Error creating scheduled job: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create scheduled job: {str(e)}")


@router.delete("/{connector_id}/scheduled-jobs/{job_id}")
def delete_scheduled_job(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    job_id: UUID,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Delete a scheduled job
    """
    logger.info(f"📅 [SCHEDULED JOBS API] Deleting scheduled job {job_id}")
    
    # Verify job exists and belongs to user
    job = scheduled_job.get_by_id_and_user(
        db, job_id=job_id, user_id=current_user.id
    )
    if not job or job.connector_id != connector_id:
        raise HTTPException(status_code=404, detail="Scheduled job not found")
    
    scheduled_job.remove(db=db, id=job_id)
    
    logger.info(f"✅ [SCHEDULED JOBS API] Deleted scheduled job {job_id}")
    return {"status": "success", "message": "Scheduled job deleted"}


@router.post("/{connector_id}/resume", response_model=DataConnectorExecuteResponse)
def resume_data_connector(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Resume a paused data connector
    """
    logger.info(f"▶️ [DATA CONNECTORS API] Resuming connector {connector_id}")
    
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    if connector.status != "paused":
        raise HTTPException(status_code=400, detail="Connector is not paused")
    
    # Update status to running
    data_connector.update_execution_status(
        db, connector_id=connector_id, status="running"
    )
    
    logger.info(f"▶️ [DATA CONNECTORS API] Resumed connector {connector.name}")
    return DataConnectorExecuteResponse(
        status="resumed",
        message=f"Connector {connector.name} has been resumed",
        connector_id=connector_id
    )


@router.get("/{connector_id}/status", response_model=DataConnectorResponse)
def get_connector_status(
    *,
    db: Session = Depends(get_db),
    connector_id: UUID,
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get current status of a data connector (for polling)
    """
    connector = data_connector.get_by_id_and_user(
        db, connector_id=connector_id, user_id=current_user.id
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    logger.info(f"📊 [DATA CONNECTORS API] Status check for connector {connector.name}: {connector.status}")
    return connector
