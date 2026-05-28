import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';

import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionType } from '../src/data-marts/enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../src/data-marts/enums/data-mart-status.enum';

const PROJECT_ID = '0';
const USER_ID = '0';
const DATA_MART_COUNT = 1200;
const NEEDLE_TITLE = 'Needle Last Data Mart';

interface DataMartListItemResponse {
  id: string;
  title: string;
}

interface PaginatedDataMartsResponse {
  items: DataMartListItemResponse[];
  total: number;
  nextOffset: number | null;
}

describe('Data mart pagination', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataSource: DataSource;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    dataSource = app.get(DataSource);

    await seedDataMartsWithJoinFanOut(dataSource);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('loads every data mart when joined list rows fan out across pages', async () => {
    const loadedItems: DataMartListItemResponse[] = [];
    let offset: number | null = 0;

    while (offset !== null) {
      const response = await agent
        .get('/api/data-marts')
        .query(offset === 0 ? {} : { offset })
        .set(AUTH_HEADER);

      expect(response.status).toBe(200);

      const page = response.body as PaginatedDataMartsResponse;
      loadedItems.push(...page.items);
      offset = page.nextOffset;
    }

    const loadedIds = new Set(loadedItems.map(item => item.id));
    expect(loadedIds.size).toBe(DATA_MART_COUNT);
    expect(loadedItems).toHaveLength(DATA_MART_COUNT);
    expect(loadedItems.map(item => item.title)).toContain(NEEDLE_TITLE);
    expect(loadedItems.at(-1)?.title).toBe(NEEDLE_TITLE);
  });
});

async function seedDataMartsWithJoinFanOut(dataSource: DataSource): Promise<void> {
  const storageId = randomUUID();
  const now = new Date('2026-01-01T00:00:00.000Z');

  await dataSource.transaction(async manager => {
    await manager.query(
      `INSERT INTO data_storage
         (id, type, projectId, title, config, credentialId, availableForUse, availableForMaintenance, createdById, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storageId,
        DataStorageType.GOOGLE_BIGQUERY,
        PROJECT_ID,
        'Pagination Storage',
        null,
        null,
        1,
        0,
        USER_ID,
        now.toISOString(),
        now.toISOString(),
      ]
    );

    for (let index = 0; index < DATA_MART_COUNT; index++) {
      const id = randomUUID();
      const createdAt = new Date(now.getTime() - index * 1000).toISOString();
      const title = index === DATA_MART_COUNT - 1 ? NEEDLE_TITLE : `Pagination Data Mart ${index}`;

      await manager.query(
        `INSERT INTO data_mart
           (id, title, storageId, status, definitionType, projectId, availableForReporting, availableForMaintenance, createdById, createdAt, modifiedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title,
          storageId,
          DataMartStatus.DRAFT,
          DataMartDefinitionType.SQL,
          PROJECT_ID,
          1,
          1,
          USER_ID,
          createdAt,
          createdAt,
        ]
      );

      for (const ownerId of ['owner-a', 'owner-b']) {
        await manager.query(
          `INSERT INTO data_mart_technical_owners (data_mart_id, user_id) VALUES (?, ?)`,
          [id, ownerId]
        );
      }
    }
  });
}
