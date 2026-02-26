import { ApiProperty } from '@nestjs/swagger';

export class CreateAiAssistantSessionResponseApiDto {
  @ApiProperty({
    example: 'e7f7e087-2042-4de0-b1fc-67dddbaf88dd',
    description: 'Created AI source assistant session id',
  })
  sessionId: string;
}
