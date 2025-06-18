import { ApiProperty } from '@nestjs/swagger';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { IsEnum, IsNotEmptyObject } from 'class-validator';

export class UpdateDataMartDefinitionApiDto {
  @ApiProperty({ enum: DataMartDefinitionType, example: DataMartDefinitionType.SQL })
  @IsEnum(DataMartDefinitionType)
  definitionType: DataMartDefinitionType;

  @ApiProperty({ type: () => Object, required: true })
  @IsNotEmptyObject()
  definition: DataMartDefinition;
}
