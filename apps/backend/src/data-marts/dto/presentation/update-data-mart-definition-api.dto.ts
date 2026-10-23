import { ApiProperty } from '@nestjs/swagger';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { IsEnum, IsNotEmptyObject, IsOptional, IsUUID, IsString } from 'class-validator';

export class UpdateDataMartDefinitionApiDto {
  @ApiProperty({ enum: DataMartDefinitionType, example: DataMartDefinitionType.SQL })
  @IsEnum(DataMartDefinitionType)
  definitionType: DataMartDefinitionType;

  @ApiProperty({ type: () => Object, required: true })
  @IsNotEmptyObject()
  definition: DataMartDefinition;

  @ApiProperty({ required: false, description: 'Source Data Mart ID to copy secrets from' })
  @IsOptional()
  @IsUUID()
  sourceDataMartId?: string;

  @ApiProperty({
    required: false,
    description:
      'Public configuration ID in sourceDataMartId. Requires a CONNECTOR definition with one configuration of overrides; [{}] copies unchanged. Source edit access is required.',
  })
  @IsOptional()
  @IsString()
  sourceConfigurationId?: string;
}
