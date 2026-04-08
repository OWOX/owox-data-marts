import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { BlendedFieldsConfig } from '../schemas/blended-fields-config.schemas';

export class UpdateBlendedFieldsConfigApiDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  blendedFieldsConfig?: BlendedFieldsConfig | null;
}
