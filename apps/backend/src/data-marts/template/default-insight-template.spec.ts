import {
  DEFAULT_INSIGHT_TEMPLATE,
  DEFAULT_INSIGHT_TEMPLATE_HEADING,
  isDefaultInsightTemplate,
} from './default-insight-template';
import { DEFAULT_SOURCE_KEY } from '../../common/template/handlers/tag-handler.interface';

describe('default-insight-template', () => {
  it('uses compact default table tag without explicit source', () => {
    expect(DEFAULT_INSIGHT_TEMPLATE).toBe(`### ${DEFAULT_INSIGHT_TEMPLATE_HEADING}\n{{table}}`);
  });

  it('treats compact default template as default', () => {
    expect(isDefaultInsightTemplate(DEFAULT_INSIGHT_TEMPLATE)).toBe(true);
  });

  it('full legacy default template with source="main" as default', () => {
    const fullTemplate = `### ${DEFAULT_INSIGHT_TEMPLATE_HEADING}\n{{table source="${DEFAULT_SOURCE_KEY}"}}`;

    expect(isDefaultInsightTemplate(fullTemplate)).toBe(true);
  });

  it('returns false for non-default template', () => {
    const customTemplate = `### ${DEFAULT_INSIGHT_TEMPLATE_HEADING}\n{{table source="sales_2025"}}`;

    expect(isDefaultInsightTemplate(customTemplate)).toBe(false);
  });
});
