import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ListAiAssistantRunTriggersQueryApiDto {
  @ApiProperty({
    description: 'AI assistant session id',
    example: '6f093b03-30c1-43e0-b9ed-6d87d33edf15',
  })
  @IsUUID()
  sessionId: string;
}
