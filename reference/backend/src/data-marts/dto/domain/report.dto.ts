import { DataMartDto } from './data-mart.dto';
import { DataDestinationDto } from './data-destination.dto';
import { ReportRunStatus } from '../../enums/report-run-status.enum';
import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';

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
    public readonly runsCount: number = 0
  ) {}
}
