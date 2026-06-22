import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DestinationConfig } from '../../entities/destination-config.type';

export class UpdateDataDestinationCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly title: string,
    public readonly credentials?: DataDestinationCredentials,
    public readonly credentialId?: string | null,
    public readonly sourceDestinationId?: string,
    public readonly ownerIds?: string[],
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    public readonly availableForUse?: boolean,
    public readonly availableForMaintenance?: boolean,
    public readonly contextIds?: string[],
    public readonly config?: DestinationConfig | null
  ) {}

  hasCredentials(): boolean {
    return this.credentials !== undefined;
  }
}
