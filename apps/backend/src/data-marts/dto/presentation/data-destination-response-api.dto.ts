import { ApiProperty } from '@nestjs/swagger';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';

export class DataDestinationResponseApiDto {
  @ApiProperty({ example: 'abc123e4-5678-90ab-cdef-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'My Google Sheets Destination' })
  title: string;

  @ApiProperty({ enum: DataDestinationType, example: DataDestinationType.GOOGLE_SHEETS })
  type: DataDestinationType;

  @ApiProperty({ example: 'my-project' })
  projectId: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Credentials for the destination',
  })
  credentials: DataDestinationCredentials;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
