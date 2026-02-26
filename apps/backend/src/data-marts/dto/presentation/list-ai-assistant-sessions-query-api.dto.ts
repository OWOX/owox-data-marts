import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';

export class ListAiAssistantSessionsQueryApiDto {
  @ApiProperty({
    enum: [AiAssistantScope.TEMPLATE],
    enumName: 'AiAssistantScope',
    example: AiAssistantScope.TEMPLATE,
  })
  @IsIn([AiAssistantScope.TEMPLATE])
  scope: AiAssistantScope;

  @ApiPropertyOptional({
    description: 'Template id filter. Use with template scope',
    example: '6f093b03-30c1-43e0-b9ed-6d87d33edf15',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Limit number of sessions',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Offset for session list',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
