jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { LookerStudioReportRunService } from './looker-studio-report-run.service';

describe('LookerStudioReportRunService.finish', () => {
  it('records use of the Data Mart storage', async () => {
    const dataMartRun = { id: 'run-1' };
    const report = {
      id: 'report-1',
      lastRunStatus: 'SUCCESS',
      lastRunError: null,
      dataMart: { storage: { id: 'storage-1' } },
    };
    const dataMartRunService = { markReportRunAsFinished: jest.fn(), recordStorageUse: jest.fn() };
    const service = new LookerStudioReportRunService(
      { updateRunStatus: jest.fn() } as never,
      dataMartRunService as never
    );

    await service.finish({
      getReport: () => report,
      getDataMartRun: () => dataMartRun,
    } as never);

    expect(dataMartRunService.recordStorageUse).toHaveBeenCalledWith('storage-1', 'run-1');
  });

  it('records use after the run is persisted and still resolves when recording rejects', async () => {
    const order: string[] = [];
    const report = {
      id: 'report-1',
      lastRunStatus: 'SUCCESS',
      lastRunError: null,
      dataMart: { storage: { id: 'storage-1' } },
    };
    const dataMartRunService = {
      markReportRunAsFinished: jest.fn(async () => void order.push('persist')),
      recordStorageUse: jest.fn(async () => {
        order.push('record');
        throw new Error('deadlock');
      }),
    };
    const service = new LookerStudioReportRunService(
      { updateRunStatus: jest.fn() } as never,
      dataMartRunService as never
    );

    await expect(
      service.finish({
        getReport: () => report,
        getDataMartRun: () => ({ id: 'run-1' }),
      } as never)
    ).resolves.toBeUndefined();
    expect(order).toEqual(['persist', 'record']);
  });
});
