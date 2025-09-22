from typing import List
from sqlalchemy.orm import Session
from app.crud.base import CRUDBase
from app.models.report import Report
from app.schemas.report import ReportCreate, ReportUpdate


class CRUDReport(CRUDBase[Report, ReportCreate, ReportUpdate]):
    def create_with_user(
        self, db: Session, *, obj_in: ReportCreate, user_id: int
    ) -> Report:
        db_obj = Report(
            user_id=user_id,
            data_mart_id=obj_in.data_mart_id,
            title=obj_in.title,
            description=obj_in.description,
            report_type=obj_in.report_type,
            report_config=obj_in.report_config,
            is_public=obj_in.is_public,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_multi_by_user(
        self, db: Session, *, user_id: int, skip: int = 0, limit: int = 100
    ) -> List[Report]:
        return (
            db.query(self.model)
            .filter(Report.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )


report = CRUDReport(Report)
