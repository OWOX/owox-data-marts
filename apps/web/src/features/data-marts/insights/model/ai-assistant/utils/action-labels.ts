export const ACTION_LABELS = {
  applyChanges: 'Apply changes to source',
  createAndAttach: 'Create source and attach',
  reuseSource: 'Reuse source',
  applyTemplateEdit: 'Apply template changes',
} as const;

export type ActionLabelKey = keyof typeof ACTION_LABELS;
