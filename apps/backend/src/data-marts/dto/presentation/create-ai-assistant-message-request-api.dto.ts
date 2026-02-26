import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateAiAssistantMessageTurnContextApiDto {
  @ApiPropertyOptional({
    description: 'Explicit source key hint from UI context',
    example: 'consumption_2025',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceKeyHint?: string;

  @ApiPropertyOptional({
    description: 'Artifact id hint from current UI context',
    example: '6742f3e8-1a02-4642-bbf4-e7f8710f9507',
  })
  @IsOptional()
  @IsUUID()
  artifactIdHint?: string;

  @ApiPropertyOptional({
    description: 'Preferred snippet type for template insertion',
    enum: ['table', 'single_value'],
    example: 'table',
  })
  @IsOptional()
  @IsIn(['table', 'single_value'])
  preferredSnippetType?: 'table' | 'single_value';
}

export class CreateAiAssistantMessageRequestApiDto {
  @ApiProperty({
    description: 'New user message text',
    example: 'Build SQL source with monthly product consumption for 2025',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  text: string;

  @ApiPropertyOptional({
    description: 'Correlation id for client-side request tracking',
    example: 'd8302a9b-95b7-4334-a6f8-14944d89eb8b',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  correlationId?: string;

  @ApiPropertyOptional({
    description: 'Optional turn context hints for template-first routing',
    type: CreateAiAssistantMessageTurnContextApiDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAiAssistantMessageTurnContextApiDto)
  turnContext?: CreateAiAssistantMessageTurnContextApiDto;
}
