import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';

export class UpdateReportCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly title: string,
    public readonly dataDestinationId: string,
    public readonly destinationConfig: DataDestinationConfig
  ) {}
}
