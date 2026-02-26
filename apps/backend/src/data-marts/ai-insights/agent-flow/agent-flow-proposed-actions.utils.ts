import { randomUUID } from 'crypto';
import { AssistantProposedAction } from './ai-assistant-types';
import type { AgentFlowTemplateEditIntent } from './types';

interface ResolveAgentFlowProposedActionsInput {
  resultProposedActions?: AssistantProposedAction[];
  contextProposedActions?: AssistantProposedAction[];
  templateEditIntent?: AgentFlowTemplateEditIntent;
}

/**
 * Source of truth for action selection in AgentFlow:
 * - Prefer explicit actions returned in final model JSON.
 * - Fallback to legacy actions collected by tools in context.
 */
export function resolveAgentFlowProposedActions(
  input: ResolveAgentFlowProposedActionsInput
): AssistantProposedAction[] {
  const selected =
    input.resultProposedActions && input.resultProposedActions.length > 0
      ? input.resultProposedActions
      : (input.contextProposedActions ?? []);

  return withMergedTemplateEditIntent(selected, {
    templateEditIntent: input.templateEditIntent,
  });
}

function withMergedTemplateEditIntent(
  selected: AssistantProposedAction[],
  input: Pick<ResolveAgentFlowProposedActionsInput, 'templateEditIntent'>
): AssistantProposedAction[] {
  if (!input.templateEditIntent) {
    return selected;
  }

  const withoutStandaloneTemplateEdit = selected.filter(
    action => action.type !== 'replace_template_document'
  );
  const sourceActionIndex = withoutStandaloneTemplateEdit.findIndex(isSourceActionForTemplateMerge);
  if (sourceActionIndex < 0) {
    return [
      ...withoutStandaloneTemplateEdit,
      buildReplaceTemplateDocumentProposedAction(input.templateEditIntent),
    ];
  }

  const merged = [...withoutStandaloneTemplateEdit];
  merged[sourceActionIndex] = mergeTemplateEditIntentIntoSourceAction(
    merged[sourceActionIndex] as AssistantProposedAction,
    input.templateEditIntent
  ) as (typeof merged)[number];
  return merged;
}

function isSourceActionForTemplateMerge(action: AssistantProposedAction): boolean {
  return (
    action.type === 'create_source_and_attach' ||
    action.type === 'attach_source_to_template' ||
    action.type === 'apply_changes_to_source' ||
    action.type === 'apply_sql_to_artifact' ||
    action.type === 'reuse_source_without_changes'
  );
}

function mergeTemplateEditIntentIntoSourceAction(
  action: AssistantProposedAction,
  intent: AgentFlowTemplateEditIntent
): AssistantProposedAction {
  if (!isSourceActionForTemplateMerge(action)) {
    return action;
  }

  const templateEditPayload = {
    text: intent.text,
    tags: intent.tags,
  };

  return {
    ...action,
    payload: {
      ...action.payload,
      ...templateEditPayload,
    },
  } as AssistantProposedAction;
}

function buildReplaceTemplateDocumentProposedAction(
  intent: AgentFlowTemplateEditIntent
): AssistantProposedAction {
  return {
    type: 'replace_template_document',
    id: `act_${randomUUID().replace(/-/g, '')}`,
    confidence: 0.95,
    payload: {
      text: intent.text,
      tags: intent.tags,
    },
  };
}
