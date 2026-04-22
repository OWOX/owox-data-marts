import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';

export class CreateReportCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly dataMartId: string,
    public readonly dataDestinationId: string,
    public readonly destinationConfig: DataDestinationConfig,
    public readonly ownerIds?: string[],
    public readonly roles: string[] = [],
    public readonly columnConfig?: ReportColumnConfig
  ) {}
}
