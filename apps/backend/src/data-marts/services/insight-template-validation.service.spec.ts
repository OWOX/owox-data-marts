import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { InsightTemplateValidationService } from './insight-template-validation.service';

describe('InsightTemplateValidationService', () => {
  const createService = () => {
    const insightArtifactService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };

    return new InsightTemplateValidationService(insightArtifactService as never);
  };

  it('throws when source is used in template', () => {
    const service = createService();

    expect(() =>
      service.ensureSourceKeyIsNotUsedInTemplate(
        '## Result\n{{table source="consumption_2025"}}',
        'consumption_2025'
      )
    ).toThrow('Cannot delete source "consumption_2025" because it is used in template');
  });

  it('throws when source is referenced through sourceKey', () => {
    const service = createService();

    expect(() =>
      service.ensureSourceKeyIsNotUsedInTemplate(
        "## Result\n{{value sourceKey='consumption_2025' path='.credits[1]'}}",
        'consumption_2025'
      )
    ).toThrow(BusinessViolationException);
  });

  it('does not throw when source is not used in template', () => {
    const service = createService();

    expect(() =>
      service.ensureSourceKeyIsNotUsedInTemplate(
        '## Result\n{{table source="main"}}',
        'consumption_2025'
      )
    ).not.toThrow();
  });
});
