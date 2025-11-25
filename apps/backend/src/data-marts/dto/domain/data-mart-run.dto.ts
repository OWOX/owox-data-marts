import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { RunType } from '../../../common/scheduler/shared/types';
import { DataMartRunReportDefinition } from '../schemas/data-mart-run/data-mart-run-report-definition.schema';
import { DataMartRunInsightDefinition } from '../schemas/data-mart-run/data-mart-run-insight-definition.schema';

export class DataMartRunDto {
  constructor(
    public readonly id: string,
    public readonly status: DataMartRunStatus,
    public readonly type: DataMartRunType,
    public readonly runType: RunType,
    public readonly dataMartId: string,
    public readonly definitionRun: DataMartDefinition,
    public readonly reportId: string | null,
    public readonly reportDefinition: DataMartRunReportDefinition | null,
    public readonly insightId: string | null,
    public readonly insightDefinition: DataMartRunInsightDefinition | null,
    public readonly logs: string[] | null,
    public readonly errors: string[] | null,
    public readonly createdAt: Date,
    public readonly startedAt: Date | null,
    public readonly finishedAt: Date | null
  ) {}
}
