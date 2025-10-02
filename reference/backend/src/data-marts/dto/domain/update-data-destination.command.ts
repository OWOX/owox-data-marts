import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';

export class UpdateDataDestinationCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly title: string,
    public readonly credentials: DataDestinationCredentials
  ) {}

  hasCredentials(): boolean {
    return this.credentials !== undefined;
  }
}
