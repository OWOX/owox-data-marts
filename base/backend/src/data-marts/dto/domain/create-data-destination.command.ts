import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';

export class CreateDataDestinationCommand {
  constructor(
    public readonly projectId: string,
    public readonly title: string,
    public readonly type: DataDestinationType,
    public readonly credentials: DataDestinationCredentials
  ) {}
}
