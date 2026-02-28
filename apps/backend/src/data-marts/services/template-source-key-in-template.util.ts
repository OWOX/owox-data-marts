export function findTemplateTagBySourceKey(templateText: string, sourceKey: string): string | null {
  const template = templateText.trim();
  if (!template.length) {
    return null;
  }

  const tagMatch = template.match(
    new RegExp(`\\{\\{[^}]*\\b(?:source|sourceKey)=["']${escapeRegex(sourceKey)}["'][^}]*\\}\\}`)
  );
  return tagMatch?.[0] ?? null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
