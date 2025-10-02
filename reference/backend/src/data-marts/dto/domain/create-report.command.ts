import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';

export class CreateReportCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly dataMartId: string,
    public readonly dataDestinationId: string,
    public readonly destinationConfig: DataDestinationConfig
  ) {}
}
