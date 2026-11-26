import { Logger } from '@nestjs/common';
import type { ManagedStorage } from '../entities/managed-storage.entity';
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
    lastActivityAt: ago(90),
    deprovisionedAt: null,
    deprovisionPending: false,
    createdAt: ago(200),
    ...patch,
  }) as ManagedStorage;

const leftover = (id: string) => record(id, { deprovisionedAt: ago(1), deprovisionPending: true });

// `current` holds the records as the retry reads them again, after the list was read.
function setup(pending: ManagedStorage[], current: ManagedStorage[] = []) {
  const engine = { deprovision: jest.fn().mockResolvedValue(undefined) };
  const stored = new Map([...pending, ...current].map(r => [r.storageId, r]));
  const managed = {
    findPendingDeprovision: jest.fn().mockResolvedValue(pending),
    findByStorageId: jest.fn(async (id: string) => stored.get(id) ?? null),
    setDeprovisionPending: jest.fn().mockResolvedValue(undefined),
  };
  const config = { isEnabled: () => true };
  const service = new OwoxStorageLifecycleService(
    engine as never,
    managed as never,
    config as never
  );
  return { service, engine, managed, stored };
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

  it('retries a deletion that did not finish, and clears its flag', async () => {
    const left = leftover('a');
    const { service, engine, managed } = setup([left]);
    await service.runDaily();
    expect(engine.deprovision).toHaveBeenCalledWith(left);
    expect(managed.setDeprovisionPending.mock.calls).toEqual([['a', false]]);
    expect(logs).toContain('OWOX Storage ds_a leftovers deleted');
  });

  it('skips a storage whose restore cleared its pending flag after the list was read', async () => {
    const listed = leftover('a');
    const { service, engine } = setup([listed], [{ ...listed, deprovisionPending: false }]);
    await service.runDaily();
    expect(engine.deprovision).not.toHaveBeenCalled();
  });

  it('keeps a storage pending when its retry fails, and retries the next one', async () => {
    const failing = leftover('a');
    const next = leftover('b');
    const { service, engine, managed } = setup([failing, next]);
    engine.deprovision.mockRejectedValueOnce(new Error('still there'));
    await service.runDaily();
    expect(engine.deprovision.mock.calls).toEqual([[failing], [next]]);
    expect(managed.setDeprovisionPending.mock.calls).toEqual([['b', false]]);
    expect(logs).toContain(
      'OWOX Storage ds_a leftovers could not be deleted (code unknown); retried at the next run.'
    );
  });

  it('skips a pending storage that was restored or removed before its retry', async () => {
    const restored = leftover('a');
    const removed = leftover('b');
    const { service, engine, managed, stored } = setup([restored, removed]);
    stored.set('a', record('a', { lastActivityAt: now }));
    stored.delete('b');
    await service.runDaily();
    expect(engine.deprovision).not.toHaveBeenCalled();
    expect(managed.setDeprovisionPending).not.toHaveBeenCalled();
  });

  it('processes nothing once aborted', async () => {
    const { service, engine } = setup([leftover('a')]);
    const controller = new AbortController();
    controller.abort();
    await service.runDaily(controller.signal);
    expect(engine.deprovision).not.toHaveBeenCalled();
  });
});
