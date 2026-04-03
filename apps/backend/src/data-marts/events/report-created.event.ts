import { BaseEvent } from '@owox/internal-helpers';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

export interface ReportCreatedEventPayload {
  reportId: string;
  dataMartId: string;
  projectId: string;
  dataDestinationType: DataDestinationType;
  createdById: string;
}

export class ReportCreatedEvent extends BaseEvent<ReportCreatedEventPayload> {
  get name() {
    return 'report.created' as const;
  }

  constructor(
    reportId: string,
    dataMartId: string,
    projectId: string,
    dataDestinationType: DataDestinationType,
    createdById: string
  ) {
    super({ reportId, dataMartId, projectId, dataDestinationType, createdById });
  }
}
