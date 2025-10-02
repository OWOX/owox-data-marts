"""
Data Mart Runs API endpoints
Based on base/backend/src/data-marts/controllers/data-mart-run.controller.ts
"""

from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.auth.idp_guard import get_current_active_user, require_permission
from app.models import User
from app.schemas.data_mart_run import (
    DataMartRunResponse, 
    DataMartRunCreate, 
    DataMartRunExecute,
    DataMartRunMetrics,
    DataMartRunLog
)
from app.services.data_marts.data_mart_run_service import data_mart_run_service

router = APIRouter()


@router.get("/", response_model=List[DataMartRunResponse])
def read_data_mart_runs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    project_id: str = "default"  # TODO: Get from user context
) -> Any:
    """
    Retrieve data mart runs for current project
    """
    runs = data_mart_run_service.get_by_project(
        db, project_id=project_id, skip=skip, limit=limit
    )
    return runs


@router.get("/data-mart/{data_mart_id}", response_model=List[DataMartRunResponse])
def read_data_mart_runs_by_data_mart(
    *,
    db: Session = Depends(get_db),
    data_mart_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_permission("data_mart_runs", "read")),
) -> Any:
    """
    Get data mart runs by data mart ID
    """
    runs = data_mart_run_service.get_by_data_mart(
        db, data_mart_id=data_mart_id, skip=skip, limit=limit
    )
    return runs


@router.post("/", response_model=DataMartRunResponse)
def create_data_mart_run(
    *,
    db: Session = Depends(get_db),
    run_in: DataMartRunCreate,
    current_user: User = Depends(require_permission("data_mart_runs", "create")),
) -> Any:
    """
    Create new data mart run
    """
    run = data_mart_run_service.create_run(
        db=db, 
        data_mart_id=str(run_in.data_mart_id),
        triggered_by=run_in.triggered_by,
        trigger_payload=run_in.trigger_payload,
        created_by_id=str(current_user.id)
    )
    return run


@router.get("/{run_id}", response_model=DataMartRunResponse)
def read_data_mart_run(
    *,
    db: Session = Depends(get_db),
    run_id: str,
    current_user: User = Depends(require_permission("data_mart_runs", "read")),
) -> Any:
    """
    Get data mart run by ID
    """
    run = data_mart_run_service.get_by_id(db=db, run_id=run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart run not found"
        )
    return run


@router.post("/{run_id}/execute")
async def execute_data_mart_run(
    *,
    db: Session = Depends(get_db),
    run_id: str,
    execute_config: DataMartRunExecute = DataMartRunExecute(),
    current_user: User = Depends(require_permission("data_mart_runs", "execute")),
) -> Any:
    """
    Execute a data mart run
    """
    execution_id = await data_mart_run_service.execute_run(db=db, run_id=run_id)
    return {
        "message": "Data mart run execution started",
        "run_id": run_id,
        "execution_id": execution_id
    }


@router.post("/{run_id}/cancel")
async def cancel_data_mart_run(
    *,
    db: Session = Depends(get_db),
    run_id: str,
    current_user: User = Depends(require_permission("data_mart_runs", "cancel")),
) -> Any:
    """
    Cancel a running data mart run
    """
    success = await data_mart_run_service.cancel_run(db=db, run_id=run_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart run not found or cannot be cancelled"
        )
    return {"message": "Data mart run cancelled successfully"}


@router.put("/{run_id}/metrics", response_model=DataMartRunResponse)
def update_run_metrics(
    *,
    db: Session = Depends(get_db),
    run_id: str,
    metrics: DataMartRunMetrics,
    current_user: User = Depends(require_permission("data_mart_runs", "update")),
) -> Any:
    """
    Update data mart run metrics
    """
    run = data_mart_run_service.update_run_metrics(
        db=db,
        run_id=run_id,
        rows_processed=metrics.rows_processed,
        rows_inserted=metrics.rows_inserted,
        rows_updated=metrics.rows_updated,
        rows_deleted=metrics.rows_deleted
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart run not found"
        )
    return run


@router.post("/{run_id}/logs")
def add_run_log(
    *,
    db: Session = Depends(get_db),
    run_id: str,
    log_entry: DataMartRunLog,
    current_user: User = Depends(require_permission("data_mart_runs", "update")),
) -> Any:
    """
    Add log entry to data mart run
    """
    data_mart_run_service.add_run_log(
        db=db,
        run_id=run_id,
        log_entry=log_entry.dict()
    )
    return {"message": "Log entry added successfully"}


@router.get("/{run_id}/status")
def get_run_status(
    *,
    db: Session = Depends(get_db),
    run_id: str,
    current_user: User = Depends(require_permission("data_mart_runs", "read")),
) -> Any:
    """
    Get current status of a data mart run
    """
    run = data_mart_run_service.get_by_id(db=db, run_id=run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Data mart run not found"
        )
    
    # Calculate duration if run is finished
    duration_seconds = None
    if run.started_at and run.finished_at:
        duration_seconds = (run.finished_at - run.started_at).total_seconds()
    
    return {
        "run_id": run.id,
        "status": run.status,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "duration_seconds": duration_seconds,
        "rows_processed": run.rows_processed,
        "error_message": run.error_message
    }
