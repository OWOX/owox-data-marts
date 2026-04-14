import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp, closeTestApp } from '@owox/test-utils';
import { randomUUID } from 'crypto';

import { ListDataMartsService } from '../src/data-marts/use-cases/list-data-marts.service';
import { ListDataStoragesService } from '../src/data-marts/use-cases/list-data-storages.service';
import { ListDataDestinationsService } from '../src/data-marts/use-cases/list-data-destinations.service';
import { ContextService } from '../src/data-marts/services/context/context.service';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { UserProjectionsListDto } from '../src/idp/dto/domain/user-projections-list.dto';
import { ListDataMartsCommand } from '../src/data-marts/dto/domain/list-data-marts.command';
import { ListDataStoragesCommand } from '../src/data-marts/dto/domain/list-data-storages.command';
import { ListDataDestinationsCommand } from '../src/data-marts/dto/domain/list-data-destinations.command';
import { RoleScope } from '../src/data-marts/enums/role-scope.enum';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataMartStatus } from '../src/data-marts/enums/data-mart-status.enum';

// ─── Scale ───────────────────────────────────────────────────
// Chosen to surface index differences on SQLite :memory:. If this test starts
// gating CI, consider moving it to a dedicated "performance" suite.
const N_CONTEXTS = 10;
const N_STORAGES = 200;
const N_DESTINATIONS = 200;
const N_DATA_MARTS = 500;
const CONTEXTS_PER_ENTITY_MAX = 3;
const ITERATIONS = 15;
const WARMUP_ITERATIONS = 3;

// ─── Thresholds (ms, p95) ────────────────────────────────────
// Sized to catch index-loss regressions (~20× headroom over measured p95 on a
// developer laptop with SQLite :memory:). If CI is noticeably slower, bump these;
// if they start masking regressions, tighten them.
const THRESHOLD_MS = {
  listDataMarts: 300,
  listDataStorages: 200,
  listDataDestinations: 200,
  getContextImpact: 50,
};

// ─── Test identities ─────────────────────────────────────────
const PROJECT_ID = 'perf-project';
const USER_ADMIN = 'u-admin';
const USER_TU_ENTIRE = 'u-tu-entire';
const USER_TU_SCOPED = 'u-tu-scoped';
const USER_BU_ENTIRE = 'u-bu-entire';

interface TimingSummary {
  name: string;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

function summarize(name: string, samples: number[]): TimingSummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length;
  return {
    name,
    p50: pct(0.5),
    p95: pct(0.95),
    max: sorted[sorted.length - 1],
    mean,
  };
}

async function bench<T>(label: string, fn: () => Promise<T>): Promise<number> {
  const started = performance.now();
  await fn();
  return performance.now() - started;
}

