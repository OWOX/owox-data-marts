import { OwnerFilter } from '../../enums/owner-filter.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';

export class ListDataMartsCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly offset?: number,
    public readonly ownerFilter?: OwnerFilter,
    public readonly status?: DataMartStatus
  ) {}
}
