import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';

export class CreateAiAssistantSessionRequestApiDto {
  @ApiProperty({
    enum: [AiAssistantScope.TEMPLATE],
    enumName: 'AiAssistantScope',
    example: AiAssistantScope.TEMPLATE,
  })
  @IsIn([AiAssistantScope.TEMPLATE])
  scope: AiAssistantScope;

  @ApiProperty({
    description: 'Insight Template id context for template scope',
    example: '6f093b03-30c1-43e0-b9ed-6d87d33edf15',
  })
  @IsUUID()
  templateId: string;
}
