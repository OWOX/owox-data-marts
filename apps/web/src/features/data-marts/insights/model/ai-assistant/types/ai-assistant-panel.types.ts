import type { AssistantProposedAction } from './ai-assistant.dto.ts';

export type ApplyChangesMessageAction = Extract<
  AssistantProposedAction,
  { type: 'apply_changes_to_source' | 'apply_sql_to_artifact' }
>;
export type CreateAndAttachMessageAction = Extract<
  AssistantProposedAction,
  { type: 'create_source_and_attach' | 'attach_source_to_template' }
>;
export type InsertIntoTemplateMessageAction = Extract<
  AssistantProposedAction,
  { type: 'reuse_source_without_changes' }
>;
export type ApplyTemplateEditMessageAction = Extract<
  AssistantProposedAction,
  { type: 'replace_template_document' }
>;

export interface AssistantMessageDetails {
  sqlCandidate: string;
  applyChangesAction: ApplyChangesMessageAction | null;
  createAndAttachAction: CreateAndAttachMessageAction | null;
  insertIntoTemplateAction: InsertIntoTemplateMessageAction | null;
  applyTemplateEditAction: ApplyTemplateEditMessageAction | null;
  hasTemplateEditPayload: boolean;
  hasActions: boolean;
}

export interface AiAssistantPanelHandle {
  startNewConversation: () => Promise<void>;
}
