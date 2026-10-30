import { ApiProperty } from '@nestjs/swagger';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { IsEnum, IsNotEmptyObject, IsOptional, IsUUID, IsString } from 'class-validator';

export class UpdateDataMartDefinitionApiDto {
  @ApiProperty({ enum: DataMartDefinitionType, example: DataMartDefinitionType.SQL })
  @IsEnum(DataMartDefinitionType)
  definitionType: DataMartDefinitionType;

  @ApiProperty({
    type: () => Object,
    required: true,
    description:
      'Each connector configuration item selects a Credential with `_credential_id` (USE on a newly selected one) and carries no key values.',
  })
  @IsNotEmptyObject()
  definition: DataMartDefinition;

  @ApiProperty({
    required: false,
    deprecated: true,
    description: 'Rejected for a connector definition. Select the same Credential instead.',
  })
  @IsOptional()
  @IsUUID()
  sourceDataMartId?: string;

  @ApiProperty({
    required: false,
    deprecated: true,
    description: 'Rejected for a connector definition. Select the same Credential instead.',
  })
  @IsOptional()
  @IsString()
  sourceConfigurationId?: string;
}
