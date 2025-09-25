from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_report import report as crud_report
from app.database.database import get_db
from app.models.user import User
from app.schemas.report import Report, ReportCreate, ReportUpdate

router = APIRouter()


@router.get("/", response_model=List[Report])
def read_reports(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve reports for current user
    """
    reports = crud_report.get_multi_by_user(
        db, user_id=current_user.id, skip=skip, limit=limit
    )
    return reports


@router.post("/", response_model=Report)
def create_report(
    *,
    db: Session = Depends(get_db),
    report_in: ReportCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new report
    """
    report = crud_report.create_with_user(
        db=db, obj_in=report_in, user_id=current_user.id
    )
    return report


@router.put("/{report_id}", response_model=Report)
def update_report(
    *,
    db: Session = Depends(get_db),
    report_id: int,
    report_in: ReportUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a report
    """
    report = crud_report.get(db=db, id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    report = crud_report.update(db=db, db_obj=report, obj_in=report_in)
    return report


@router.get("/{report_id}", response_model=Report)
def read_report(
    *,
    db: Session = Depends(get_db),
    report_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get report by ID
    """
    report = crud_report.get(db=db, id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != current_user.id and not report.is_public:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return report


@router.delete("/{report_id}")
def delete_report(
    *,
    db: Session = Depends(get_db),
    report_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a report
    """
    report = crud_report.get(db=db, id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    report = crud_report.remove(db=db, id=report_id)
    return {"message": "Report deleted successfully"}
