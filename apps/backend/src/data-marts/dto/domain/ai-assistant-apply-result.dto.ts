import type { AiAssistantApplyStatus } from './ai-assistant-apply.types';

export class AiAssistantApplyResultDto {
  constructor(
    public readonly requestId: string,
    public readonly artifactId: string | null,
    public readonly artifactTitle: string | null,
    public readonly templateUpdated: boolean,
    public readonly templateId: string | null,
    public readonly sourceKey: string | null,
    public readonly status: AiAssistantApplyStatus,
    public readonly reason: string | null
  ) {}
}
