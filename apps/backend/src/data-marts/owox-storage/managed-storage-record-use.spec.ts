import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ManagedStorage } from '../entities/managed-storage.entity';
import { ManagedStorageService } from './managed-storage.service';

const NOW = new Date('2026-11-04T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('ManagedStorageService.recordUse', () => {
  let dataSource: DataSource;
  let service: ManagedStorageService;

  beforeAll(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [ManagedStorage],
      synchronize: true,
    }).initialize();
    service = new ManagedStorageService(dataSource.getRepository(ManagedStorage));
  });

  afterAll(() => dataSource.destroy());

  async function seed(
    storageId: string,
    lastActivityAt: Date | null,
    deprovisionedAt: Date | null = null
  ) {
    await service.create({
      storageId,
      projectId: `project-${storageId}`,
      engine: 'bigquery',
      gcpProjectId: 'gcp-1',
      location: 'US',
      datasetId: 'owox_aaaaaaaaaaaa',
      internalDatasetId: 'owox_aaaaaaaaaaaa_internal',
      serviceAccountEmail: 'sa@gcp-1.iam.gserviceaccount.com',
      storageLimitBytes: null,
      queryLimitBytesPerDay: null,
      notPaidSince: null,
      lastActivityAt,
      deprovisionedAt,
      deprovisionPending: false,
    });
  }

  const lastActivity = async (storageId: string) =>
    (await service.findByStorageId(storageId))?.lastActivityAt?.getTime();

  it('writes when there is no recorded use yet', async () => {
    await seed('null-use', null);

    await service.recordUse('null-use', NOW);

    expect(await lastActivity('null-use')).toBe(NOW.getTime());
  });

  it('writes when the recorded use is older than an hour', async () => {
    await seed('old-use', minutesAgo(61));

    await service.recordUse('old-use', NOW);

    expect(await lastActivity('old-use')).toBe(NOW.getTime());
  });

  it('does not write when the recorded use is newer than an hour', async () => {
    await seed('fresh-use', minutesAgo(30));

    await service.recordUse('fresh-use', NOW);

    expect(await lastActivity('fresh-use')).toBe(minutesAgo(30).getTime());
  });

  it('does not touch a deleted record', async () => {
    await seed('deleted', minutesAgo(600), minutesAgo(5));

    await service.recordUse('deleted', NOW);

    expect(await lastActivity('deleted')).toBe(minutesAgo(600).getTime());
  });

  it('matches nothing for an unknown storage id', async () => {
    await expect(service.recordUse('unknown', NOW)).resolves.toBeUndefined();
    expect(await service.findByStorageId('unknown')).toBeNull();
  });
});
