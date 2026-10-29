import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  closeTestApp,
  setupConnectorDataMart,
  AUTH_HEADER,
  DataDestinationBuilder,
  ReportBuilder,
  EMAIL_REPORT_DESTINATION_CONFIG,
} from '@owox/test-utils';
import { TriggerStatus } from '../src/common/scheduler/shared/entities/trigger-status';
import { RunType } from '../src/common/scheduler/shared/types';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { Trigger } from '../src/common/scheduler/shared/entities/trigger.entity';
import { ConnectorRunTrigger } from '../src/data-marts/entities/connector-run-trigger.entity';
import { ReportRunTrigger } from '../src/data-marts/entities/report-run-trigger.entity';
import { DataMartRun } from '../src/data-marts/entities/data-mart-run.entity';
import { DataMartRunStatus } from '../src/data-marts/enums/data-mart-run-status.enum';
import { DataMartRunType } from '../src/data-marts/enums/data-mart-run-type.enum';

const TERMINAL: ReadonlySet<string> = new Set([
  DataMartRunStatus.SUCCESS,
  DataMartRunStatus.FAILED,
  DataMartRunStatus.CANCELLED,
  DataMartRunStatus.INTERRUPTED,
  DataMartRunStatus.RESTRICTED,
]);

describe('DuckDB storage — run queue (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataSource: DataSource;
  let duckDataDir: string;

  beforeAll(async () => {
    duckDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'owox-duck-queue-e2e-'));
    process.env.DUCKDB_DATA_DIR = duckDataDir;
    // Keeps the project's connector-run limit out of the way: only the storage may hold a run.
    process.env.MAX_CONNECTOR_RUNS_PER_PROJECT = '10';

    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    dataSource = app.get(DataSource);
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
    fs.rmSync(duckDataDir, { recursive: true, force: true });
    delete process.env.DUCKDB_DATA_DIR;
    delete process.env.MAX_CONNECTOR_RUNS_PER_PROJECT;
  });

  const duckDbDataMart = (storageId?: string) =>
    setupConnectorDataMart(agent, app, {
      storageType: DataStorageType.DUCKDB,
      storageId,
      fullyQualifiedName: 'main.holidays',
    });

  /** A load that runs until `end` is called: a RUNNING connector run with no trigger. */
  async function startLoad(dataMartId: string): Promise<{ end: () => Promise<void> }> {
    const runs = dataSource.getRepository(DataMartRun);
    const run = await runs.save({
      dataMartId,
      type: DataMartRunType.CONNECTOR,
      status: DataMartRunStatus.RUNNING,
      runType: RunType.manual,
      definitionRun: null,
    });
    return {
      end: async () => {
        await runs.update(run.id, { status: DataMartRunStatus.SUCCESS });
      },
    };
  }

  async function manualRun(dataMartId: string): Promise<string> {
    const res = await agent.post(`/api/data-marts/${dataMartId}/manual-run`).set(AUTH_HEADER);
    expect(res.status).toBe(201);
    return res.body.runId as string;
  }

  async function runStatus(dataMartId: string, runId: string): Promise<string> {
    const res = await agent.get(`/api/data-marts/${dataMartId}/runs/${runId}`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
    return res.body.status as string;
  }

  async function waitForStatus(
    dataMartId: string,
    runId: string,
    accept: (status: string) => boolean
  ): Promise<string> {
    let status = '';
    await waitUntil(async () => accept((status = await runStatus(dataMartId, runId))));
    return status;
  }

  /** Waits for a held claim: the claim bumped the trigger's version and left it IDLE and active. */
  async function waitForHeldClaim(
    entity: typeof ConnectorRunTrigger | typeof ReportRunTrigger,
    dataMartRunId: string
  ): Promise<void> {
    const triggers = dataSource.getRepository<Trigger & { dataMartRunId: string }>(entity);
    const { version } = await triggers.findOneByOrFail({ dataMartRunId });
    await waitUntil(async () => {
      const trigger = await triggers.findOneByOrFail({ dataMartRunId });
      return trigger.version > version && trigger.status === TriggerStatus.IDLE && trigger.isActive;
    });
  }

  it('holds a load while another load runs on the same DuckDB storage, and not on another one', async () => {
    const holder = await duckDbDataMart();
    const sameStorage = await duckDbDataMart(holder.storageId);
    const otherStorage = await duckDbDataMart();
    const load = await startLoad(holder.dataMartId);

    const heldRunId = await manualRun(sameStorage.dataMartId);
    const freeRunId = await manualRun(otherStorage.dataMartId);

    await waitForHeldClaim(ConnectorRunTrigger, heldRunId);
    expect(await runStatus(sameStorage.dataMartId, heldRunId)).toBe(DataMartRunStatus.PENDING);
    await waitForStatus(otherStorage.dataMartId, freeRunId, s => s !== DataMartRunStatus.PENDING);

    await load.end();

    await waitForStatus(sameStorage.dataMartId, heldRunId, s => s !== DataMartRunStatus.PENDING);
    expect(await waitForStatus(sameStorage.dataMartId, heldRunId, s => TERMINAL.has(s))).toBe(
      DataMartRunStatus.SUCCESS
    );
    expect(await waitForStatus(otherStorage.dataMartId, freeRunId, s => TERMINAL.has(s))).toBe(
      DataMartRunStatus.SUCCESS
    );
  }, 120_000);

  it('holds a Report Run on the storage while a load runs on it', async () => {
    const holder = await duckDbDataMart();
    const reported = await duckDbDataMart(holder.storageId);
    const reportId = await createEmailReport(holder.storageId, reported.dataMartId);
    const load = await startLoad(holder.dataMartId);

    await agent.post(`/api/reports/${reportId}/run`).set(AUTH_HEADER).expect(201);
    const runs = await agent.get(`/api/data-marts/${reported.dataMartId}/runs`).set(AUTH_HEADER);
    const reportRunId = (runs.body.runs as Array<{ id: string; reportId?: string }>).find(
      run => run.reportId === reportId
    )!.id;

    await waitForHeldClaim(ReportRunTrigger, reportRunId);
    expect(await runStatus(reported.dataMartId, reportRunId)).toBe(DataMartRunStatus.PENDING);

    await load.end();

    await waitForStatus(reported.dataMartId, reportRunId, s => s !== DataMartRunStatus.PENDING);
    await waitForStatus(reported.dataMartId, reportRunId, s => TERMINAL.has(s));
  }, 120_000);

  async function createEmailReport(storageId: string, dataMartId: string): Promise<string> {
    const destination = await agent
      .post('/api/data-destinations')
      .set(AUTH_HEADER)
      .send(
        new DataDestinationBuilder()
          .withType(DataDestinationType.EMAIL)
          .withCredentials({ type: 'email-credentials', to: ['reports@example.com'] })
          .build()
      )
      .expect(201);
    const destinationId = destination.body.id as string;
    // New entities are not available for use until made so.
    await agent
      .put(`/api/data-storages/${storageId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: true, availableForMaintenance: true })
      .expect(204);
    await agent
      .put(`/api/data-marts/${dataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: true, availableForMaintenance: true })
      .expect(204);
    await agent
      .put(`/api/data-destinations/${destinationId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: true, availableForMaintenance: true })
      .expect(204);

    const report = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder()
          .withDataMartId(dataMartId)
          .withDataDestinationId(destinationId)
          .withDestinationConfig(EMAIL_REPORT_DESTINATION_CONFIG)
          .build()
      )
      .expect(201);
    return report.body.id as string;
  }
});

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs} ms`);
    await sleep(500);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
