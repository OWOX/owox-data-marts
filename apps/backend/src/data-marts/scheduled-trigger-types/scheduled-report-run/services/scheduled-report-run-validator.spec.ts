import { DataDestinationType } from '../../../data-destination-types/enums/data-destination-type.enum';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import { ScheduledReportRunValidator } from './scheduled-report-run-validator';

/**
 * Hiding the schedule UI is not enough: the API accepts a trigger on its own, and a trigger on a
 * pull-based report would fail on every fire because no one can start such a run.
 */
describe('ScheduledReportRunValidator', () => {
  function validatorFor(destinationType: DataDestinationType) {
    const reportService = {
      getByIdAndDataMartIdAndProjectId: jest.fn().mockResolvedValue({
        id: 'report-1',
        dataDestination: { type: destinationType },
      }),
    };
    return new ScheduledReportRunValidator(reportService as never);
  }

  const trigger = {
    type: ScheduledTriggerType.REPORT_RUN,
    triggerConfig: { type: 'scheduled-report-run-config', reportId: 'report-1' },
    dataMart: { id: 'dm-1', projectId: 'project-1' },
  } as unknown as DataMartScheduledTrigger;

  it.each([DataDestinationType.EXCEL, DataDestinationType.LOOKER_STUDIO])(
    'refuses a schedule on a %s report',
    async type => {
      const result = await validatorFor(type).validate(trigger);

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toContain('cannot be scheduled');
    }
  );

  it('allows a schedule on a report the server writes', async () => {
    const result = await validatorFor(DataDestinationType.GOOGLE_SHEETS).validate(trigger);

    expect(result.valid).toBe(true);
  });
});
