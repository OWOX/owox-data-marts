import { ApiProperty } from '@nestjs/swagger';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { DataMartListItemStorageApiDto } from './data-mart-list-item-storage-api.dto';
import { DataMartListItemContextApiDto } from './data-mart-list-item-context-api.dto';

export class DataMartListItemResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'First Data Mart' })
  title: string;

  @ApiProperty({ enum: DataMartStatus, example: DataMartStatus.DRAFT })
  status: DataMartStatus;

  @ApiProperty({ type: DataMartListItemStorageApiDto })
  storage: DataMartListItemStorageApiDto;

  @ApiProperty({ type: String, example: 'Data mart description', nullable: true })
  description: string | null;

  @ApiProperty({
    enum: DataMartDefinitionType,
    example: DataMartDefinitionType.SQL,
    required: false,
  })
  definitionType?: DataMartDefinitionType;

  @ApiProperty({ example: 'OpenExchangeRates', required: false })
  connectorSourceName?: string;

  @ApiProperty({ type: 'integer', example: 1, minimum: 0 })
  triggersCount: number;

  @ApiProperty({ type: 'integer', example: 2, minimum: 0 })
  reportsCount: number;

  @ApiProperty({ type: UserProjectionDto, nullable: true })
  createdByUser: UserProjectionDto | null;

  @ApiProperty({ type: [UserProjectionDto] })
  businessOwnerUsers: UserProjectionDto[];

  @ApiProperty({ type: [UserProjectionDto] })
  technicalOwnerUsers: UserProjectionDto[];

  @ApiProperty({ type: String, format: 'date-time', example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;

  @ApiProperty({ type: [DataMartListItemContextApiDto] })
  contexts: DataMartListItemContextApiDto[];

  @ApiProperty({ example: true })
  availableForReporting: boolean;

  @ApiProperty({ example: true })
  availableForMaintenance: boolean;
}
