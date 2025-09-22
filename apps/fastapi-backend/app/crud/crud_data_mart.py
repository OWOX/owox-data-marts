from typing import List
from sqlalchemy.orm import Session
from app.crud.base import CRUDBase
from app.models.data_mart import DataMart
from app.schemas.data_mart import DataMartCreate, DataMartUpdate


class CRUDDataMart(CRUDBase[DataMart, DataMartCreate, DataMartUpdate]):
    def create_with_user(
        self, db: Session, *, obj_in: DataMartCreate, user_id: int
    ) -> DataMart:
        db_obj = DataMart(
            user_id=user_id,
            title=obj_in.title,
            description=obj_in.description,
            mart_type=obj_in.mart_type,
            source_platform=obj_in.source_platform,
            sql_query=obj_in.sql_query,
            configuration=obj_in.configuration,
            is_scheduled=obj_in.is_scheduled,
            schedule_config=obj_in.schedule_config,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_multi_by_user(
        self, db: Session, *, user_id: int, skip: int = 0, limit: int = 100
    ) -> List[DataMart]:
        return (
            db.query(self.model)
            .filter(DataMart.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )


data_mart = CRUDDataMart(DataMart)
