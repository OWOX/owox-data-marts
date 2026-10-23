import 'reflect-metadata';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DuckDbLoadHoldException, holdBehindDuckDbLoads } from './count-running-storage-runs';

describe('holdBehindDuckDbLoads', () => {
  let dataSource: DataSource;
  let storageId: string;
  let otherStorageId: string;
  let report: DataMartRun;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [path.join(__dirname, '../entities/*.entity.ts')],
      synchronize: true,
    });
    await dataSource.initialize();
  }, 30_000);

  afterAll(() => dataSource.destroy());

  async function saveStorage(): Promise<string> {
    const storage = await dataSource.getRepository(DataStorage).save({
      type: DataStorageType.DUCKDB,
      projectId: 'p1',
    });
    return storage.id;
  }

  async function saveRun(
    onStorage: string,
    type: DataMartRunType,
    status: DataMartRunStatus,
    createdAt: Date
  ): Promise<DataMartRun> {
    const dataMart = await dataSource.getRepository(DataMart).save({
      title: 'dm',
      projectId: 'p1',
      createdById: 'u1',
      storage: { id: onStorage },
    });
    const runs = dataSource.getRepository(DataMartRun);
    const run = await runs.save({ dataMartId: dataMart.id, type, status, runType: 'manual' });
    await runs.update(run.id, { createdAt });
    return runs.findOneByOrFail({ id: run.id });
  }

  async function saveTrigger(run: DataMartRun, isActive = true): Promise<void> {
    await dataSource.getRepository(ConnectorRunTrigger).save({
      isActive,
      status: TriggerStatus.IDLE,
      dataMartId: run.dataMartId,
      projectId: 'p1',
      createdById: 'u1',
      dataMartRunId: run.id,
      runType: 'manual',
    });
  }

  const at = (minute: number) => new Date(Date.UTC(2026, 9, 23, 10, minute));
  const hold = () => holdBehindDuckDbLoads(dataSource.manager, storageId, report);

  beforeEach(async () => {
    storageId = await saveStorage();
    otherStorageId = await saveStorage();
    report = await saveRun(
      storageId,
      DataMartRunType.GOOGLE_SHEETS_EXPORT,
      DataMartRunStatus.PENDING,
      at(10)
    );
  });

  it('holds while a load runs on the storage', async () => {
    await saveRun(storageId, DataMartRunType.CONNECTOR, DataMartRunStatus.RUNNING, at(20));

    await expect(hold()).rejects.toThrow(
      new DuckDbLoadHoldException(`DuckDB storage ${storageId} has a load in progress`)
    );
  });

  it('holds while an older load with a live trigger waits for the storage', async () => {
    await saveTrigger(
      await saveRun(storageId, DataMartRunType.CONNECTOR, DataMartRunStatus.PENDING, at(5))
    );

    const holding = hold();
    await expect(holding).rejects.toBeInstanceOf(DuckDbLoadHoldException);
    await expect(holding).rejects.toThrow(`DuckDB storage ${storageId} has an older load waiting`);
  });

  it.each([
    ['no trigger', undefined],
    ['an inactive trigger', false],
  ])('does not hold for an older waiting load with %s', async (_, isActive) => {
    const load = await saveRun(
      storageId,
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.PENDING,
      at(5)
    );
    if (isActive !== undefined) await saveTrigger(load, isActive);

    await expect(hold()).resolves.toBeUndefined();
  });

  it('does not hold for a newer waiting load', async () => {
    await saveTrigger(
      await saveRun(storageId, DataMartRunType.CONNECTOR, DataMartRunStatus.PENDING, at(15))
    );

    await expect(hold()).resolves.toBeUndefined();
  });

  it('does not hold for a load on another storage', async () => {
    await saveRun(otherStorageId, DataMartRunType.CONNECTOR, DataMartRunStatus.RUNNING, at(5));
    await saveTrigger(
      await saveRun(otherStorageId, DataMartRunType.CONNECTOR, DataMartRunStatus.PENDING, at(5))
    );

    await expect(hold()).resolves.toBeUndefined();
  });
});
