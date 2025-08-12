import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataStorageDto } from './data-storage.dto';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

export class DataMartDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly status: DataMartStatus,
    public readonly storage: DataStorageDto,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly definitionType?: DataMartDefinitionType,
    public readonly definition?: DataMartDefinition,
    public readonly description?: string,
    public readonly schema?: DataMartSchema,
    public readonly triggersCount: number = 0,
    public readonly reportsCount: number = 0
  ) {}
}
