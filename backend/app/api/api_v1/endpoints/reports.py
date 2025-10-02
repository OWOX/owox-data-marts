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
    from app.models.report import Report as ReportModel
    
    reports = db.query(ReportModel).filter(
        ReportModel.created_by_id == current_user.id
    ).offset(skip).limit(limit).all()
    
    return reports


@router.post("/", response_model=Report)
def create_report(
    *,
    db: Session = Depends(get_db),
    report_in: ReportCreate,
    current_user: User = Depends(deps.get_current_user),
    project_id: str = "default"
) -> Any:
    """
    Create new report
    """
    from app.models.report import Report as ReportModel, ReportStatus
    import uuid
    
    # Create report directly
    db_report = ReportModel(
        id=uuid.uuid4(),
        title=report_in.title,
        description=report_in.description,
        data_mart_id=report_in.data_mart_id,
        report_type=report_in.report_type,
        status=ReportStatus.DRAFT,
        is_public=report_in.is_public,
        config=report_in.report_config,
        project_id=project_id,
        created_by_id=current_user.id
    )
    
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    
    return db_report


@router.put("/{report_id}", response_model=Report)
def update_report(
    *,
    db: Session = Depends(get_db),
    report_id: str,
    report_in: ReportUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a report
    """
    from app.models.report import Report as ReportModel
    
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Update fields
    if report_in.title is not None:
        report.title = report_in.title
    if report_in.description is not None:
        report.description = report_in.description
    if report_in.status is not None:
        report.status = report_in.status
    if report_in.report_config is not None:
        report.config = report_in.report_config
    if report_in.is_public is not None:
        report.is_public = report_in.is_public
    
    db.commit()
    db.refresh(report)
    return report


@router.get("/{report_id}", response_model=Report)
def read_report(
    *,
    db: Session = Depends(get_db),
    report_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get report by ID
    """
    from app.models.report import Report as ReportModel
    
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.created_by_id != current_user.id and not report.is_public:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return report


@router.delete("/{report_id}")
def delete_report(
    *,
    db: Session = Depends(get_db),
    report_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a report
    """
    from app.models.report import Report as ReportModel
    
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    db.delete(report)
    db.commit()
    return {"message": "Report deleted successfully"}
