"""
API endpoints for Connector Runs (execution tracking and monitoring)
"""
from typing import Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.database.database import get_db
from app.models.user import User
from app.crud.crud_connector_run import connector_run
from app.schemas.connector_run import ConnectorRun

import logging
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[Dict[str, Any]])
def get_connector_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve connector runs for the current user
    """
    logger.info(f"📋 [CONNECTOR RUNS API] Getting runs for user {current_user.id}")
    
    runs = connector_run.get_by_user(db, user_id=current_user.id, skip=skip, limit=limit)
    
    # Format runs for response with proper user name handling
    formatted_runs = []
    for run in runs:
        formatted_run = {
            'id': str(run.id),
            'execution_id': run.execution_id,
            'connector_id': str(run.connector_id),
            'status': run.status,
            'started_at': run.started_at.isoformat() if run.started_at else None,
            'completed_at': run.completed_at.isoformat() if run.completed_at else None,
            'duration_seconds': run.duration_seconds,
            'extracted_records': run.extracted_records,
            'transformed_records': run.transformed_records,
            'loaded_records': run.loaded_records,
            'failed_records': run.failed_records,
            'source_collection_name': run.source_collection_name,
            'destination_name': run.destination_name,
            'destination_type': run.destination_type,
            'error_message': run.error_message,
            # Fixed: Use full_name instead of first_name/last_name
            'triggered_by_name': run.triggered_by.full_name if run.triggered_by and run.triggered_by.full_name else run.triggered_by.username if run.triggered_by else None,
            'triggered_by_email': run.triggered_by.email if run.triggered_by else None
        }
        formatted_runs.append(formatted_run)
    
    logger.info(f"✅ [CONNECTOR RUNS API] Found {len(runs)} runs")
    return formatted_runs


@router.get("/summary", response_model=Dict[str, Any])
def get_runs_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    days: int = Query(7, ge=1, le=90)
) -> Any:
    """
    Get summary statistics for connector runs over the specified period
    """
    logger.info(f"📊 [CONNECTOR RUNS API] Getting {days}-day summary for user {current_user.id}")
    
    summary = connector_run.get_recent_runs_summary(db, current_user.id, days)
    
    return summary


@router.get("/{run_id}", response_model=Dict[str, Any])
def get_connector_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get a specific connector run by ID
    """
    logger.info(f"🔍 [CONNECTOR RUNS API] Getting run {run_id} for user {current_user.id}")
    
    run = connector_run.get(db, id=run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Connector run not found")
    
    # Verify user owns this run
    if run.triggered_by_id != current_user.id:
        raise HTTPException(status_code=404, detail="Connector run not found")
    
    # Format response
    formatted_run = {
        'id': str(run.id),
        'execution_id': run.execution_id,
        'connector_id': str(run.connector_id),
        'status': run.status,
        'started_at': run.started_at.isoformat() if run.started_at else None,
        'completed_at': run.completed_at.isoformat() if run.completed_at else None,
        'duration_seconds': run.duration_seconds,
        'extracted_records': run.extracted_records,
        'transformed_records': run.transformed_records,
        'loaded_records': run.loaded_records,
        'failed_records': run.failed_records,
        'source_collection_name': run.source_collection_name,
        'destination_name': run.destination_name,
        'destination_type': run.destination_type,
        'error_message': run.error_message,
        'triggered_by_name': run.triggered_by.full_name if run.triggered_by and run.triggered_by.full_name else run.triggered_by.username if run.triggered_by else None,
        'triggered_by_email': run.triggered_by.email if run.triggered_by else None
    }
    
    logger.info(f"✅ [CONNECTOR RUNS API] Retrieved run {run.execution_id}")
    return formatted_run
