export const AI_ASSISTANT_APPLY_STATUS_VALUES = [
  'updated',
  'already_present',
  'no_op',
  'validation_failed',
] as const;

export type AiAssistantApplyStatus = (typeof AI_ASSISTANT_APPLY_STATUS_VALUES)[number];

export const AI_ASSISTANT_APPLY_LIFECYCLE_STATUS_VALUES = ['created', 'applied'] as const;
export type AiAssistantApplyLifecycleStatus =
  (typeof AI_ASSISTANT_APPLY_LIFECYCLE_STATUS_VALUES)[number];

export const AI_ASSISTANT_APPLY_ACTION_TYPE_VALUES = [
  'update_existing_source',
  'create_and_attach_source',
  'replace_template_document',
  'remove_source_from_template',
] as const;

export type ApplyAiAssistantActionType = (typeof AI_ASSISTANT_APPLY_ACTION_TYPE_VALUES)[number];
