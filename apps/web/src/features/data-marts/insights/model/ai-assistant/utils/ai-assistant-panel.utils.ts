import type {
  AiAssistantMessageDto,
  AiAssistantSessionListItemDto,
  ApplyAiAssistantSessionResponseDto,
} from '../types/ai-assistant.dto.ts';
import type {
  ApplyChangesMessageAction,
  AssistantMessageDetails,
  CreateAndAttachMessageAction,
} from '../types/ai-assistant-panel.types.ts';

export function formatSessionTitle(
  session: Pick<AiAssistantSessionListItemDto, 'title' | 'createdAt'>
): string {
  const normalized = (session.title ?? '').trim();
  if (normalized) {
    return normalized;
  }

  const createdAt = new Date(session.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return 'New chat';
  }

  return `New chat ${createdAt.toLocaleDateString()}`;
}

export function buildAssistantMessageDetails(
  message: AiAssistantMessageDto
): AssistantMessageDetails {
  const proposedActions = Array.isArray(message.proposedActions) ? message.proposedActions : [];
  const sqlCandidate = message.sqlCandidate?.trim() ?? '';
  const applyChangesAction = (proposedActions.find(
    action => action.type === 'apply_changes_to_source' || action.type === 'apply_sql_to_artifact'
  ) ?? null) as ApplyChangesMessageAction | null;
  const createSourceAndAttachAction = (proposedActions.find(
    action =>
      action.type === 'create_source_and_attach' || action.type === 'attach_source_to_template'
  ) ?? null) as CreateAndAttachMessageAction | null;
  const insertIntoTemplateAction =
    proposedActions.find(action => action.type === 'reuse_source_without_changes') ?? null;
  const applyTemplateEditAction =
    proposedActions.find(action => action.type === 'replace_template_document') ?? null;
  const templateEditPayloadAction =
    applyTemplateEditAction ??
    createSourceAndAttachAction ??
    applyChangesAction ??
    insertIntoTemplateAction;

  let hasTemplateEditPayload = false;
  if (templateEditPayloadAction) {
    const payload = templateEditPayloadAction.payload;
    hasTemplateEditPayload = Boolean(payload.text?.trim() && Array.isArray(payload.tags));
  }

  return {
    sqlCandidate,
    applyChangesAction,
    createAndAttachAction: createSourceAndAttachAction,
    insertIntoTemplateAction,
    applyTemplateEditAction,
    hasTemplateEditPayload,
    hasActions: Boolean(
      applyChangesAction?.id ??
      createSourceAndAttachAction?.id ??
      insertIntoTemplateAction?.id ??
      applyTemplateEditAction?.id
    ),
  };
}

export function formatApplyStatusMessage(result: ApplyAiAssistantSessionResponseDto): string {
  switch (result.status) {
    case 'updated':
      return formatUpdatedApplyMessage(result.reason);
    case 'already_present':
    case 'already_exists':
      return 'No changes: snippet already exists in template.';
    case 'no_op':
      return formatNoOpApplyMessage(result.reason);
    case 'validation_failed':
      return 'Template validation failed. Review the patch and try again.';
    default:
      return 'Apply finished.';
  }
}

function formatUpdatedApplyMessage(reason: string | null): string {
  if (reason === 'update_existing_source') {
    return 'Source SQL updated.';
  }

  if (reason === 'create_and_attach_source') {
    return 'Source created and attached to template.';
  }

  if (reason === 'attach_existing_source') {
    return 'Existing source attached to template.';
  }

  if (reason === 'replace_template_document') {
    return 'Template updated.';
  }

  if (reason === 'remove_source_only') {
    return 'Source removed from template sources.';
  }

  return 'Apply updated successfully.';
}

function formatNoOpApplyMessage(reason: string | null): string {
  if (reason === 'template_full_replace_no_changes') {
    return 'No changes: template is already up to date.';
  }

  return 'No changes were applied.';
}
