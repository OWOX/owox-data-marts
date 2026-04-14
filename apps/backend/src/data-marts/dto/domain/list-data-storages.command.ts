import { OwnerFilter } from '../../enums/owner-filter.enum';

export class ListDataStoragesCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly ownerFilter?: OwnerFilter
  ) {}
}
