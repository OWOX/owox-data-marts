import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';

export class AiAssistantSessionListItemResponseApiDto {
  @ApiProperty({ example: 'e7f7e087-2042-4de0-b1fc-67dddbaf88dd' })
  id: string;

  @ApiProperty({ example: 'a5c9b1d2-3456-7890-abcd-ef0123456789' })
  dataMartId: string;

  @ApiProperty({
    enum: AiAssistantScope,
    enumName: 'AiAssistantScope',
    example: AiAssistantScope.TEMPLATE,
  })
  scope: AiAssistantScope;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Revenue by source',
  })
  title?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '6f093b03-30c1-43e0-b9ed-6d87d33edf15',
  })
  templateId?: string | null;

  @ApiProperty({ example: '2026-02-15T16:10:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2026-02-15T16:10:07.930Z' })
  updatedAt: string | Date;
}