async function seed(dataSource: DataSource): Promise<{ contextIds: string[] }> {
  const now = new Date().toISOString();

  // Contexts
  const contextIds: string[] = [];
  for (let i = 0; i < N_CONTEXTS; i++) {
    const id = randomUUID();
    contextIds.push(id);
    await dataSource.query(
      `INSERT INTO context (id, name, description, projectId, createdById, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, `Ctx-${String(i)}`, null, PROJECT_ID, USER_ADMIN, now, now]
    );
  }

  // Storages
  const storageIds: string[] = [];
  for (let i = 0; i < N_STORAGES; i++) {
    const id = randomUUID();
    storageIds.push(id);
    await dataSource.query(
      `INSERT INTO data_storage
         (id, type, projectId, title, config, credentialId, availableForUse, availableForMaintenance, createdById, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        DataStorageType.GOOGLE_BIGQUERY,
        PROJECT_ID,
        `Storage-${String(i)}`,
        null,
        null,
        1, // availableForUse
        0,
        USER_ADMIN,
        now,
        now,
      ]
    );
    // Assign 1..CONTEXTS_PER_ENTITY_MAX contexts to each storage
    const nContexts = 1 + (i % CONTEXTS_PER_ENTITY_MAX);
    for (let k = 0; k < nContexts; k++) {
      const cid = contextIds[(i + k) % N_CONTEXTS];
      await dataSource.query(
        `INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)`,
        [id, cid]
      );
    }
  }

  // Destinations
  for (let i = 0; i < N_DESTINATIONS; i++) {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO data_destination
         (id, title, type, projectId, credentialId, availableForUse, availableForMaintenance, createdById, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        `Destination-${String(i)}`,
        DataDestinationType.EMAIL,
        PROJECT_ID,
        null,
        1,
        0,
        USER_ADMIN,
        now,
        now,
      ]
    );
    const nContexts = 1 + (i % CONTEXTS_PER_ENTITY_MAX);
    for (let k = 0; k < nContexts; k++) {
      const cid = contextIds[(i + k) % N_CONTEXTS];
      await dataSource.query(
        `INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)`,
        [id, cid]
      );
    }
  }

  // Data Marts
  for (let i = 0; i < N_DATA_MARTS; i++) {
    const id = randomUUID();
    const storageId = storageIds[i % storageIds.length];
    await dataSource.query(
      `INSERT INTO data_mart
         (id, title, storageId, status, projectId, availableForReporting, availableForMaintenance, createdById, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        `DataMart-${String(i)}`,
        storageId,
        DataMartStatus.PUBLISHED,
        PROJECT_ID,
        1,
        0,
        USER_ADMIN,
        now,
        now,
      ]
    );
    const nContexts = 1 + (i % CONTEXTS_PER_ENTITY_MAX);
    for (let k = 0; k < nContexts; k++) {
      const cid = contextIds[(i + k) % N_CONTEXTS];
      await dataSource.query(
        `INSERT INTO data_mart_contexts (data_mart_id, context_id) VALUES (?, ?)`,
        [id, cid]
      );
    }
  }

  // Member role scopes
  const scopes: Array<[string, RoleScope]> = [
    [USER_TU_ENTIRE, RoleScope.ENTIRE_PROJECT],
    [USER_TU_SCOPED, RoleScope.SELECTED_CONTEXTS],
    [USER_BU_ENTIRE, RoleScope.ENTIRE_PROJECT],
  ];
  for (const [userId, scope] of scopes) {
    await dataSource.query(
      `INSERT INTO member_role_scope (user_id, project_id, role_scope) VALUES (?, ?, ?)`,
      [userId, PROJECT_ID, scope]
    );
  }

  // Scoped TU gets 2 contexts (≈1/5 of project)
  for (const cid of contextIds.slice(0, 2)) {
    await dataSource.query(
      `INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)`,
      [USER_TU_SCOPED, PROJECT_ID, cid]
    );
  }

  return { contextIds };
}

describe('Permissions Model: Context query performance (benchmark)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let listDataMarts: ListDataMartsService;
  let listDataStorages: ListDataStoragesService;
  let listDataDestinations: ListDataDestinationsService;
  let contextService: ContextService;
  let contextIds: string[];

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = app.get(DataSource);

    // Keep IDP projection lookups trivial so they don't dominate timing
    const facade = app.get(IdpProjectionsFacade);
    jest.spyOn(facade, 'getUserProjectionList').mockResolvedValue(new UserProjectionsListDto([]));
    jest.spyOn(facade, 'getUserProjection').mockResolvedValue(undefined);
    jest.spyOn(facade, 'getProjectMembers').mockResolvedValue([]);

    listDataMarts = app.get(ListDataMartsService);
    listDataStorages = app.get(ListDataStoragesService);
    listDataDestinations = app.get(ListDataDestinationsService);
    contextService = app.get(ContextService);

    const seedStart = performance.now();
    ({ contextIds } = await seed(dataSource));
    console.log(
      `[perf] seeded ${String(N_DATA_MARTS)} DMs / ${String(N_STORAGES)} storages / ${String(N_DESTINATIONS)} destinations / ${String(N_CONTEXTS)} contexts in ${String(Math.round(performance.now() - seedStart))}ms`
    );
  }, 120_000);

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  // Helper: runs N iterations, reports p50/p95/max/mean, asserts p95 < threshold.
  async function measure(
    name: string,
    thresholdMs: number,
    fn: () => Promise<unknown>
  ): Promise<void> {
    for (let i = 0; i < WARMUP_ITERATIONS; i++) await fn();
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) samples.push(await bench(name, fn));
    const stats = summarize(name, samples);
    console.log(
      `[perf] ${name.padEnd(32)} p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms max=${stats.max.toFixed(1)}ms mean=${stats.mean.toFixed(1)}ms`
    );
    expect(stats.p95).toBeLessThan(thresholdMs);
  }

  describe('list-data-marts', () => {
    it(`admin: p95 < ${String(THRESHOLD_MS.listDataMarts)}ms`, async () => {
      await measure('listDataMarts/admin', THRESHOLD_MS.listDataMarts, () =>
        listDataMarts.run(new ListDataMartsCommand(PROJECT_ID, USER_ADMIN, ['admin']))
      );
    }, 120_000);

    it(`TU entire_project: p95 < ${String(THRESHOLD_MS.listDataMarts)}ms`, async () => {
      await measure('listDataMarts/tu-entire', THRESHOLD_MS.listDataMarts, () =>
        listDataMarts.run(new ListDataMartsCommand(PROJECT_ID, USER_TU_ENTIRE, ['editor']))
      );
    }, 120_000);

    it(`TU selected_contexts: p95 < ${String(THRESHOLD_MS.listDataMarts)}ms`, async () => {
      await measure('listDataMarts/tu-scoped', THRESHOLD_MS.listDataMarts, () =>
        listDataMarts.run(new ListDataMartsCommand(PROJECT_ID, USER_TU_SCOPED, ['editor']))
      );
    }, 120_000);

    it(`BU entire_project: p95 < ${String(THRESHOLD_MS.listDataMarts)}ms`, async () => {
      await measure('listDataMarts/bu-entire', THRESHOLD_MS.listDataMarts, () =>
        listDataMarts.run(new ListDataMartsCommand(PROJECT_ID, USER_BU_ENTIRE, ['viewer']))
      );
    }, 120_000);
  });

  describe('list-data-storages', () => {
    it(`admin: p95 < ${String(THRESHOLD_MS.listDataStorages)}ms`, async () => {
      await measure('listDataStorages/admin', THRESHOLD_MS.listDataStorages, () =>
        listDataStorages.run(new ListDataStoragesCommand(PROJECT_ID, USER_ADMIN, ['admin']))
      );
    }, 120_000);

    it(`TU selected_contexts: p95 < ${String(THRESHOLD_MS.listDataStorages)}ms`, async () => {
      await measure('listDataStorages/tu-scoped', THRESHOLD_MS.listDataStorages, () =>
        listDataStorages.run(new ListDataStoragesCommand(PROJECT_ID, USER_TU_SCOPED, ['editor']))
      );
    }, 120_000);
  });

  describe('list-data-destinations', () => {
    it(`admin: p95 < ${String(THRESHOLD_MS.listDataDestinations)}ms`, async () => {
      await measure('listDataDestinations/admin', THRESHOLD_MS.listDataDestinations, () =>
        listDataDestinations.run(new ListDataDestinationsCommand(PROJECT_ID, USER_ADMIN, ['admin']))
      );
    }, 120_000);

    it(`TU selected_contexts: p95 < ${String(THRESHOLD_MS.listDataDestinations)}ms`, async () => {
      await measure('listDataDestinations/tu-scoped', THRESHOLD_MS.listDataDestinations, () =>
        listDataDestinations.run(
          new ListDataDestinationsCommand(PROJECT_ID, USER_TU_SCOPED, ['editor'])
        )
      );
    }, 120_000);
  });

  describe('context.getImpact', () => {
    it(`heavy context: p95 < ${String(THRESHOLD_MS.getContextImpact)}ms`, async () => {
      const ctxId = contextIds[0];
      await measure('contextImpact/heavy', THRESHOLD_MS.getContextImpact, () =>
        contextService.getImpact(ctxId, PROJECT_ID)
      );
    }, 120_000);
  });
});
