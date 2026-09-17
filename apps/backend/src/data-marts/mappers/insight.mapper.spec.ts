import { Test, TestingModule } from '@nestjs/testing';
import { DataMartRun as DataMartRunEntity } from '../entities/data-mart-run.entity';
import { Insight } from '../entities/insight.entity';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { DataMartMapper } from './data-mart.mapper';
import { DataStorageMapper } from './data-storage.mapper';
import { InsightMapper } from './insight.mapper';

describe('InsightMapper', () => {
  describe('masking of a custom connector definition on the last manual run', () => {
    // An insight's last manual run snapshots `dataMart.definition`, so for a
    // connector-backed Data Mart it carries a connector definition. A CUSTOM connector's
    // specification lives in the project, not in the bundle, so it only resolves when the
    // request's project id reaches ConnectorSecretService.mask. Without it the mask fails
    // closed and replaces EVERY configuration value with `**********` — dates, account ids
    // and node params alike — plus logs a warning per call. The stub reproduces that split.
    const OVER_MASKED = { overMasked: true };

    const definitionRun = {
      connector: {
        source: {
          name: 'MyCustomConnector',
          version: 3,
          node: 'campaigns',
          fields: ['id'],
          configuration: [{ _id: 'cfg-1', AccountId: '12345', StartDate: '2026-01-01' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };

    const createMapper = async () => {
      const mask = jest.fn(async (projectId: string | undefined, definition: unknown) =>
        projectId === undefined ? OVER_MASKED : definition
      );
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InsightMapper,
          DataMartMapper,
          {
            provide: DataStorageMapper,
            useValue: {
              toDomainDto: jest.fn().mockReturnValue({}),
              toApiResponse: jest.fn().mockResolvedValue({}),
            },
          },
          { provide: ConnectorSecretService, useValue: { mask } },
        ],
      }).compile();

      return { mapper: module.get<InsightMapper>(InsightMapper), mask };
    };

    const runEntity = () =>
      ({
        id: 'run-1',
        status: 'SUCCESS',
        type: DataMartRunType.CONNECTOR,
        runType: 'manual',
        dataMartId: 'dm-1',
        definitionRun,
        createdAt: new Date('2026-08-01T00:00:00Z'),
      }) as unknown as DataMartRunEntity;

    const insightEntity = () =>
      ({
        id: 'insight-1',
        title: 'Weekly spend',
        template: null,
        output: null,
        createdById: 'user-1',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        modifiedAt: new Date('2026-08-01T00:00:00Z'),
      }) as unknown as Insight;

    it('resolves the run definition specification within the requesting project', async () => {
      const { mapper, mask } = await createMapper();

      const response = await mapper.toResponse(
        mapper.toDomainDto(insightEntity(), runEntity()),
        'proj-1'
      );

      expect(mask).toHaveBeenCalledWith('proj-1', definitionRun);
      expect(mask).not.toHaveBeenCalledWith(undefined, expect.anything());
      // Non-secret configuration survives, exactly as it does on GET /data-marts/:id.
      expect(response.lastManualDataMartRun?.definitionRun).toBe(definitionRun);
    });

    it('does not reach the masking path when there is no last manual run', async () => {
      const { mapper, mask } = await createMapper();

      const response = await mapper.toResponse(mapper.toDomainDto(insightEntity(), null), 'proj-1');

      expect(response.lastManualDataMartRun).toBeNull();
      expect(mask).not.toHaveBeenCalled();
    });
  });
});
