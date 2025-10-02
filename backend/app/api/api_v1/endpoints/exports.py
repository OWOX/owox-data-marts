"""
CSV Export Download Endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pathlib import Path
from typing import List
import logging
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)

EXPORTS_DIR = Path('/app/exports')


@router.get("/csv/list")
async def list_csv_exports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all available CSV export files"""
    try:
        if not EXPORTS_DIR.exists():
            return {"files": []}
        
        files = []
        for file_path in EXPORTS_DIR.glob('*.csv'):
            stat = file_path.stat()
            files.append({
                'filename': file_path.name,
                'size': stat.st_size,
                'created_at': stat.st_ctime,
                'download_url': f"/api/v1/exports/csv/download/{file_path.name}"
            })
        
        # Sort by creation time, newest first
        files.sort(key=lambda x: x['created_at'], reverse=True)
        
        return {"files": files, "total": len(files)}
        
    except Exception as e:
        logger.error(f"Error listing CSV exports: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/csv/download/{filename}")
async def download_csv_export(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download a specific CSV export file"""
    try:
        # Security: prevent directory traversal
        if '..' in filename or '/' in filename or '\\' in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        file_path = EXPORTS_DIR / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Not a file")
        
        logger.info(f"📥 Downloading CSV export: {filename}")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type='text/csv'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading CSV export: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/csv/delete/{filename}")
async def delete_csv_export(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a CSV export file"""
    try:
        # Security: prevent directory traversal
        if '..' in filename or '/' in filename or '\\' in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        file_path = EXPORTS_DIR / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path.unlink()
        logger.info(f"🗑️ Deleted CSV export: {filename}")
        
        return {"message": "File deleted successfully", "filename": filename}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting CSV export: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
