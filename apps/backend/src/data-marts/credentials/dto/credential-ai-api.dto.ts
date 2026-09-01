import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject } from 'class-validator';

export type CredentialAiLanguageModelKey = 'fast' | 'reasoning';
export type CredentialAiEmbeddingModelKey = 'embedding';
export type CredentialAiModelKey = CredentialAiLanguageModelKey | CredentialAiEmbeddingModelKey;

export class CredentialAiRequestApiDto {
  @ApiProperty({ enum: [1] })
  @IsInt()
  @IsIn([1])
  version: 1;

  @ApiProperty({ enum: ['fast', 'reasoning', 'embedding'] })
  @IsIn(['fast', 'reasoning', 'embedding'])
  model: CredentialAiModelKey;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  options: Record<string, unknown>;
}
