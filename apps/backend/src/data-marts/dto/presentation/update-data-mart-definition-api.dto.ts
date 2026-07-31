import { ApiProperty } from '@nestjs/swagger';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { IsEnum, IsNotEmptyObject, IsOptional, IsUUID } from 'class-validator';

export class UpdateDataMartDefinitionApiDto {
  @ApiProperty({ enum: DataMartDefinitionType, example: DataMartDefinitionType.SQL })
  @IsEnum(DataMartDefinitionType)
  definitionType: DataMartDefinitionType;

  @ApiProperty({ type: () => Object, required: true })
  @IsNotEmptyObject()
  definition: DataMartDefinition;

  @ApiProperty({
    required: false,
    description:
      'Source Data Mart ID to copy secrets from. Only used for copied configuration items ' +
      'that do not name their own source in _copiedFrom.dataMartId.',
  })
  @IsOptional()
  @IsUUID()
  sourceDataMartId?: string;
}
