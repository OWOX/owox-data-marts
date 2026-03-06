export function buildStorageRelatedRulesBlock(storageRelatedPrompt?: string | null): string {
  if (!storageRelatedPrompt) {
    return '';
  }

  return `

Storage-specific rules (MUST follow):
${storageRelatedPrompt}
`.trim();
}
