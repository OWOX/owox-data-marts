import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DestinationConfig } from '../../entities/destination-config.type';

export class CreateDataDestinationCommand {
  constructor(
    public readonly projectId: string,
    public readonly title: string,
    public readonly type: DataDestinationType,
    public readonly userId: string,
    public readonly credentials?: DataDestinationCredentials,
    public readonly credentialId?: string,
    public readonly sourceDestinationId?: string,
    public readonly ownerIds?: string[],
    public readonly roles: string[] = [],
    public readonly config?: DestinationConfig | null
  ) {}

  hasCredentials(): boolean {
    return this.credentials !== undefined;
  }
}
