const DEFAULT_TEMPLATE_HEADING_MARKER = '###';

export const DEFAULT_INSIGHT_TEMPLATE_HEADING = 'Data Mart';
export const DEFAULT_INSIGHT_TEMPLATE_SOURCE_KEY = 'main';
export const DEFAULT_INSIGHT_TEMPLATE = [
  `${DEFAULT_TEMPLATE_HEADING_MARKER} ${DEFAULT_INSIGHT_TEMPLATE_HEADING}`,
  `{{table source="${DEFAULT_INSIGHT_TEMPLATE_SOURCE_KEY}"}}`,
].join('\n');

export function isDefaultInsightTemplate(template?: string | null): boolean {
  return (
    normalizeTemplateForComparison(template) ===
    normalizeTemplateForComparison(DEFAULT_INSIGHT_TEMPLATE)
  );
}

function normalizeTemplateForComparison(template?: string | null): string {
  return (template ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}
