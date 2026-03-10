import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAiAssistantMessageRequestApiDto {
  @ApiProperty({
    description: 'New user message text',
    example: 'Build SQL source with monthly product consumption for 2025',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  text: string;
}
