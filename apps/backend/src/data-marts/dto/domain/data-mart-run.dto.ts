import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { RunType } from '../../../common/scheduler/shared/types';
import { DataMartRunReportDefinition } from '../schemas/data-mart-run/data-mart-run-report-definition.schema';

export class DataMartRunDto {
  constructor(
    public readonly id: string,
    public readonly status: DataMartRunStatus | null,
    public readonly type: DataMartRunType | null,
    public readonly runType: RunType | null,
    public readonly dataMartId: string,
    public readonly definitionRun: DataMartDefinition | null,
    public readonly reportDefinition: DataMartRunReportDefinition | null,
    public readonly logs: string[],
    public readonly errors: string[],
    public readonly createdAt: Date,
    public readonly startedAt: Date | null,
    public readonly finishedAt: Date | null
  ) {}
}
