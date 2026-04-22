import { JoinCondition } from '../schemas/relationship-schemas';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

export interface RelationshipDataMartRef {
  id: string;
  title: string;
  description?: string;
  status: DataMartStatus;
}

export interface RelationshipDto {
  id: string;
  dataStorageId: string;
  sourceDataMart: RelationshipDataMartRef;
  targetDataMart: RelationshipDataMartRef;
  targetAlias: string;
  joinConditions: JoinCondition[];
  createdById: string;
  createdAt: Date;
  modifiedAt: Date;
  createdByUser?: UserProjectionDto | null;
}
