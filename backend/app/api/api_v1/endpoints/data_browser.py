"""
Data Browser API endpoints
Allows querying data from destination databases (PostgreSQL, etc.)
"""

from typing import Any, List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, text, inspect
import logging
import os

from app.database.database import get_db
from app.auth.idp_guard import get_current_active_user
from app.models import User
from app.models.data_destination import DataDestination

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/destinations")
def get_browsable_destinations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get list of data destinations that can be browsed
    """
    destinations = db.query(DataDestination).filter(
        DataDestination.deleted_at.is_(None)
    ).all()
    
    return [{
        "id": str(dest.id),
        "name": dest.name,
        "type": dest.destination_type,
        "description": dest.description,
    } for dest in destinations]


@router.get("/destinations/{destination_id}/tables")
def get_destination_tables(
    destination_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get list of tables in a destination database
    """
    try:
        destination = db.query(DataDestination).filter(
            DataDestination.id == destination_id
        ).first()
        
        if not destination:
            logger.error(f"Destination not found: {destination_id}")
            raise HTTPException(status_code=404, detail="Destination not found")
        
        logger.info(f"Destination found: {destination.name}, type: {destination.destination_type}")
        
        # Check destination type - handle both enum and string
        dest_type_str = str(destination.destination_type).lower() if destination.destination_type else ''
        if 'postgres' not in dest_type_str:
            logger.error(f"Unsupported destination type: {destination.destination_type}")
            raise HTTPException(
                status_code=400, 
                detail=f"Browsing not supported for {destination.destination_type}. Only PostgreSQL is supported."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking destination: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    try:
        # Build connection string from destination config
        config = destination.config or {}
        logger.info(f"Config keys: {list(config.keys())}")
        
        host = config.get('host', 'localhost')
        port = config.get('port', 5432)
        database = config.get('database') or config.get('dbname')
        # Try different possible field names
        user = config.get('user') or config.get('username') or config.get('db_user')
        password = config.get('password') or config.get('pass') or config.get('db_password')
        
        # Auto-detect if running in Docker and translate localhost to container name
        if host in ['localhost', '127.0.0.1']:
            # Running in Docker - use PostgreSQL service name from docker-compose
            if os.path.exists('/.dockerenv'):
                host = 'owox-postgres-dev'
                logger.info(f"Detected Docker environment, changed host from localhost to {host}")
        
        if not all([database, user, password]):
            logger.error(f"Incomplete config: database={database}, user={user}, password={'***' if password else None}")
            logger.error(f"Available config: {', '.join(config.keys())}")
            raise HTTPException(
                status_code=400,
                detail=f"Destination configuration incomplete. Missing: {', '.join([k for k, v in {'database': database, 'user': user, 'password': password}.items() if not v])}. Available fields: {', '.join(config.keys())}"
            )
        
        logger.info(f"Connecting to PostgreSQL: {host}:{port}/{database}")
        connection_string = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_string)
        
        # Get list of tables
        inspector = inspect(engine)
        tables = []
        
        for table_name in inspector.get_table_names():
            columns = inspector.get_columns(table_name)
            tables.append({
                "name": table_name,
                "schema": "public",
                "columns": [
                    {
                        "name": col['name'],
                        "type": str(col['type']),
                        "nullable": col.get('nullable', True)
                    } 
                    for col in columns
                ],
                "row_count": None  # Can be expensive to compute
            })
        
        engine.dispose()
        return tables
        
    except Exception as e:
        logger.error(f"Failed to browse destination: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to destination: {str(e)}"
        )


@router.get("/destinations/{destination_id}/tables/{table_name}/data")
def get_table_data(
    destination_id: str,
    table_name: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get data from a specific table in the destination
    """
    destination = db.query(DataDestination).filter(
        DataDestination.id == destination_id
    ).first()
    
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    try:
        # Build connection string
        config = destination.config or {}
        host = config.get('host', 'localhost')
        port = config.get('port', 5432)
        database = config.get('database') or config.get('dbname')
        user = config.get('user') or config.get('username') or config.get('db_user')
        password = config.get('password') or config.get('pass') or config.get('db_password')
        
        # Auto-detect Docker environment
        if host in ['localhost', '127.0.0.1'] and os.path.exists('/.dockerenv'):
            host = 'owox-postgres-dev'
        
        connection_string = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_string)
        
        # Get total count
        with engine.connect() as conn:
            count_query = text(f"SELECT COUNT(*) FROM {table_name}")
            total_count = conn.execute(count_query).scalar()
            
            # Get data with pagination
            data_query = text(f"SELECT * FROM {table_name} LIMIT :limit OFFSET :offset")
            result = conn.execute(data_query, {"limit": limit, "offset": offset})
            
            # Convert to list of dicts
            columns = result.keys()
            rows = []
            for row in result:
                row_dict = {}
                for i, col in enumerate(columns):
                    value = row[i]
                    # Convert non-serializable types
                    if hasattr(value, 'isoformat'):
                        value = value.isoformat()
                    row_dict[col] = value
                rows.append(row_dict)
        
        engine.dispose()
        
        return {
            "data": rows,
            "total": total_count,
            "offset": offset,
            "limit": limit,
            "columns": list(columns)
        }
        
    except Exception as e:
        logger.error(f"Failed to query table data: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query data: {str(e)}"
        )


@router.post("/destinations/{destination_id}/query")
def execute_custom_query(
    destination_id: str,
    query: Dict[str, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Execute a custom SQL query on the destination (SELECT only for safety)
    """
    destination = db.query(DataDestination).filter(
        DataDestination.id == destination_id
    ).first()
    
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    sql_query = query.get('sql', '').strip()
    
    # Security check: only allow SELECT queries
    if not sql_query.upper().startswith('SELECT'):
        raise HTTPException(
            status_code=400,
            detail="Only SELECT queries are allowed"
        )
    
    try:
        config = destination.config or {}
        host = config.get('host', 'localhost')
        port = config.get('port', 5432)
        database = config.get('database') or config.get('dbname')
        user = config.get('user') or config.get('username') or config.get('db_user')
        password = config.get('password') or config.get('pass') or config.get('db_password')
        
        # Auto-detect Docker environment
        if host in ['localhost', '127.0.0.1'] and os.path.exists('/.dockerenv'):
            host = 'owox-postgres-dev'
        
        connection_string = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_string)
        
        with engine.connect() as conn:
            result = conn.execute(text(sql_query))
            columns = result.keys()
            rows = []
            
            for row in result:
                row_dict = {}
                for i, col in enumerate(columns):
                    value = row[i]
                    if hasattr(value, 'isoformat'):
                        value = value.isoformat()
                    row_dict[col] = value
                rows.append(row_dict)
        
        engine.dispose()
        
        return {
            "data": rows,
            "columns": list(columns),
            "row_count": len(rows)
        }
        
    except Exception as e:
        logger.error(f"Failed to execute query: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Query execution failed: {str(e)}"
        )
