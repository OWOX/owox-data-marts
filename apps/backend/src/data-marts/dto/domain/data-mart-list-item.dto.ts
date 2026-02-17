import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';

export class DataMartListItemDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly status: DataMartStatus,
    public readonly storageType: DataStorageType,
    public readonly storageTitle: string,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly definitionType?: DataMartDefinitionType,
    public readonly definition?: DataMartDefinition,
    public readonly triggersCount: number = 0,
    public readonly reportsCount: number = 0,
    public readonly createdByUser: UserProjectionDto | null = null
  ) {}
}
