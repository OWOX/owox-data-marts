import { ApiProperty } from '@nestjs/swagger';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { UserProjection } from '../schemas/user-projection.schema';
import { DataMartListItemStorageApiDto } from './data-mart-list-item-storage-api.dto';

export class DataMartListItemResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'First Data Mart' })
  title: string;

  @ApiProperty({ enum: DataMartStatus, example: DataMartStatus.DRAFT })
  status: DataMartStatus;

  @ApiProperty()
  storage: DataMartListItemStorageApiDto;

  @ApiProperty({ enum: DataMartDefinitionType, example: DataMartDefinitionType.SQL })
  definitionType?: DataMartDefinitionType;

  @ApiProperty({ example: 'OpenExchangeRates' })
  connectorSourceName?: string;

  @ApiProperty({ example: 1 })
  triggersCount: number;

  @ApiProperty({ example: 2 })
  reportsCount: number;

  @ApiProperty()
  createdByUser: UserProjection | null;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
