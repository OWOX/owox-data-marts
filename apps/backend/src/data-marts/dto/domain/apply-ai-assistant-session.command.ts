import type { ApplyAiAssistantActionType } from './ai-assistant-apply.types';
import type { TemplateEditPlaceholderTag } from '../../services/template-edit-placeholder-tags/template-edit-placeholder-tags.contracts';

export interface ApplyAiAssistantActionPayload {
  type: ApplyAiAssistantActionType;
  templateId?: string;
  sourceKey?: string;
  targetArtifactId?: string;
  insertTag?: boolean;
  text?: string;
  tags?: TemplateEditPlaceholderTag[];
  suggestedTemplateEditDiffPreview?: string;
}

export class ApplyAiAssistantSessionCommand {
  constructor(
    public readonly sessionId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly requestId: string,
    public readonly assistantMessageId: string,
    public readonly sql?: string,
    public readonly artifactTitle?: string
  ) {}
}
