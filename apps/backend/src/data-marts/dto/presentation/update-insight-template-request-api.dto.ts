import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_TEMPLATE_SOURCES } from '../schemas/insight-template/insight-template-source.schema';
import { InsightTemplateSourceApiDto } from './insight-template-source-api.dto';

export class UpdateInsightTemplateRequestApiDto {
  @ApiProperty({ example: 'Summary (updated)', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: '## Updated\n{{table source="main"}}', required: false })
  @IsString()
  @IsOptional()
  template?: string;

  @ApiProperty({ type: [InsightTemplateSourceApiDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TEMPLATE_SOURCES)
  @ValidateNested({ each: true })
  @Type(() => InsightTemplateSourceApiDto)
  sources?: InsightTemplateSourceApiDto[];
}
