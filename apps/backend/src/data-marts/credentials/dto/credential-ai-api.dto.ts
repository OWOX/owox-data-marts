import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject } from 'class-validator';

export type CredentialAiLanguageModelKey = 'fast' | 'reasoning';
export type CredentialAiEmbeddingModelKey = 'embedding';
export type CredentialAiDecisionModelKey = 'decision';
export type CredentialAiModelKey =
  | CredentialAiLanguageModelKey
  | CredentialAiEmbeddingModelKey
  | CredentialAiDecisionModelKey;

export class CredentialAiRequestApiDto {
  @ApiProperty({ enum: [1] })
  @IsInt()
  @IsIn([1])
  version: 1;

  @ApiProperty({ enum: ['fast', 'reasoning', 'embedding', 'decision'] })
  @IsIn(['fast', 'reasoning', 'embedding', 'decision'])
  model: CredentialAiModelKey;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  options: Record<string, unknown>;
}
