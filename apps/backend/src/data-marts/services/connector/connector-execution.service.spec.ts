import { ConnectorExecutionService } from './connector-execution.service';
import { ConnectorRunService } from './connector-run.service';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';

describe('ConnectorExecutionService (facade)', () => {
  const createService = () => {
    const connectorRunService = {
      run: jest.fn().mockResolvedValue('run-1'),
      cancelRun: jest.fn().mockResolvedValue(undefined),
      executeExistingRun: jest.fn().mockResolvedValue(undefined),
      executeInterruptedRuns: jest.fn().mockResolvedValue(undefined),
      getDataMartConnectorRunsByStatus: jest.fn().mockResolvedValue([]),
    } as unknown as ConnectorRunService;

    const service = new ConnectorExecutionService(connectorRunService);

    return { service, connectorRunService };
  };

  it('delegates run to ConnectorRunService', async () => {
    const { service, connectorRunService } = createService();
    const dm = {} as DataMart;

    const result = await service.run(dm, 'user-1', 'MANUAL' as unknown as never, {});

    expect(result).toBe('run-1');
    expect(connectorRunService.run).toHaveBeenCalledWith(dm, 'user-1', 'MANUAL', {});
  });

  it('delegates cancelRun to ConnectorRunService', async () => {
    const { service, connectorRunService } = createService();

    await service.cancelRun('dm-1', 'run-1');

    expect(connectorRunService.cancelRun).toHaveBeenCalledWith('dm-1', 'run-1');
  });

  it('delegates executeExistingRun to ConnectorRunService', async () => {
    const { service, connectorRunService } = createService();
    const dm = {} as DataMart;
    const run = {} as DataMartRun;

    await service.executeExistingRun(dm, run, null);

    expect(connectorRunService.executeExistingRun).toHaveBeenCalledWith(dm, run, null, undefined);
  });

  it('delegates executeInterruptedRuns to ConnectorRunService', async () => {
    const { service, connectorRunService } = createService();

    await service.executeInterruptedRuns();

    expect(connectorRunService.executeInterruptedRuns).toHaveBeenCalled();
  });

  it('delegates getDataMartConnectorRunsByStatus to ConnectorRunService', async () => {
    const { service, connectorRunService } = createService();

    await service.getDataMartConnectorRunsByStatus(DataMartRunStatus.INTERRUPTED);

    expect(connectorRunService.getDataMartConnectorRunsByStatus).toHaveBeenCalledWith(
      DataMartRunStatus.INTERRUPTED
    );
  });
});
