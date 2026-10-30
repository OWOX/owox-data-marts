jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import type { AuthorizationContext } from '../../../idp';
import {
  CREDENTIAL_VALIDATION_ENTITIES,
  credentialValidationWriteCases,
} from '../../../../test/fixtures/credential-validation-writes';
import { Credential } from '../entities/credential.entity';
import { applyCustomConnectorUpdate, applyFieldsUpdate } from './credential-fields';
import { CredentialService, ROTATION_LEASE_STALE_MS } from './credential.service';

/** A service whose only real repositories are the ones a test passes. */
function credentialService(credentials: unknown, bindings: unknown): CredentialService {
  return new CredentialService(
    credentials as never,
    bindings as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
}

describe('CredentialService.createWithAccess', () => {
  const member = {
    projectId: 'project-1',
    userId: 'member-1',
    roles: ['editor'],
  } as AuthorizationContext;

  function setup() {
    const credentials = {
      create: jest.fn((value: object) => ({ ...value })),
      save: jest.fn((value: object) => Promise.resolve({ id: 'credential-1', ...value })),
    };
    const owners = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) => Promise.resolve(value)),
      delete: jest.fn(),
    };
    const credentialContexts = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const idpProjections = {
      getProjectMembers: jest.fn().mockResolvedValue([
        { userId: 'member-1', isOutbound: false },
        { userId: 'member-2', isOutbound: false },
      ]),
    };
    const contexts = { validateContextIds: jest.fn() };
    const service = new CredentialService(
      credentials as never,
      {} as never,
      owners as never,
      credentialContexts as never,
      idpProjections as never,
      contexts as never
    );
    return { service, credentials, owners, credentialContexts, idpProjections, contexts };
  }

  it('makes the member the first owner and checks owners and Contexts against the project', async () => {
    const state = setup();

    await state.service.createWithAccess(
      { projectId: 'project-1', title: 'Warehouse key' },
      { createdBy: member, ownerIds: ['member-2', 'member-1'], contextIds: ['ctx-1', 'ctx-1'] }
    );

    expect(state.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', createdById: 'member-1' })
    );
    expect(state.idpProjections.getProjectMembers).toHaveBeenCalledWith('project-1');
    expect(state.owners.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', userId: 'member-1' },
      { credentialId: 'credential-1', userId: 'member-2' },
    ]);
    expect(state.contexts.validateContextIds).toHaveBeenCalledWith(['ctx-1'], 'project-1');
    expect(state.credentialContexts.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', contextId: 'ctx-1' },
    ]);
  });

  it('refuses an owner who is not a member of the project', async () => {
    const state = setup();

    await expect(
      state.service.createWithAccess(
        { projectId: 'project-1', title: 'Warehouse key' },
        { createdBy: member, ownerIds: ['outsider'], contextIds: [] }
      )
    ).rejects.toThrow(BadRequestException);
    expect(state.owners.save).not.toHaveBeenCalled();
  });

  it('saves the owners and Contexts of a write no member chose as they are', async () => {
    const state = setup();

    await state.service.createWithAccess(
      { projectId: 'project-1', title: 'Warehouse key', availableForUse: false },
      { createdBy: null, ownerIds: ['former-member', 'former-member'], contextIds: ['ctx-1'] }
    );

    expect(state.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({ availableForUse: false, createdById: null })
    );
    expect(state.idpProjections.getProjectMembers).not.toHaveBeenCalled();
    expect(state.contexts.validateContextIds).not.toHaveBeenCalled();
    expect(state.owners.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', userId: 'former-member' },
    ]);
    expect(state.credentialContexts.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', contextId: 'ctx-1' },
    ]);
  });
});

