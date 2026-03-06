import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';

export class ListDataDestinationsByTypeCommand {
  constructor(
    public readonly projectId: string,
    public readonly type: DataDestinationType
  ) {}
}
