import { DEFAULT_SOURCE_KEY } from '../../common/template/handlers/tag-handler.interface';

const DEFAULT_TEMPLATE_HEADING_MARKER = '###';

export const DEFAULT_INSIGHT_TEMPLATE_HEADING = 'Data Mart';
export const DEFAULT_INSIGHT_TEMPLATE = [
  `${DEFAULT_TEMPLATE_HEADING_MARKER} ${DEFAULT_INSIGHT_TEMPLATE_HEADING}`,
  '{{table}}',
].join('\n');

const FULL_DEFAULT_INSIGHT_TEMPLATE = [
  `${DEFAULT_TEMPLATE_HEADING_MARKER} ${DEFAULT_INSIGHT_TEMPLATE_HEADING}`,
  `{{table source="${DEFAULT_SOURCE_KEY}"}}`,
].join('\n');

const DEFAULT_INSIGHT_TEMPLATE_VARIANTS = new Set(
  [DEFAULT_INSIGHT_TEMPLATE, FULL_DEFAULT_INSIGHT_TEMPLATE].map(normalizeTemplateForComparison)
);

export function isDefaultInsightTemplate(template?: string | null): boolean {
  return DEFAULT_INSIGHT_TEMPLATE_VARIANTS.has(normalizeTemplateForComparison(template));
}

function normalizeTemplateForComparison(template?: string | null): string {
  return (template ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}
