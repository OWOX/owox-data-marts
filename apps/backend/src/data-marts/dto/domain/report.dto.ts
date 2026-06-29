import { DataMartDto } from './data-mart.dto';
import { DataDestinationDto } from './data-destination.dto';
import { ReportRunStatus } from '../../enums/report-run-status.enum';
import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { SortConfig } from '../schemas/sort-config.schema';
import { AggregationConfig } from '../schemas/aggregation-config.schema';
import { DateTruncConfig } from '../schemas/date-trunc-config.schema';
import { UniqueCountConfig } from '../schemas/unique-count-config.schema';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

export class ReportDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly dataMart: DataMartDto,
    public readonly dataDestinationAccess: DataDestinationDto,
    public readonly destinationConfig: DataDestinationConfig,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly lastRunAt?: Date,
    public readonly lastRunError?: string,
    public readonly lastRunStatus?: ReportRunStatus,
    public readonly runsCount: number = 0,
    public readonly createdByUser: UserProjectionDto | null = null,
    public readonly ownerUsers: UserProjectionDto[] = [],
    public readonly columnConfig?: ReportColumnConfig,
    public readonly filterConfig?: FilterConfig | null,
    public readonly sortConfig?: SortConfig | null,
    public readonly limitConfig?: number | null,
    public readonly canRun: boolean = false,
    public readonly canManageTriggers: boolean = false,
    public readonly canEditConfig: boolean = false,
    public readonly aggregationConfig?: AggregationConfig | null,
    public readonly dateTruncConfig?: DateTruncConfig | null,
    public readonly uniqueCountConfig?: UniqueCountConfig
  ) {}
}
