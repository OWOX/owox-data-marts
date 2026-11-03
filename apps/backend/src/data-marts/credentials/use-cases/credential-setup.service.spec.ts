import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { Action } from '../../services/access-decision';
import { CredentialSetupMapper } from '../mappers/credential-setup.mapper';
import { StartCredentialSetupService } from './start-credential-setup.service';
import { CompleteCredentialSetupService } from './complete-credential-setup.service';
import { GetCredentialSetupService } from './get-credential-setup.service';
import { CancelCredentialSetupService } from './cancel-credential-setup.service';
import { WaitCredentialSetupService } from './wait-credential-setup.service';

const context = { projectId: 'project', userId: 'owner', roles: ['editor' as const] };
const now = new Date('2026-11-02T12:00:00Z');
const pending = () => ({
  id: 'setup',
  projectId: 'project',
  userId: 'owner',
  mode: 'create' as 'create' | 'update',
  status: 'pending' as string,
  definitionId: 'databricks-token',
  credentialId: null as string | null,
  title: null as string | null,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 15 * 60_000),
  completedAt: null as Date | null,
});

function setup() {
  let row = pending();
  const clock = { now: () => now } as SystemTimeService;
  const store = {
    getOwned: jest.fn(async () => row),
    create: jest.fn(async (value: object) => Object.assign(row, value)),
    finish: jest.fn(
      async (_id: string, _actor: object, status: string, credentialId: string | null) => {
        if (row.status !== 'pending') return false;
        row = { ...row, status, credentialId, completedAt: now };
        return true;
      }
    ),
  };
  const getCredential = {
    run: jest.fn(async (id: string) => ({ id, definition: { id: 'databricks-token' } })),
  };
  const access = { canAccess: jest.fn(async () => true) };
  const mapper = new CredentialSetupMapper(clock);
  const get = new GetCredentialSetupService(
    store as never,
    getCredential as never,
    access as never,
    mapper
  );
  const complete = new CompleteCredentialSetupService(
    store as never,
    getCredential as never,
    access as never,
    get,
    clock
  );
  const cancel = new CancelCredentialSetupService(store as never, get, clock);
  const definitions = { get: jest.fn(async () => ({ definitionId: 'databricks-token' })) };
  const start = new StartCredentialSetupService(
    store as never,
    definitions as never,
    getCredential as never,
    access as never,
    mapper,
    clock
  );
  return {
    store,
    getCredential,
    access,
    get,
    complete,
    cancel,
    start,
    setRow: (next: typeof row) => {
      row = next;
    },
  };
}

describe('Credential setup use cases', () => {
  afterEach(() => jest.useRealTimers());

  it('checks maintenance permission before issuing an update link', async () => {
    const { start, store, access } = setup();
    access.canAccess.mockResolvedValue(false);
    await expect(start.run(context, { credentialId: 'credential' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(store.create).not.toHaveBeenCalled();
    expect(access.canAccess).toHaveBeenCalledWith(
      'owner',
      ['editor'],
      expect.anything(),
      'credential',
      Action.EDIT,
      'project'
    );
  });

  it('rejects ambiguous setup input before creating a request', async () => {
    const { start, store } = setup();
    await expect(
      start.run(context, { credentialId: 'credential', definitionId: 'databricks-token' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('does not complete an expired request', async () => {
    const { complete, setRow, store } = setup();
    setRow({ ...pending(), expiresAt: now });
    await expect(complete.run('setup', context, 'credential')).rejects.toBeInstanceOf(
      GoneException
    );
    expect(store.finish).not.toHaveBeenCalled();
  });

  it('checks access before completion and keeps the completed receipt after access is revoked', async () => {
    const { complete, get, access, store, getCredential } = setup();
    access.canAccess.mockResolvedValue(false);
    await expect(complete.run('setup', context, 'credential')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(store.finish).not.toHaveBeenCalled();
    access.canAccess.mockResolvedValue(true);
    await expect(complete.run('setup', context, 'credential')).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    getCredential.run.mockRejectedValue(new ForbiddenException());
    access.canAccess.mockResolvedValue(false);
    await expect(get.run('setup', context)).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    await expect(complete.run('setup', context, 'credential')).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    expect(store.finish).toHaveBeenCalledTimes(1);
  });

  it('still requires access to read and complete a pending update', async () => {
    const { get, complete, getCredential, access, setRow, store } = setup();
    setRow({ ...pending(), mode: 'update', credentialId: 'credential' });
    access.canAccess.mockResolvedValue(false);
    await expect(get.run('setup', context)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(complete.run('setup', context, 'credential')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(store.finish).not.toHaveBeenCalled();
    getCredential.run.mockRejectedValue(new ForbiddenException());
    await expect(get.run('setup', context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not overwrite a concurrent cancellation', async () => {
    const { complete, store, setRow } = setup();
    store.finish.mockImplementationOnce(async () => {
      setRow({ ...pending(), status: 'cancelled' });
      return false;
    });
    await expect(complete.run('setup', context, 'credential')).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('returns the completed request from a bounded wait', async () => {
    jest.useFakeTimers();
    const { get, setRow } = setup();
    const wait = new WaitCredentialSetupService(get);
    const result = wait.run('setup', context, 25);
    await jest.advanceTimersByTimeAsync(500);
    setRow({ ...pending(), status: 'completed', credentialId: 'credential', completedAt: now });
    await jest.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('aborts waiting and releases its timer when the MCP client disconnects', async () => {
    jest.useFakeTimers();
    const { get } = setup();
    const wait = new WaitCredentialSetupService(get);
    const abort = new AbortController();
    const result = wait.run('setup', context, 25, abort.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(1);
    abort.abort();
    await rejected;
    expect(jest.getTimerCount()).toBe(0);
  });
});