describe('CredentialService usage metadata', () => {
  it('derives aggregate last use from the newest consumer binding', async () => {
    const usedAt = new Date('2026-08-27T10:00:00.000Z');
    const bindings = { findOne: jest.fn().mockResolvedValue({ lastUsedAt: usedAt }) };
    const service = credentialService({}, bindings);

    await expect(service.getLastUsedAt('credential-1')).resolves.toEqual(usedAt);
    expect(bindings.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ credentialId: 'credential-1' }),
        order: { lastUsedAt: 'DESC' },
        select: { lastUsedAt: true },
      })
    );
  });

  it('acquires a cross-database write lock without changing Credential data', async () => {
    const credential = { id: 'credential-1', projectId: 'project-1' };
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnValue({ andWhere });
    andWhere.mockReturnValueOnce({ andWhere }).mockReturnValueOnce({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const createQueryBuilder = jest.fn().mockReturnValue({ update });
    const findOne = jest.fn().mockResolvedValue(credential);
    const service = credentialService({ createQueryBuilder, findOne }, {});

    await expect(service.lockActiveByIdAndProjectId('credential-1', 'project-1')).resolves.toBe(
      credential
    );

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ modifiedAt: expect.any(Function) });
    expect(execute).toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'credential-1', projectId: 'project-1' } })
    );
  });

  it('does not reuse a stale transaction snapshot when the locking update misses', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 0 });
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnValue({ andWhere });
    andWhere.mockReturnValueOnce({ andWhere }).mockReturnValueOnce({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const findOne = jest.fn();
    const service = credentialService(
      { createQueryBuilder: jest.fn().mockReturnValue({ update }), findOne },
      {}
    );

    await expect(
      service.lockActiveByIdAndProjectId('credential-1', 'project-1')
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('CredentialService validation writes (SQLite)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  credentialValidationWriteCases(() => dataSource);
});

describe('CredentialService.updateSecretFields (SQLite)', () => {
  const ROTATED = 'generated_refresh_token';
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let service: CredentialService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    credentials = dataSource.getRepository(Credential);
    service = credentialService(credentials, {});
  });

  afterAll(() => dataSource.destroy());

  async function givenConnected(): Promise<string> {
    const saved = await credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'Ads account',
        definitionSource: 'builtin',
        definitionId: 'source:FacebookMarketing:oauth2',
        secret: { fields: { AccessToken: 'token-1', [ROTATED]: 'rotated-1' } },
        publicMetadata: {
          fields: { AppId: 'app-1' },
          connection: {
            account: { id: 'acc-1', name: 'Ann', email: null },
            expiresAt: '2026-11-01T00:00:00.000Z',
          },
        },
        validationState: 'verified',
        validationMessage: 'Account connected',
      })
    );
    return saved.id;
  }

  const stored = (id: string) => credentials.findOneByOrFail({ id });

  it('writes the values in place while the expected ones hold, with the new expiry', async () => {
    const id = await givenConnected();
    const lastWrite = new Date('2026-01-01T00:00:00.000Z');
    await credentials.update({ id }, { modifiedAt: lastWrite });

    const result = await service.updateSecretFields(
      id,
      'project-1',
      { AccessToken: 'token-2' },
      { AccessToken: 'token-1' },
      new Date('2027-01-01T00:00:00.000Z')
    );

    expect(result).toEqual({ updated: true });
    const after = await stored(id);
    expect(after.secret).toEqual({ fields: { AccessToken: 'token-2', [ROTATED]: 'rotated-1' } });
    expect(after.publicMetadata).toEqual({
      fields: { AppId: 'app-1' },
      connection: {
        account: { id: 'acc-1', name: 'Ann', email: null },
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
    });
    // The rollout rule compares the old row's write time against this one.
    expect(after.modifiedAt.getTime()).toBeGreaterThan(lastWrite.getTime());
  });

  it('writes nothing when an expected value changed or the Credential is in another project', async () => {
    const id = await givenConnected();

    await expect(
      service.updateSecretFields(id, 'project-1', { [ROTATED]: 'rotated-2' }, { [ROTATED]: 'gone' })
    ).resolves.toEqual({ updated: false });
    await expect(
      service.updateSecretFields(id, 'project-2', { [ROTATED]: 'rotated-2' })
    ).resolves.toEqual({ updated: false });
    await expect(
      service.updateSecretFields(
        id,
        'project-1',
        { [ROTATED]: 'rotated-2' },
        { Missing: undefined }
      )
    ).resolves.toEqual({ updated: true });

    expect((await stored(id)).secret).toEqual({
      fields: { AccessToken: 'token-1', [ROTATED]: 'rotated-2' },
    });
  });

  it.each(['fields', 'custom connector'])(
    "a %s edit that keeps the grant leaves the run's next refresh result writable",
    async kind => {
      const OLD = 'legacy_generated_refresh_token';
      const tokens = (t: string) => ({ [ROTATED]: t, [OLD]: t });
      const fieldList = [
        { key: 'ClientId', label: 'ClientId', secret: false },
        { key: 'ClientSecret', label: 'ClientSecret', secret: true },
      ];
      const secret = { fields: { ClientSecret: 'cs-1', ...tokens('T0') } };
      const publicMetadata =
        kind === 'fields'
          ? { fields: { ClientId: 'client-1' } }
          : { hosts: ['api.acme.example'], fieldList, fields: { ClientId: 'client-1' } };
      const saved = await credentials.save(
        credentials.create({
          projectId: 'project-1',
          title: 'Ads account',
          definitionSource: 'builtin',
          definitionId: 'source:Acme:oauth2',
          secret,
          publicMetadata,
          validationState: 'verified',
          validationMessage: null,
        })
      );
      const expected = { ...secret.fields };

      const current = { secret, publicMetadata } as never;
      const edited =
        kind === 'fields'
          ? applyFieldsUpdate(
              {
                type: 'fields',
                fields: [
                  {
                    key: 'ClientId',
                    label: 'ClientId',
                    input: 'text',
                    secret: false,
                    required: true,
                    identity: true,
                  },
                  {
                    key: 'ClientSecret',
                    label: 'ClientSecret',
                    input: 'password',
                    secret: true,
                    required: true,
                    identity: false,
                  },
                ],
              } as Parameters<typeof applyFieldsUpdate>[0],
              current,
              { ClientId: 'client-1' },
              'x'
            )
          : applyCustomConnectorUpdate(current, { ClientSecret: 'cs-1' });
      await credentials.update({ id: saved.id }, { secret: edited.secret });

      await expect(
        service.updateSecretFields(saved.id, 'project-1', tokens('T1'), expected)
      ).resolves.toEqual({ updated: true });
      expect((await stored(saved.id)).secret).toEqual({
        fields: { ClientSecret: 'cs-1', ...tokens('T1') },
      });
    }
  );

  it('two concurrent rotations: the loser re-reads and does not mark the Credential broken', async () => {
    const id = await givenConnected();

    const results = await Promise.all(
      ['rotated-a', 'rotated-b'].map(token =>
        service.updateSecretFields(
          id,
          'project-1',
          { [ROTATED]: token },
          { [ROTATED]: 'rotated-1' }
        )
      )
    );

    expect(results.map(result => result.updated).sort()).toEqual([false, true]);
    const winner = results[0].updated ? 'rotated-a' : 'rotated-b';
    const after = await stored(id);
    expect(after.secret).toEqual({ fields: { AccessToken: 'token-1', [ROTATED]: winner } });
    expect(after.validationState).toBe('verified');
    expect(after.validationMessage).toBe('Account connected');
  });
});

