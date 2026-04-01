import { OwnerFilter } from '../../enums/owner-filter.enum';

export class ListReportsByProjectCommand {
  constructor(
    public readonly projectId: string,
    public readonly ownerFilter?: OwnerFilter
  ) {}
}
