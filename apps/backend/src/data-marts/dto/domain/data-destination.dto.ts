import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';

export class DataDestinationDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly type: DataDestinationType,
    public readonly projectId: string,
    public readonly credentials: DataDestinationCredentials,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date
  ) {}
}
