import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApplyAiAssistantSessionRequestApiDto {
  @ApiProperty({
    description: 'Apply action id returned in assistant response.proposedActions[].id',
    example: 'act_7ce2f8ad0ea74745a43fc3ae59f2f8f8_0',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  requestId: string;

  @ApiProperty({
    description: 'Assistant message id that owns selected apply action',
    example: '57bba70a-8ad8-4edc-8b3e-ec45f51dc486',
  })
  @IsUUID()
  assistantMessageId: string;

  @ApiPropertyOptional({
    description: 'SQL override. When omitted, latest SQL candidate from assistant message is used',
    example: 'SELECT * FROM ${DATA_MART_TABLE}',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  sql?: string;

  @ApiPropertyOptional({
    description: 'Title override for created or updated artifact',
    example: 'Monthly product consumption source',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  artifactTitle?: string;
}