describe('CredentialService rotation lease (SQLite)', () => {
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let service: CredentialService;
  const modifiedAt = new Date('2026-01-01T00:00:00.000Z');

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    credentials = dataSource.getRepository(Credential);
    service = credentialService(credentials, {});
  });

  afterAll(() => dataSource.destroy());

  async function givenRotating(): Promise<string> {
    const { id } = await credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'Acme',
        definitionSource: 'builtin',
        definitionId: 'custom-connector',
        secret: { fields: { RefreshToken: 'refresh-1', generated_refresh_token: 'rotated-1' } },
      })
    );
    await credentials.update({ id }, { modifiedAt });
    return id;
  }

  const leaseOf = (id: string) =>
    credentials.findOneOrFail({
      where: { id },
      select: { id: true, rotationLeaseId: true, rotationLeaseAt: true, modifiedAt: true },
    });

  it('a second claim waits until release or staleness; claim and release keep modifiedAt', async () => {
    const id = await givenRotating();

    const first = await service.claimRotation(id);
    expect(first).toEqual(expect.any(String));
    expect(await leaseOf(id)).toMatchObject({ rotationLeaseId: first, modifiedAt });
    await expect(service.claimRotation(id)).resolves.toBeNull();

    // Only the holder releases: an older holder's id clears nothing.
    await service.releaseRotation(id, 'an-older-lease');
    await expect(service.claimRotation(id)).resolves.toBeNull();
    await service.releaseRotation(id, first!);
    expect(await leaseOf(id)).toMatchObject({
      rotationLeaseId: null,
      rotationLeaseAt: null,
      modifiedAt,
    });

    const second = await service.claimRotation(id);
    expect(second).toEqual(expect.any(String));
    expect(second).not.toBe(first);

    // A holder that never releases, such as a crashed pod, loses the lease once it is stale.
    await credentials.update(
      { id },
      { rotationLeaseAt: new Date(Date.now() - ROTATION_LEASE_STALE_MS - 1_000), modifiedAt }
    );
    const third = await service.claimRotation(id);
    expect(third).toEqual(expect.any(String));
    expect(third).not.toBe(second);
    expect((await leaseOf(id)).modifiedAt).toEqual(modifiedAt);
  });

  it('a Credential saved after it was loaded keeps the lease taken meanwhile', async () => {
    const id = await givenRotating();
    const loaded = await credentials.findOneByOrFail({ id });

    const leaseId = await service.claimRotation(id);
    await credentials.save({ ...loaded, title: 'Acme renamed' });

    expect((await leaseOf(id)).rotationLeaseId).toBe(leaseId);
    await expect(service.claimRotation(id)).resolves.toBeNull();
  });

  describe('the marker of a refresh token that does not rotate', () => {
    const markerOf = async (id: string) =>
      (await credentials.findOneByOrFail({ id })).refreshTokenStaticAt;

    it('is set once and keeps modifiedAt', async () => {
      const id = await givenRotating();

      await service.markRefreshTokenStatic(id);
      const first = await markerOf(id);
      await service.markRefreshTokenStatic(id);

      expect(first).toEqual(expect.any(Date));
      expect(await markerOf(id)).toEqual(first);
      expect((await leaseOf(id)).modifiedAt).toEqual(modifiedAt);
    });

    it('is cleared by a stored rotated token, not by another secret write', async () => {
      const id = await givenRotating();
      await service.markRefreshTokenStatic(id);

      await service.updateSecretFields(id, 'project-1', { RefreshToken: 'refresh-2' });
      expect(await markerOf(id)).toEqual(expect.any(Date));

      await service.updateSecretFields(id, 'project-1', { generated_refresh_token: 'rotated-2' });
      expect(await markerOf(id)).toBeNull();
    });

    it('a failed mark does not throw', async () => {
      const failing = credentialService(
        {
          createQueryBuilder: () => {
            throw new Error('db down');
          },
        },
        {}
      );

      await expect(failing.markRefreshTokenStatic('credential-1')).resolves.toBeUndefined();
    });
  });

  it('a failed release does not throw', async () => {
    const failing = credentialService(
      {
        createQueryBuilder: () => {
          throw new Error('db down');
        },
      },
      {}
    );

    await expect(failing.releaseRotation('credential-1', 'lease-1')).resolves.toBeUndefined();
  });
});

