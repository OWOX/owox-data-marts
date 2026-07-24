// connector-run.service.spec.ts
jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { Repository } from 'typeorm';
import { ConnectorRunService } from './connector-run.service';
import { ConnectorRunTriggerService } from './connector-run-trigger.service';
import { ConnectorExecutorService } from './connector-executor.service';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { RunType } from '../../../common/scheduler/shared/types';

describe('ConnectorRunService', () => {
  const createService = () => {
    const dataMartRunRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockImplementation(data => Promise.resolve({ ...data, id: 'run-1' })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<DataMartRun>;

    const connectorRunTriggerService = {
      createTrigger: jest.fn().mockResolvedValue('trigger-1'),
    } as unknown as ConnectorRunTriggerService;

    const connectorExecutorService = {
      executeInBackground: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConnectorExecutorService;

    const service = new ConnectorRunService(
      dataMartRunRepository,
      connectorRunTriggerService,
      connectorExecutorService
    );

    return {
      service,
      dataMartRunRepository,
      connectorRunTriggerService,
      connectorExecutorService,
    };
  };

  const publishedConnectorDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definitionType: DataMartDefinitionType.CONNECTOR,
    status: DataMartStatus.PUBLISHED,
    definition: {},
  } as unknown as DataMart;

  describe('run', () => {
    it('creates run and trigger successfully', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue(null); // not running

      const result = await service.run(publishedConnectorDataMart, 'user-1', RunType.manual);

      expect(result).toBe('run-1');
      expect(dataMartRunRepository.save).toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalled();
    });

    it('throws when dataMart is not CONNECTOR type', async () => {
      const { service } = createService();
      const dm = {
        ...publishedConnectorDataMart,
        definitionType: DataMartDefinitionType.SQL,
      } as unknown as DataMart;

      await expect(service.run(dm, 'user-1', RunType.manual)).rejects.toThrow(
        'DataMart is not a connector type'
      );
    });

    it('throws when dataMart is not PUBLISHED', async () => {
      const { service } = createService();
      const dm = {
        ...publishedConnectorDataMart,
        status: DataMartStatus.DRAFT,
      } as unknown as DataMart;

      await expect(service.run(dm, 'user-1', RunType.manual)).rejects.toThrow(
        'DataMart is not published'
      );
    });

    it('throws when connector is already running', async () => {
      const { service, dataMartRunRepository } = createService();
      (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue({ id: 'existing-run' });

      await expect(
        service.run(publishedConnectorDataMart, 'user-1', RunType.manual)
      ).rejects.toThrow('Connector is already running');
    });
  });

  describe('executeExistingRun', () => {
    it('delegates to executor', async () => {
      const { service, connectorExecutorService } = createService();
      const dm = publishedConnectorDataMart;
      const run = { id: 'run-1' } as DataMartRun;

      await service.executeExistingRun(dm, run, null);

      expect(connectorExecutorService.executeInBackground).toHaveBeenCalledWith(
        dm,
        run,
        null,
        undefined
      );
    });
  });

  describe('executeInterruptedRuns', () => {
    it('does nothing when no interrupted runs', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([]);

      await service.executeInterruptedRuns();

      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it('creates triggers for interrupted runs', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([
        {
          id: 'run-1',
          dataMartId: 'dm-1',
          type: DataMartRunType.CONNECTOR,
          dataMart: { projectId: 'proj-1' },
          createdById: 'user-1',
          runType: RunType.manual,
          additionalParams: null,
        },
      ]);

      await service.executeInterruptedRuns();

      expect(dataMartRunRepository.update).toHaveBeenCalledWith(
        { id: 'run-1', status: DataMartRunStatus.INTERRUPTED },
        { status: DataMartRunStatus.PENDING }
      );
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalled();
    });

    it('skips resumption when run is no longer INTERRUPTED (e.g. already cancelled)', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([
        {
          id: 'run-1',
          dataMartId: 'dm-1',
          type: DataMartRunType.CONNECTOR,
          dataMart: { projectId: 'proj-1' },
          createdById: 'user-1',
          runType: RunType.manual,
          additionalParams: null,
        },
      ]);
      (dataMartRunRepository.update as jest.Mock).mockResolvedValue({ affected: 0 });

      await service.executeInterruptedRuns();

      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });
  });
});
