import { Logger } from '@nestjs/common';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { OwoxStorageLifecycleService } from './owox-storage-lifecycle.service';

const DAY = 86_400_000;
const now = new Date('2026-06-30T00:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const record = (id: string, patch: Partial<ManagedStorage> = {}) =>
  ({
    storageId: id,
    projectId: `p-${id}`,
    datasetId: `ds_${id}`,
    serviceAccountEmail: `${id}@sa.example`,
    notPaidSince: null,
    lastActivityAt: ago(1),
    deprovisionedAt: null,
    createdAt: ago(200),
    ...patch,
  }) as ManagedStorage;

function setup(
  records: ManagedStorage[],
  plans: Record<string, ProjectPlanType | null>,
  jobs: Record<string, Date> | Error = {}
) {
  const engine = {
    deprovision: jest.fn().mockResolvedValue(undefined),
    lastJobTimes: jest.fn(async () => {
      if (jobs instanceof Error) throw jobs;
      return new Map(Object.entries(jobs));
    }),
  };
  const managed = {
    findActive: jest.fn().mockResolvedValue(records),
    updateActive: jest.fn().mockResolvedValue(true),
  };
  const planService = { planFor: jest.fn(async (projectId: string) => plans[projectId]) };
  const config = {
    isEnabled: () => true,
    getSettings: () => ({ notPaidDeletionDays: 30, inactivityDeletionDays: 30 }),
  };
  const service = new OwoxStorageLifecycleService(
    engine as never,
    planService as never,
    managed as never,
    config as never
  );
  return { service, engine, managed };
}

describe('OwoxStorageLifecycleService.runDaily', () => {
  const logs: string[] = [];
  beforeEach(() => {
    logs.length = 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((m: unknown) => void logs.push(String(m)));
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('marks a NOT_PAID storage the first day and keeps it', async () => {
    const r = record('a');
    const { service, engine, managed } = setup([r], { 'p-a': ProjectPlanType.NOT_PAID });
    await service.runDaily(now);
    expect(managed.updateActive.mock.calls).toEqual([['a', { notPaidSince: now }]]);
    expect(engine.deprovision).not.toHaveBeenCalled();
  });

  it('deletes a storage NOT_PAID for 30 days', async () => {
    const r = record('a', { notPaidSince: ago(30) });
    const { service, engine, managed } = setup([r], { 'p-a': ProjectPlanType.NOT_PAID });
    await service.runDaily(now);
    expect(engine.deprovision).toHaveBeenCalledWith(r);
    expect(managed.updateActive.mock.calls).toEqual([['a', { deprovisionedAt: now }]]);
    expect(logs).toContain('OWOX Storage ds_a deleted: NOT_PAID');
  });

  it('keeps a storage NOT_PAID for 29 days even when idle for 90', async () => {
    const r = record('a', { notPaidSince: ago(29), lastActivityAt: ago(90) });
    const { service, engine, managed } = setup([r], { 'p-a': ProjectPlanType.NOT_PAID });
    await service.runDaily(now);
    expect(engine.deprovision).not.toHaveBeenCalled();
    expect(managed.updateActive).not.toHaveBeenCalled();
  });

  it('restarts the inactivity period when the project pays on day 29', async () => {
    const r = record('a', { notPaidSince: ago(29), lastActivityAt: ago(90) });
    const { service, engine, managed } = setup([r], { 'p-a': ProjectPlanType.FREE });
    await service.runDaily(now);
    expect(managed.updateActive.mock.calls).toEqual([
      ['a', { notPaidSince: null, lastActivityAt: now }],
    ]);
    expect(engine.deprovision).not.toHaveBeenCalled();
  });

  it('deletes a FREE storage whose last job is 31 days old', async () => {
    const r = record('a', { lastActivityAt: ago(31) });
    const { service, engine, managed } = setup([r], { 'p-a': ProjectPlanType.FREE });
    await service.runDaily(now);
    expect(engine.deprovision).toHaveBeenCalled();
    expect(managed.updateActive.mock.calls).toEqual([['a', { deprovisionedAt: now }]]);
    expect(logs).toContain('OWOX Storage ds_a deleted: INACTIVE');
  });

  it("records yesterday's job and keeps the storage", async () => {
    const r = record('a', { lastActivityAt: ago(31) });
    const { service, engine, managed } = setup(
      [r],
      { 'p-a': ProjectPlanType.FREE },
      { 'a@sa.example': ago(1) }
    );
    await service.runDaily(now);
    expect(managed.updateActive.mock.calls).toEqual([['a', { lastActivityAt: ago(1) }]]);
    expect(engine.deprovision).not.toHaveBeenCalled();
  });

  it('never deletes PAID for inactivity and restarts the Free countdown each day', async () => {
    const r = record('a', { lastActivityAt: ago(90) });
    const { service, engine, managed } = setup([r], { 'p-a': ProjectPlanType.PAID });
    await service.runDaily(now);
    expect(engine.deprovision).not.toHaveBeenCalled();
    expect(managed.updateActive.mock.calls).toEqual([['a', { lastActivityAt: now }]]);
  });

  it('leaves a storage alone when its plan cannot be read', async () => {
    const r = record('a', { notPaidSince: ago(40), lastActivityAt: ago(90) });
    const { service, engine, managed } = setup([r], { 'p-a': null });
    await service.runDaily(now);
    expect(managed.updateActive).not.toHaveBeenCalled();
    expect(engine.deprovision).not.toHaveBeenCalled();
  });

  it('skips inactivity deletion but not NOT_PAID deletion when activity is unreadable', async () => {
    const idle = record('a', { lastActivityAt: ago(90) });
    const unpaid = record('b', { notPaidSince: ago(31) });
    const { service, engine, managed } = setup(
      [idle, unpaid],
      { 'p-a': ProjectPlanType.FREE, 'p-b': ProjectPlanType.NOT_PAID },
      new Error('boom')
    );
    await service.runDaily(now);
    expect(engine.deprovision).toHaveBeenCalledTimes(1);
    expect(engine.deprovision).toHaveBeenCalledWith(unpaid);
    expect(managed.updateActive.mock.calls).toEqual([['b', { deprovisionedAt: now }]]);
  });

  it('continues after a failed deprovision and leaves that storage unmarked', async () => {
    const first = record('a', { notPaidSince: ago(31) });
    const second = record('b', { notPaidSince: ago(31) });
    const { service, engine, managed } = setup([first, second], {
      'p-a': ProjectPlanType.NOT_PAID,
      'p-b': ProjectPlanType.NOT_PAID,
    });
    engine.deprovision.mockRejectedValueOnce(new Error('gone wrong'));
    await service.runDaily(now);
    expect(managed.updateActive.mock.calls).toEqual([['b', { deprovisionedAt: now }]]);
  });

  it('processes nothing once aborted', async () => {
    const r = record('a', { notPaidSince: ago(31) });
    const { service, engine } = setup([r], { 'p-a': ProjectPlanType.NOT_PAID });
    const controller = new AbortController();
    controller.abort();
    await service.runDaily(now, controller.signal);
    expect(engine.deprovision).not.toHaveBeenCalled();
    expect(engine.lastJobTimes).not.toHaveBeenCalled();
  });

  it('keeps the newer lastActivityAt when the job is older', async () => {
    const r = record('a', { lastActivityAt: ago(1) });
    const { service, managed } = setup(
      [r],
      { 'p-a': ProjectPlanType.FREE },
      { 'a@sa.example': ago(10) }
    );
    await service.runDaily(now);
    expect(managed.updateActive).not.toHaveBeenCalled();
  });

  it('deletes a storage that falls due a few seconds after the run starts', async () => {
    const r = record('a', { notPaidSince: new Date(ago(30).getTime() + 10_000) });
    const { service, engine } = setup([r], { 'p-a': ProjectPlanType.NOT_PAID });
    await service.runDaily(now);
    expect(engine.deprovision).toHaveBeenCalledWith(r);
  });

  it('does not re-insert or delete a record the customer deleted during the run', async () => {
    const changed = record('a', { notPaidSince: ago(31), lastActivityAt: ago(10) });
    const unchanged = record('b', { notPaidSince: ago(31) });
    const { service, engine, managed } = setup(
      [changed, unchanged],
      { 'p-a': ProjectPlanType.NOT_PAID, 'p-b': ProjectPlanType.NOT_PAID },
      { 'a@sa.example': ago(2) }
    );
    managed.updateActive.mockResolvedValue(false);
    await service.runDaily(now);
    expect(managed.updateActive.mock.calls).toEqual([
      ['a', { lastActivityAt: ago(2) }],
      ['b', { deprovisionedAt: now }],
    ]);
    expect(engine.deprovision).toHaveBeenCalledTimes(1);
    expect(engine.deprovision).toHaveBeenCalledWith(unchanged);
    expect(logs).not.toContain('OWOX Storage ds_b deleted: NOT_PAID');
  });

  it('writes no service-account email to the logs', async () => {
    const r = record('a', { notPaidSince: ago(31) });
    const { service, engine } = setup([r], { 'p-a': ProjectPlanType.NOT_PAID });
    engine.deprovision.mockRejectedValueOnce(new Error('a@sa.example failed'));
    await service.runDaily(now);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join('\n')).not.toContain('@');
  });
});
