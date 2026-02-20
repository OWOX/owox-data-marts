import { Test, TestingModule } from '@nestjs/testing';
import { DataMartMapper } from './data-mart.mapper';
import { DataStorageMapper } from './data-storage.mapper';
import { ConnectorSecretService } from '../services/connector-secret.service';
import { DataMartRun as DataMartRunEntity } from '../entities/data-mart-run.entity';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';

describe('DataMartMapper', () => {
  let mapper: DataMartMapper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartMapper,
        {
          provide: DataStorageMapper,
          useValue: {},
        },
        {
          provide: ConnectorSecretService,
          useValue: {},
        },
      ],
    }).compile();

    mapper = module.get<DataMartMapper>(DataMartMapper);
  });

  describe('toBatchHealthStatusDomainResponse', () => {
    it('should map items and pick the latest report run if there are multiple', () => {
      const requestedIds = ['mart-1'];

      // Create a fake UserProjectionsListDto that doesn't actually need real data for this test
      const userProjections = new UserProjectionsListDto([]);

      const oldReportRun = {
        id: 'report-run-1',
        dataMartId: 'mart-1',
        type: DataMartRunType.EMAIL,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      } as DataMartRunEntity;

      const latestReportRun = {
        id: 'report-run-2',
        dataMartId: 'mart-1',
        type: DataMartRunType.SLACK,
        createdAt: new Date('2026-01-02T10:00:00Z'),
      } as DataMartRunEntity;

      const connectorRun = {
        id: 'connector-run-1',
        dataMartId: 'mart-1',
        type: DataMartRunType.CONNECTOR,
        createdAt: new Date('2026-01-02T12:00:00Z'),
      } as DataMartRunEntity;

      // The array has the latest report run first, which means if no date check existed,
      // the oldReportRun (which is at the end) would overwrite the latestReportRun.
      const latestRuns = [latestReportRun, connectorRun, oldReportRun];

      const result = mapper.toBatchHealthStatusDomainResponse(
        requestedIds,
        latestRuns,
        userProjections
      );

      expect(result.items).toHaveLength(1);

      const mappedItem = result.items[0];
      expect(mappedItem.dataMartId).toBe('mart-1');

      expect(mappedItem.connector).toBeDefined();
      expect(mappedItem.connector?.type).toBe(DataMartRunType.CONNECTOR);
      expect(mappedItem.connector?.id).toBe(connectorRun.id);

      // The report should exactly match the latestReportRun's date,
      // preventing oldReportRun from overwriting it.
      expect(mappedItem.report).toBeDefined();
      expect(mappedItem.report?.createdAt).toEqual(latestReportRun.createdAt);
      expect(mappedItem.report?.type).toEqual(latestReportRun.type);
      expect(mappedItem.report?.id).toEqual(latestReportRun.id);

      expect(mappedItem.insight).toBeNull();
    });
  });
});
