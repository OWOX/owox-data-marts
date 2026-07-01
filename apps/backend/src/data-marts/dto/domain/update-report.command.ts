import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { SortConfig } from '../schemas/sort-config.schema';
import { AggregationConfig } from '../schemas/aggregation-config.schema';
import { DateTruncConfig } from '../schemas/date-trunc-config.schema';
import { UniqueCountConfig } from '../schemas/unique-count-config.schema';

export class UpdateReportCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly title: string,
    public readonly dataDestinationId: string,
    public readonly destinationConfig: DataDestinationConfig,
    public readonly ownerIds?: string[],
    public readonly columnConfig?: ReportColumnConfig,
    public readonly filterConfig?: FilterConfig | null,
    public readonly sortConfig?: SortConfig | null,
    public readonly limitConfig?: number | null,
    public readonly aggregationConfig?: AggregationConfig | null,
    public readonly dateTruncConfig?: DateTruncConfig | null,
    public readonly uniqueCountConfig?: UniqueCountConfig
  ) {}
}
