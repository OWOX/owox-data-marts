import { BaseEvent } from '@owox/internal-helpers';
import { Report } from '../entities/report.entity';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationConfig } from '../data-destination-types/data-destination-config.type';

export interface ReportDeletedEventPayload {
  reportId: string;
  dataMartId: string;
  projectId: string;
  dataDestinationId: string;
  dataDestinationType: DataDestinationType;
  destinationConfig: DataDestinationConfig;
}

export class ReportDeletedEvent extends BaseEvent<ReportDeletedEventPayload> {
  get name() {
    return 'report.deleted' as const;
  }

  constructor(report: Report) {
    super({
      reportId: report.id,
      dataMartId: report.dataMart.id,
      projectId: report.dataMart.projectId,
      dataDestinationId: report.dataDestination.id,
      dataDestinationType: report.dataDestination.type,
      destinationConfig: report.destinationConfig,
    });
  }
}
