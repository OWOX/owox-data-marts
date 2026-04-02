import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, ValidateIf } from 'class-validator';

export const INSIGHT_TEMPLATE_RUN_REQUEST_TYPES = ['manual', 'chat'] as const;

export class CreateInsightTemplateRunTriggerRequestApiDto {
  @ApiProperty({
    description: 'Source of the Run Insight request',
    enum: INSIGHT_TEMPLATE_RUN_REQUEST_TYPES,
    example: 'manual',
  })
  @IsString()
  @IsIn(INSIGHT_TEMPLATE_RUN_REQUEST_TYPES)
  type: (typeof INSIGHT_TEMPLATE_RUN_REQUEST_TYPES)[number];

  @ApiPropertyOptional({
    description: 'Assistant message id that initiated Apply & Run',
    example: '57bba70a-8ad8-4edc-8b3e-ec45f51dc486',
  })
  @ValidateIf(dto => dto.type === 'chat')
  @IsUUID()
  assistantMessageId?: string;
}
