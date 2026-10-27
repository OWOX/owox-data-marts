import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DestinationConfig } from '../../entities/destination-config.type';

export class UpdateDataDestinationCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly title: string,
    public readonly credentials?: DataDestinationCredentials,
    /** Absent keeps the binding; null is rejected. */
    public readonly reusableCredentialId?: string | null,
    /** True when the request carries `credentialId` or `sourceDestinationId`. */
    public readonly sentOldCredentialFields: boolean = false,
    public readonly ownerIds?: string[],
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    public readonly availableForUse?: boolean,
    public readonly availableForMaintenance?: boolean,
    public readonly contextIds?: string[],
    public readonly config?: DestinationConfig | null,
    public readonly isPluginCall: boolean = false
  ) {}
}
