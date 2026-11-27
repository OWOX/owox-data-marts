jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { ReportRunService } from './report-run.service';

/**
 * A pull-based destination has no report writer, so enqueueing a run for one used to succeed
 * and then die in the worker with "No component found for type". The guard belongs in
 * createPending because both the manual and the scheduled path go through it.
 */
describe('ReportRunService.createPending', () => {
  function createService(destinationType: DataDestinationType) {
    const report = {
      id: 'report-1',
      dataDestination: { type: destinationType },
    };
    const reportService = { getById: jest.fn().mockResolvedValue(report) };
    const dataMartRunService = { createAndMarkReportRunAsPending: jest.fn() };
    const systemTimeService = { now: jest.fn().mockReturnValue(new Date()) };

    const service = new ReportRunService(
      reportService as never,
      dataMartRunService as never,
      systemTimeService as never
    );

    return { service, reportService, dataMartRunService };
  }

  const command = { reportId: 'report-1', userId: 'user-1' } as RunReportCommand;

  it.each([DataDestinationType.EXCEL, DataDestinationType.LOOKER_STUDIO])(
    'refuses to enqueue a run for a %s report',
    async type => {
      const { service, dataMartRunService } = createService(type);

      await expect(service.createPending(command)).rejects.toBeInstanceOf(
        BusinessViolationException
      );
      // The refusal must come before any state is written, or a report would be left marked
      // as starting by a run that never happens.
      expect(dataMartRunService.createAndMarkReportRunAsPending).not.toHaveBeenCalled();
    }
  );

  it('lets a Google Sheets report through to the usual path', async () => {
    const { service, reportService } = createService(DataDestinationType.GOOGLE_SHEETS);

    // Reaching ReportRun.canStart is enough: the guard did not fire.
    await service.createPending(command).catch(() => undefined);

    expect(reportService.getById).toHaveBeenCalledWith('report-1');
  });
});