describe('CredentialService.listEnabledCustomConnectorPublic (SQLite)', () => {
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let service: CredentialService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    credentials = dataSource.getRepository(Credential);
    service = credentialService(credentials, {});
  });

  afterAll(() => dataSource.destroy());

  const given = (title: string, over: Partial<Credential> = {}) =>
    credentials.save(
      credentials.create({
        projectId: 'project-1',
        title,
        definitionSource: 'builtin',
        definitionId: 'custom-connector',
        secret: { fields: { Token: 'top-secret' } },
        publicMetadata: { hosts: ['api.example.com'], fieldList: [], fields: {} },
        enabled: true,
        ...over,
      })
    );

  it('lists a project enabled custom connector Credentials without their secret', async () => {
    const mine = await given('Mine');
    await given('Disabled', { enabled: false });
    await given('Other project', { projectId: 'project-2' });
    await given('Other definition', { definitionId: 'source:FacebookMarketing:oauth2' });
    const gone = await given('Deleted');
    await credentials.softDelete({ id: gone.id });

    const listed = await service.listEnabledCustomConnectorPublic('project-1');

    expect(listed.map(c => c.id)).toEqual([mine.id]);
    expect(listed[0].secret).toBeUndefined();
    expect(JSON.stringify(listed)).not.toContain('top-secret');
  });

  it('selects no secret column', async () => {
    const find = jest.spyOn(credentials, 'find');
    await service.listEnabledCustomConnectorPublic('project-1');
    const select = find.mock.calls[0][0]?.select as Record<string, boolean>;
    expect(Object.keys(select).sort()).toEqual(['definitionId', 'id', 'publicMetadata', 'title']);
    find.mockRestore();
  });
});
