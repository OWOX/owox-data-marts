import { describe, expect, it } from 'vitest';
import { TemplateSourceTypeEnum } from '../../../shared';
import { ReportConditionEnum } from '../../../shared/enums/report-condition.enum';
import { EmailReportEditFormSchema } from '../useEmailReportForm';

function buildPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Report: Revenue Overview',
    dataDestinationId: 'destination-1',
    reportCondition: ReportConditionEnum.ALWAYS,
    subject: 'Report: Revenue Overview',
    messageTemplate: '## Summary',
    insightTemplateId: undefined,
    templateSourceType: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
    ...overrides,
  };
}

describe('EmailReportEditFormSchema', () => {
  it('rejects blank custom messages', () => {
    const result = EmailReportEditFormSchema.safeParse(buildPayload({ messageTemplate: '   ' }));

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.messageTemplate).toEqual(['Message is required']);
  });

  it('requires an insight for insight-based templates', () => {
    const result = EmailReportEditFormSchema.safeParse(
      buildPayload({
        templateSourceType: TemplateSourceTypeEnum.INSIGHT_TEMPLATE,
        messageTemplate: '',
        insightTemplateId: '',
      })
    );

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.insightTemplateId).toEqual(['Insight is required']);
  });

  it('trims title and subject values', () => {
    const result = EmailReportEditFormSchema.safeParse(
      buildPayload({
        title: '  Report: Revenue Overview  ',
        subject: '  Report: Revenue Overview  ',
      })
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.title).toBe('Report: Revenue Overview');
    expect(result.data.subject).toBe('Report: Revenue Overview');
  });
});
