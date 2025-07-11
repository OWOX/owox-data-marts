import { ApiProperty } from '@nestjs/swagger';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataStorageResponseApiDto } from './data-storage-response-api.dto';
import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

export class DataMartResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'First Data Mart' })
  title: string;

  @ApiProperty({ enum: DataMartStatus, example: DataMartStatus.DRAFT })
  status: DataMartStatus;

  @ApiProperty()
  storage: DataStorageResponseApiDto;

  @ApiProperty({ enum: DataMartDefinitionType, example: DataMartDefinitionType.SQL })
  definitionType?: DataMartDefinitionType;

  @ApiProperty()
  definition?: DataMartDefinition;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  schema?: DataMartSchema;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
