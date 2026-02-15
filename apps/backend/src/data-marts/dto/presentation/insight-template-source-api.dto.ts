import { ApiProperty } from '@nestjs/swagger';
import { InsightTemplateSourceType } from '../schemas/insight-template/insight-template-source.schema';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InsightTemplateSourceApiDto {
  @ApiProperty({ example: 'last_30d', maxLength: 64 })
  @IsString()
  @MaxLength(64)
  key: string;

  @ApiProperty({ enum: InsightTemplateSourceType })
  @IsEnum(InsightTemplateSourceType)
  type: InsightTemplateSourceType;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  artifactId?: string | null;
}
