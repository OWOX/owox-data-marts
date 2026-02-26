import type { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';

export type AiAssistantScope = 'template';
export type AiAssistantAssistantMessageRole = 'user' | 'assistant' | 'system';
export type AiAssistantMessageApplyStatus = 'none' | 'pending' | 'applied';
export type AiAssistantExecutionMode = 'lightweight' | 'heavy';
export type TurnPromptType = 'template_edit' | 'explain_or_status' | 'source_task';
export type AssistantTaskMode = 'new_task' | 'refine_existing' | 'ambiguous_mode';

export type AssistantOrchestratorRoute =
  | 'full_generation'
  | 'refine_existing_sql'
  | 'explain_or_status'
  | 'clarify'
  | 'reuse_existing_source'
  | 'refine_existing_source_sql'
  | 'create_new_source_sql'
  | 'edit_template_text';
export type AgentFlowDecision = 'explain' | 'clarify' | 'edit_template' | 'propose_action';
export type AssistantOrchestratorDecision = AssistantOrchestratorRoute | AgentFlowDecision;
export type AssistantOrchestratorStatus =
  | 'ok'
  | 'not_relevant'
  | 'cannot_answer'
  | 'high_ambiguity'
  | 'restricted'
  | 'error';
export type AssistantSnippetType = 'table' | 'single_value';
export type AiAssistantApplyStatus =
  | 'updated'
  | 'already_present'
  | 'already_exists'
  | 'no_op'
  | 'validation_failed';

export interface AssistantOrchestratorResult {
  sqlCandidate?: string;
  dryRun?: {
    isValid: boolean;
    error?: string;
    bytes?: number;
  };
  repairAttempts?: number;
}

export interface AssistantProposedActionAttach {
  type: 'attach_source_to_template';
  id: string;
  confidence: number;
  payload: {
    suggestedSourceKey: string;
    targetArtifactId?: string;
    insertTag?: boolean;
    suggestedArtifactTitle?: string;
    suggestedTemplateSnippet?: string;
    text?: string;
    tags?: TemplateEditPlaceholderTagDto[];
    suggestedTemplateEditDiffPreview?: string;
  };
}

export interface AssistantProposedActionApply {
  type: 'apply_sql_to_artifact';
  id: string;
  confidence: number;
  payload: {
    artifactId?: string;
    suggestedArtifactTitle?: string;
    text?: string;
    tags?: TemplateEditPlaceholderTagDto[];
    suggestedTemplateEditDiffPreview?: string;
  };
}

export interface AssistantProposedActionApplyChangesToSource {
  type: 'apply_changes_to_source';
  id: string;
  confidence: number;
  payload: {
    sourceId?: string;
    sourceKey?: string;
    artifactId?: string;
    suggestedArtifactTitle?: string;
    text?: string;
    tags?: TemplateEditPlaceholderTagDto[];
    suggestedTemplateEditDiffPreview?: string;
  };
}

export interface AssistantProposedActionCreateSourceAndAttach {
  type: 'create_source_and_attach';
  id: string;
  confidence: number;
  payload: {
    suggestedSourceKey?: string;
    suggestedArtifactTitle?: string;
    suggestedTemplateSnippet?: string;
    text?: string;
    tags?: TemplateEditPlaceholderTagDto[];
    suggestedTemplateEditDiffPreview?: string;
  };
}

export interface TemplateEditPlaceholderTagDto {
  id: string;
  name: 'table' | 'value';
  params: Record<string, unknown>;
}

export interface AssistantProposedActionReplaceTemplateDocument {
  type: 'replace_template_document';
  id: string;
  confidence: number;
  payload: {
    text: string;
    tags: TemplateEditPlaceholderTagDto[];
    suggestedTemplateEditDiffPreview?: string;
  };
}

export interface AssistantProposedActionRemoveSourceFromTemplate {
  type: 'remove_source_from_template';
  id: string;
  confidence: number;
  payload: {
    sourceKey: string;
    suggestedTemplateEditDiffPreview?: string;
  };
}

export interface AssistantProposedActionReuseSourceWithoutChanges {
  type: 'reuse_source_without_changes';
  id: string;
  confidence: number;
  payload: {
    sourceId?: string;
    sourceKey?: string;
    artifactId?: string;
    text?: string;
    tags?: TemplateEditPlaceholderTagDto[];
    suggestedTemplateEditDiffPreview?: string;
  };
}

export type AssistantProposedAction =
  | AssistantProposedActionAttach
  | AssistantProposedActionApply
  | AssistantProposedActionApplyChangesToSource
  | AssistantProposedActionCreateSourceAndAttach
  | AssistantProposedActionReplaceTemplateDocument
  | AssistantProposedActionRemoveSourceFromTemplate
  | AssistantProposedActionReuseSourceWithoutChanges;

export interface AssistantResolvedContext {
  targetSourceKey?: string;
  targetArtifactId?: string;
  targetKind?: 'TABLE' | 'VALUE';
  contextResolution?:
    | 'explicit_key'
    | 'inferred_key'
    | 'inferred_unlinked_artifact'
    | 'none'
    | 'ambiguous_implicit'
    | 'explicit_not_found';
}

export interface AssistantMatchDebug {
  promptType?: TurnPromptType;
  sourceTaskMode?: AssistantTaskMode;
  decisionPath?: string;
  decisionNodes?: Record<string, unknown>;
  matchedSourceId?: string;
  matchConfidence?: number;
  matchReason?: string;
}

export interface AssistantRouteTraceCandidateOutcome {
  stage?: 'linked_source_resolver' | 'unlinked_artifact_resolver';
  sourceKey?: string;
  artifactId?: string | null;
  confidence?: number;
  reason?: string;
}

export interface AssistantRouteTraceMeta {
  route?: AssistantOrchestratorRoute;
  finalRoute?: AssistantOrchestratorRoute;
  reasonDescription?: string;
  promptType?: TurnPromptType;
  sourceTaskMode?: AssistantTaskMode;
  path?: string;
  nodeDecisions?: Record<string, unknown>;
  decisionTraceId?: string;
  resolvedContext?: AssistantResolvedContext;
  matchConfidence?: number;
  matchReason?: string;
  candidateOutcomes?: AssistantRouteTraceCandidateOutcome[];
}

export interface AssistantOrchestratorResponse {
  status: AssistantOrchestratorStatus;
  decision: AssistantOrchestratorDecision;
  result?: AssistantOrchestratorResult;
  proposedActions?: AssistantProposedAction[];
  resolvedContext?: AssistantResolvedContext;
  debug?: AssistantMatchDebug;
  explanation?: string;
  meta?: {
    lastUserMessage?: string;
    sanitizedLastUserMessage?: string | null;
    reasonDescription?: string;
    routeTrace?: AssistantRouteTraceMeta;
    finalRoute?: AssistantOrchestratorRoute;
    path?: string;
    nodeDecisions?: Record<string, unknown>;
    decisionTraceId?: string;
    candidateOutcomes?: AssistantRouteTraceCandidateOutcome[];
    telemetry?: unknown;
    diagnostics?: {
      warnings?: string[];
      assumptions?: string[];
    };
  };
}

export interface AiAssistantMessageDto {
  id: string;
  sessionId: string;
  role: AiAssistantAssistantMessageRole;
  content: string;
  proposedActions?: AssistantProposedAction[] | null;
  sqlCandidate?: string | null;
  applyStatus: AiAssistantMessageApplyStatus;
  appliedAt?: string | null;
  appliedRequestId?: string | null;
  createdAt: string;
}

export interface AiAssistantSessionDto {
  id: string;
  dataMartId: string;
  scope: AiAssistantScope;
  title?: string | null;
  templateId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  messages: AiAssistantMessageDto[];
}

export interface AiAssistantSessionListItemDto {
  id: string;
  dataMartId: string;
  scope: AiAssistantScope;
  title?: string | null;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiAssistantSessionRequestDto {
  scope: AiAssistantScope;
  templateId?: string;
}

export interface CreateAiAssistantSessionResponseDto {
  sessionId: string;
}

export interface ListAiAssistantSessionsRequestDto {
  scope: AiAssistantScope;
  templateId?: string;
  limit?: number;
  offset?: number;
}

export interface CreateAiAssistantMessageRequestDto {
  text: string;
  correlationId?: string;
  turnContext?: {
    sourceKeyHint?: string;
    artifactIdHint?: string;
    preferredSnippetType?: AssistantSnippetType;
  };
}

export interface CreateAiAssistantMessageResponseDto {
  mode: AiAssistantExecutionMode;
  triggerId?: string | null;
  response?: AssistantOrchestratorResponse | null;
  userMessage: AiAssistantMessageDto;
  assistantMessage?: AiAssistantMessageDto | null;
}

export interface AiRunTriggerStatusResponseDto {
  status: TaskStatus;
}

export type AiRunTriggerResponseDto =
  | {
      runId: string;
      response: AssistantOrchestratorResponse;
      assistantMessageId: string | null;
    }
  | { error: string };

export interface ApplyAiAssistantSessionRequestDto {
  requestId: string;
  assistantMessageId: string;
  sql?: string;
  artifactTitle?: string;
}

export interface ApplyAiAssistantSessionResponseDto {
  requestId: string;
  artifactId: string | null;
  artifactTitle: string | null;
  templateUpdated: boolean;
  templateId: string | null;
  sourceKey: string | null;
  status: AiAssistantApplyStatus;
  reason: string | null;
}

export interface UpdateAiAssistantSessionTitleRequestDto {
  title: string;
}
