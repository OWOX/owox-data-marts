from typing import List
from sqlalchemy.orm import Session
from app.crud.base import CRUDBase
from app.models.data_collection import DataCollection
from app.schemas.data_collection import DataCollectionCreate, DataCollectionUpdate


class CRUDDataCollection(CRUDBase[DataCollection, DataCollectionCreate, DataCollectionUpdate]):
    def create_with_user(
        self, db: Session, *, obj_in: DataCollectionCreate, user_id: int
    ) -> DataCollection:
        db_obj = DataCollection(
            user_id=user_id,
            data_mart_id=obj_in.data_mart_id,
            platform_credential_id=obj_in.platform_credential_id,
            collection_name=obj_in.collection_name,
            collection_params=obj_in.collection_params,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_multi_by_user(
        self, db: Session, *, user_id: int, skip: int = 0, limit: int = 100
    ) -> List[DataCollection]:
        return (
            db.query(self.model)
            .filter(DataCollection.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )


data_collection = CRUDDataCollection(DataCollection)
