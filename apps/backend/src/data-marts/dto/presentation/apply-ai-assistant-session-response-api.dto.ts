import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AI_ASSISTANT_APPLY_STATUS_VALUES } from '../domain/ai-assistant-apply.types';

export class ApplyAiAssistantSessionResponseApiDto {
  @ApiProperty({
    description: 'Idempotency key associated with apply operation',
    example: '8ea56dbc-f6ad-47a4-9f05-f7c4e7594ecb',
  })
  requestId: string;

  @ApiPropertyOptional({
    description: 'Artifact id that received SQL apply',
    nullable: true,
    example: '6742f3e8-1a02-4642-bbf4-e7f8710f9507',
  })
  artifactId: string | null;

  @ApiPropertyOptional({
    description: 'Artifact title after apply',
    nullable: true,
    example: 'Monthly product consumption source',
  })
  artifactTitle: string | null;

  @ApiProperty({
    description: 'Whether template sources/template text changed',
    example: true,
  })
  templateUpdated: boolean;

  @ApiPropertyOptional({
    description: 'Template id that was updated',
    nullable: true,
    example: '6f093b03-30c1-43e0-b9ed-6d87d33edf15',
  })
  templateId: string | null;

  @ApiPropertyOptional({
    description: 'Source key added/used in template',
    nullable: true,
    example: 'monthly_consumption',
  })
  sourceKey: string | null;

  @ApiProperty({
    description: 'Structured apply status',
    enum: AI_ASSISTANT_APPLY_STATUS_VALUES,
    example: 'updated',
  })
  status: (typeof AI_ASSISTANT_APPLY_STATUS_VALUES)[number];

  @ApiPropertyOptional({
    description: 'Optional structured reason for apply status',
    nullable: true,
    example: 'replace_template_document',
  })
  reason: string | null;
}
