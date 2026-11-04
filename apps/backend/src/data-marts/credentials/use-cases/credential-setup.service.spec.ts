import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { getEventListeners } from 'node:events';
import { setImmediate, setTimeout } from 'node:timers/promises';
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
  const get = new GetCredentialSetupService(store as never, mapper);
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
  it('checks maintenance permission before issuing an update link', async () => {
    const { start, store, access } = setup();
    access.canAccess.mockResolvedValue(false);
    await expect(
      start.run({ context, input: { credentialId: 'credential' } })
    ).rejects.toBeInstanceOf(ForbiddenException);
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
      start.run({
        context,
        input: { credentialId: 'credential', definitionId: 'databricks-token' },
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('does not complete an expired request', async () => {
    const { complete, setRow, store } = setup();
    setRow({ ...pending(), expiresAt: now });
    await expect(
      complete.run({ id: 'setup', context, credentialId: 'credential' })
    ).rejects.toBeInstanceOf(GoneException);
    expect(store.finish).not.toHaveBeenCalled();
  });

  it('checks access before completion and keeps the completed receipt after access is revoked', async () => {
    const { complete, get, access, store, getCredential } = setup();
    access.canAccess.mockResolvedValue(false);
    await expect(
      complete.run({ id: 'setup', context, credentialId: 'credential' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.finish).not.toHaveBeenCalled();
    access.canAccess.mockResolvedValue(true);
    await expect(
      complete.run({ id: 'setup', context, credentialId: 'credential' })
    ).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    getCredential.run.mockRejectedValue(new ForbiddenException());
    access.canAccess.mockResolvedValue(false);
    await expect(get.run({ id: 'setup', context })).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    await expect(
      complete.run({ id: 'setup', context, credentialId: 'credential' })
    ).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    expect(store.finish).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['read access is revoked', ForbiddenException],
    ['the Credential is deleted', NotFoundException],
    ['maintenance permission is revoked', null],
  ] as const)(
    'keeps an owned pending update readable and cancellable after %s',
    async (_state, ErrorType) => {
      const { get, complete, cancel, getCredential, access, setRow, store } = setup();
      setRow({ ...pending(), mode: 'update', credentialId: 'credential' });
      if (ErrorType) getCredential.run.mockRejectedValue(new ErrorType());
      access.canAccess.mockResolvedValue(false);
      await expect(get.run({ id: 'setup', context })).resolves.toMatchObject({ status: 'pending' });
      await expect(
        new WaitCredentialSetupService(get).run({ id: 'setup', context })
      ).resolves.toMatchObject({
        status: 'pending',
      });
      expect(getCredential.run).not.toHaveBeenCalled();
      expect(access.canAccess).not.toHaveBeenCalled();
      await expect(
        complete.run({ id: 'setup', context, credentialId: 'credential' })
      ).rejects.toBeInstanceOf(ErrorType ?? ForbiddenException);
      expect(store.finish).not.toHaveBeenCalled();
      await expect(cancel.run({ id: 'setup', context })).resolves.toMatchObject({
        status: 'cancelled',
      });
    }
  );

  it('does not overwrite a concurrent cancellation', async () => {
    const { complete, store, setRow } = setup();
    store.finish.mockImplementationOnce(async () => {
      setRow({ ...pending(), status: 'cancelled' });
      return false;
    });
    await expect(
      complete.run({ id: 'setup', context, credentialId: 'credential' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns the completed request from a bounded wait', async () => {
    const { get, setRow } = setup();
    const wait = new WaitCredentialSetupService(get);
    const reads = jest.spyOn(get, 'run');
    const result = wait.run({ id: 'setup', context, waitSeconds: 25 });
    await setImmediate();
    expect(reads).toHaveBeenCalledTimes(1);
    setRow({ ...pending(), status: 'completed', credentialId: 'credential', completedAt: now });
    await expect(result).resolves.toMatchObject({
      status: 'completed',
      credentialId: 'credential',
    });
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('aborts waiting and releases its timer when the MCP client disconnects', async () => {
    const { get } = setup();
    const wait = new WaitCredentialSetupService(get);
    const reads = jest.spyOn(get, 'run');
    const abort = new AbortController();
    const result = wait.run({ id: 'setup', context, waitSeconds: 25, signal: abort.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await setImmediate();
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(1);
    abort.abort();
    await rejected;
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(0);
    await setTimeout(1100);
    expect(reads).toHaveBeenCalledTimes(1);
  });
});
