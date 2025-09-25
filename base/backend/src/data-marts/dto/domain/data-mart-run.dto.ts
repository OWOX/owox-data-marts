import { ConnectorDefinition } from '../schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';

export class DataMartRunDto {
  constructor(
    public readonly id: string,
    public readonly status: DataMartRunStatus,
    public readonly dataMartId: string,
    public readonly definitionRun: ConnectorDefinition,
    public readonly logs: string[],
    public readonly errors: string[],
    public readonly createdAt: Date
  ) {}
}
