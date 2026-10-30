jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { CREDENTIAL_VALIDATION_ENTITIES } from '../../../test/fixtures/credential-validation-writes';
import { CredentialConsumerBinding } from '../credentials/entities/credential-consumer-binding.entity';
import { CredentialContext } from '../credentials/entities/credential-context.entity';
import { CredentialOwner } from '../credentials/entities/credential-owner.entity';
import { Credential } from '../credentials/entities/credential.entity';
import { CredentialBindingService } from '../credentials/services/credential-binding.service';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialService } from '../credentials/services/credential.service';
import { Context } from '../entities/context.entity';
import { SourceCredentialUnavailableException } from '../exceptions/source-credential-unavailable.exception';
import { Action, EntityType } from '../services/access-decision';
import type { CustomConnectorKeyModel } from './custom-connector-credential-fit';
import { SourceCredentialBindingService } from './source-credential-binding.service';

const SECRET = 'acme-secret-key';

describe('SourceCredentialBindingService', () => {
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let bindings: Repository<CredentialConsumerBinding>;
  let access: { canAccess: jest.Mock; canAccessMany: jest.Mock };
  let sourceCredentials: SourceCredentialBindingService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [...CREDENTIAL_VALIDATION_ENTITIES, CredentialConsumerBinding],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  beforeEach(async () => {
    for (const entity of [
      CredentialConsumerBinding,
      CredentialContext,
      CredentialOwner,
      Credential,
      Context,
    ]) {
      await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    credentials = dataSource.getRepository(Credential);
    bindings = dataSource.getRepository(CredentialConsumerBinding);
    const credentialService = new CredentialService(
      credentials,
      bindings,
      dataSource.getRepository(CredentialOwner),
      dataSource.getRepository(CredentialContext),
      {} as never,
      {} as never
    );
    access = {
      canAccess: jest.fn().mockResolvedValue(true),
      canAccessMany: jest.fn(
        async (_userId: string, _roles: string[], _type: EntityType, ids: string[]) =>
          new Map(ids.map(id => [id, true]))
      ),
    };
    const binder = new CredentialBindingService(
      bindings,
      credentials,
      dataSource.getRepository(CredentialContext),
      access as never,
      credentialService
    );
    sourceCredentials = new SourceCredentialBindingService(
      binder,
      new CredentialDefinitionService({} as never, {} as never),
      access as never,
      credentialService,
      {} as never,
      {} as never
    );
  });

  function givenCredential(overrides: Partial<Credential> = {}): Promise<Credential> {
    return credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'Acme production',
        definitionSource: 'builtin',
        definitionId: 'custom-connector',
        secret: { fields: { ApiKey: SECRET } },
        publicMetadata: {
          hosts: ['api.acme.example'],
          fieldList: [{ key: 'ApiKey', label: 'API key', secret: true }],
          fields: {},
        },
        ...overrides,
      })
    );
  }

  function rows(dataMartId = 'dm-1') {
    return bindings.find({
      where: { consumerType: 'connector-config', consumerId: dataMartId },
      order: { requirementKey: 'ASC' },
    });
  }

  function bind(dataMartId: string, configId: string, credentialId: string): Promise<void> {
    return sourceCredentials.bindConfig({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      dataMartId,
      configId,
      credentialId,
    });
  }

  async function rejection(promise: Promise<unknown>): Promise<Error> {
    const error = await promise.then(
      () => undefined,
      (thrown: unknown) => thrown
    );
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }

  describe('bindConfig', () => {
    it('binds one Credential per configuration', async () => {
      const first = await givenCredential();
      const second = await givenCredential({ title: 'Acme staging' });

      await bind('dm-1', 'cfg-1', first.id);
      await bind('dm-1', 'cfg-2', second.id);
      await bind('dm-1', 'cfg-3', first.id);
      await bind('dm-1', 'cfg-1', second.id);

      expect(await rows()).toEqual([
        expect.objectContaining({ requirementKey: 'cfg-1', credentialId: second.id }),
        expect.objectContaining({ requirementKey: 'cfg-2', credentialId: second.id }),
        expect.objectContaining({ requirementKey: 'cfg-3', credentialId: first.id }),
      ]);
      expect(await rows()).toEqual(
        Array(3).fill(
          expect.objectContaining({
            projectId: 'project-1',
            active: true,
            configuredById: 'user-1',
          })
        )
      );
      await expect(sourceCredentials.boundCredentialIds('project-1', 'dm-1')).resolves.toEqual(
        new Map([
          ['cfg-1', second.id],
          ['cfg-2', second.id],
          ['cfg-3', first.id],
        ])
      );
    });

    it.each([
      ['in another project', { projectId: 'project-2' }],
      ['deleted', { deletedAt: new Date() }],
    ])('refuses a Credential %s', async (_case, overrides) => {
      const credential = await givenCredential(overrides);

      await expect(bind('dm-1', 'cfg-1', credential.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(await rows()).toEqual([]);
    });

    it('refuses when USE is revoked after the check, and writes nothing', async () => {
      const credential = await givenCredential();
      access.canAccess.mockResolvedValueOnce(true).mockResolvedValue(false);
      await sourceCredentials.assertCanUseCredential({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
        credentialId: credential.id,
      });

      await expect(bind('dm-1', 'cfg-1', credential.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await rows()).toEqual([]);
    });

    it('refuses a disabled Credential, and writes nothing', async () => {
      const credential = await givenCredential({ enabled: false });

      await expect(bind('dm-1', 'cfg-1', credential.id)).rejects.toEqual(
        new BadRequestException('This Credential is disabled.')
      );
      expect(await rows()).toEqual([]);
    });
  });

  it('unbind deactivates only that configuration', async () => {
    const credential = await givenCredential();
    await bind('dm-1', 'cfg-1', credential.id);
    await bind('dm-1', 'cfg-2', credential.id);
    const [{ id: rowId }] = await rows();

    await sourceCredentials.unbindConfig('dm-1', 'cfg-1');

    expect((await rows()).map(row => [row.requirementKey, row.active])).toEqual([
      ['cfg-1', false],
      ['cfg-2', true],
    ]);
    await expect(
      sourceCredentials.resolveForConfig('project-1', 'dm-1', 'cfg-1')
    ).resolves.toBeNull();
    await expect(sourceCredentials.boundCredentialIds('project-1', 'dm-1')).resolves.toEqual(
      new Map([['cfg-2', credential.id]])
    );

    await bind('dm-1', 'cfg-1', credential.id);
    expect((await rows())[0]).toEqual(expect.objectContaining({ id: rowId, active: true }));
  });

  it('deactivates every configuration of a Data Mart and no other', async () => {
    const credential = await givenCredential();
    await bind('dm-1', 'cfg-1', credential.id);
    await bind('dm-1', 'cfg-2', credential.id);
    await bind('dm-2', 'cfg-1', credential.id);

    await sourceCredentials.deactivateDataMart('dm-1');

    expect((await rows('dm-1')).map(row => row.active)).toEqual([false, false]);
    expect((await rows('dm-2')).map(row => row.active)).toEqual([true]);
  });

  it("marks only the configuration's binding used", async () => {
    const credential = await givenCredential();
    await bind('dm-1', 'cfg-1', credential.id);
    await bind('dm-1', 'cfg-2', credential.id);

    await sourceCredentials.markConfigUsed('dm-1', 'cfg-2', credential.id);

    expect((await rows()).map(row => [row.requirementKey, row.lastUsedAt !== null])).toEqual([
      ['cfg-1', false],
      ['cfg-2', true],
    ]);
  });

  describe('resolveForConfig', () => {
    it('returns the bound Credential values for the configuration', async () => {
      const credential = await givenCredential();
      await bind('dm-1', 'cfg-1', credential.id);
      access.canAccess.mockClear();

      await expect(
        sourceCredentials.resolveForConfig('project-1', 'dm-1', 'cfg-1')
      ).resolves.toEqual({
        credentialId: credential.id,
        definitionId: 'custom-connector',
        secret: { fields: { ApiKey: SECRET } },
        publicMetadata: credential.publicMetadata,
        refreshTokenStaticAt: null,
      });
      expect(access.canAccess).not.toHaveBeenCalled();
    });

    it('carries the marker of a refresh token that does not rotate, for the lease decision', async () => {
      const credential = await givenCredential();
      const refreshTokenStaticAt = new Date('2026-10-30T00:00:00.000Z');
      await credentials.update({ id: credential.id }, { refreshTokenStaticAt });
      await bind('dm-1', 'cfg-1', credential.id);

      await expect(
        sourceCredentials.resolveForConfig('project-1', 'dm-1', 'cfg-1')
      ).resolves.toMatchObject({ refreshTokenStaticAt });
    });

    it('resolveForConfig returns null for an unbound configuration', async () => {
      const credential = await givenCredential();
      await bind('dm-1', 'cfg-1', credential.id);

      await expect(
        sourceCredentials.resolveForConfig('project-1', 'dm-1', 'cfg-2')
      ).resolves.toBeNull();
      await expect(
        sourceCredentials.resolveForConfig('project-2', 'dm-1', 'cfg-1')
      ).resolves.toBeNull();
    });

    it.each([
      [
        'disabled',
        { enabled: false },
        "This Data Mart's Credential is disabled. Select another Credential, or ask a Credential maintainer to enable it.",
      ],
      [
        'deleted',
        { deletedAt: new Date() },
        "This Data Mart's Credential was deleted. Select another Credential for this Data Mart.",
      ],
      [
        'moved to another project',
        { projectId: 'project-2' },
        "This Data Mart's Credential was deleted. Select another Credential for this Data Mart.",
      ],
    ])(
      'a %s Credential throws SourceCredentialUnavailableException',
      async (_case, change, message) => {
        const credential = await givenCredential();
        await bind('dm-1', 'cfg-1', credential.id);
        await credentials.update({ id: credential.id }, change);

        const error = await rejection(
          sourceCredentials.resolveForConfig('project-1', 'dm-1', 'cfg-1')
        );

        expect(error).toBeInstanceOf(SourceCredentialUnavailableException);
        expect(error).toMatchObject({ message, code: 'SOURCE_CREDENTIAL_UNAVAILABLE' });
        expect(JSON.stringify(error)).not.toContain(SECRET);
      }
    );
  });

  describe('resolveCredential', () => {
    it('returns the Credential values without a binding', async () => {
      const credential = await givenCredential();

      await expect(
        sourceCredentials.resolveCredential('project-1', credential.id)
      ).resolves.toEqual({
        credentialId: credential.id,
        definitionId: 'custom-connector',
        secret: { fields: { ApiKey: SECRET } },
        publicMetadata: credential.publicMetadata,
        refreshTokenStaticAt: null,
      });
    });

    it.each([
      [
        'disabled',
        { enabled: false },
        "This Data Mart's Credential is disabled. Select another Credential, or ask a Credential maintainer to enable it.",
      ],
      ['deleted', { deletedAt: new Date() }, "This Data Mart's Credential was deleted."],
      [
        'in another project',
        { projectId: 'project-2' },
        "This Data Mart's Credential was deleted.",
      ],
    ])(
      'a %s Credential throws SourceCredentialUnavailableException',
      async (_case, change, message) => {
        const credential = await givenCredential(change);

        const error = await rejection(
          sourceCredentials.resolveCredential('project-1', credential.id)
        );

        expect(error).toBeInstanceOf(SourceCredentialUnavailableException);
        expect(error.message).toContain(message);
        expect(JSON.stringify(error)).not.toContain(SECRET);
      }
    );
  });

  describe('summarizeForDataMart', () => {
    function summarize() {
      return sourceCredentials.summarizeForDataMart({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['editor'],
        dataMartId: 'dm-1',
      });
    }

    it('summarizes each bound configuration, restricted where the member cannot see it', async () => {
      const visible = await givenCredential();
      const hidden = await givenCredential({ title: 'Hidden key' });
      await bind('dm-1', 'cfg-1', visible.id);
      await bind('dm-1', 'cfg-2', hidden.id);
      await credentials.update({ id: hidden.id }, { enabled: false });
      access.canAccessMany.mockResolvedValue(
        new Map([
          [visible.id, true],
          [hidden.id, false],
        ])
      );

      const summaries = await summarize();

      expect(summaries).toEqual(
        new Map([
          [
            'cfg-1',
            {
              access: 'visible',
              id: visible.id,
              title: 'Acme production',
              definitionId: 'custom-connector',
              providerName: 'Custom connector',
              identity: 'api.acme.example',
              state: 'ready',
            },
          ],
          ['cfg-2', { access: 'restricted', state: 'disabled' }],
        ])
      );
      expect(access.canAccessMany).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        EntityType.CREDENTIAL,
        expect.arrayContaining([visible.id, hidden.id]),
        Action.SEE,
        'project-1'
      );
    });

    it('leaves out unbound configurations', async () => {
      const credential = await givenCredential();
      await bind('dm-1', 'cfg-1', credential.id);
      await sourceCredentials.unbindConfig('dm-1', 'cfg-1');

      await expect(summarize()).resolves.toEqual(new Map());
    });
  });

  it('lockBoundCredentialId reads the binding of the configuration it names', async () => {
    const first = await givenCredential();
    const second = await givenCredential({ title: 'Acme staging' });
    await bind('dm-1', 'cfg-1', first.id);
    await bind('dm-1', 'cfg-2', second.id);

    await expect(
      sourceCredentials.lockBoundCredentialId('project-1', 'dm-1', 'cfg-2')
    ).resolves.toBe(second.id);
    await expect(
      sourceCredentials.lockBoundCredentialId('project-1', 'dm-1', 'cfg-3')
    ).resolves.toBeNull();
  });

  it('boundCredentialIds maps a configuration whose Credential was deleted to null', async () => {
    const kept = await givenCredential();
    const deleted = await givenCredential({ title: 'Deleted key' });
    await bind('dm-1', 'cfg-1', kept.id);
    await bind('dm-1', 'cfg-2', deleted.id);
    await credentials.softDelete({ id: deleted.id });

    await expect(sourceCredentials.boundCredentialIds('project-1', 'dm-1')).resolves.toEqual(
      new Map([
        ['cfg-1', kept.id],
        ['cfg-2', null],
      ])
    );
  });

  describe('checkConfigCredential', () => {
    const member = { projectId: 'project-1', userId: 'member-1', roles: ['editor'] };
    const model = (allowedHosts: string[]): CustomConnectorKeyModel => ({
      allowedHosts,
      keyParameters: ['ApiKey'],
      keyParameterBranches: null,
      keyParameterMisuse: [],
      parameters: { ApiKey: { isRequired: true } },
    });
    const check = (
      credentialId: string,
      connectorName: string,
      config: Record<string, unknown> = {},
      manifestModel: CustomConnectorKeyModel | null = null
    ) =>
      sourceCredentials.checkConfigCredential({
        ...member,
        credentialId,
        connectorName,
        config,
        model: manifestModel,
      });

    it('checks USE on the Credential first', async () => {
      const credential = await givenCredential({
        definitionId: 'github',
        secret: { value: SECRET },
      });
      access.canAccess.mockResolvedValue(false);

      await expect(check(credential.id, 'GitHub')).rejects.toBeInstanceOf(ForbiddenException);
      expect(access.canAccess).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        EntityType.CREDENTIAL,
        credential.id,
        Action.USE,
        'project-1'
      );
    });

    it("accepts a Credential of the connector's definition", async () => {
      const credential = await givenCredential({
        definitionId: 'github',
        secret: { value: SECRET },
      });

      await expect(check(credential.id, 'GitHub')).resolves.toBeUndefined();
    });

    it('refuses a definition the connector does not accept', async () => {
      const credential = await givenCredential({
        definitionId: 'github',
        secret: { value: SECRET },
      });

      const error = await rejection(check(credential.id, 'OpenExchangeRates'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('This Credential cannot be used with this connector.');
    });

    it('refuses a Credential of another auth variant than the configuration selects', async () => {
      const credential = await givenCredential({
        definitionId: 'source:GoogleAds:oauth2',
        secret: { fields: { ClientSecret: SECRET } },
        publicMetadata: null,
      });

      await expect(
        check(credential.id, 'GoogleAds', { AuthType: { service_account: {} } })
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        check(credential.id, 'GoogleAds', { AuthType: { oauth2: {} } })
      ).resolves.toBeUndefined();
    });

    it('refuses a custom connector Credential that does not fit the version the Data Mart runs', async () => {
      const credential = await givenCredential();

      await expect(
        check(credential.id, 'AcmeApi', {}, model(['api.other.example']))
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        check(credential.id, 'AcmeApi', {}, model(['api.acme.example']))
      ).resolves.toBeUndefined();
    });

    it("fits a selective manifest on its selection's default when the configuration leaves it empty", async () => {
      const credential = await givenCredential();
      const selective: CustomConnectorKeyModel = {
        ...model(['api.acme.example']),
        keyParameters: ['ApiKey', 'ClientSecret'],
        keyParameterBranches: { key: ['ApiKey'], oauth2: ['ClientSecret'] },
        parameters: {
          AuthType: { default: 'key' },
          ApiKey: { isRequired: true },
          ClientSecret: { isRequired: true },
        },
        authentication: { selectionParameter: 'AuthType' },
      };

      await expect(check(credential.id, 'AcmeApi', {}, selective)).resolves.toBeUndefined();
      await expect(
        check(credential.id, 'AcmeApi', { AuthType: '' }, selective)
      ).resolves.toBeUndefined();
      await expect(
        check(credential.id, 'AcmeApi', { AuthType: 'oauth2' }, selective)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('names the misuse when the version misuses a key parameter, as a run does', async () => {
      const credential = await givenCredential();
      const misusing = {
        ...model(['api.acme.example']),
        keyParameterMisuse: [
          { parameter: 'ApiKey', node: 'items', position: 'transformations.add' as const },
        ],
      };

      const error = await rejection(check(credential.id, 'AcmeApi', {}, misusing));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(
        'Key parameter "ApiKey" cannot be used in transformations.add of node "items"'
      );
    });

    it('refuses a built-in Credential for a custom connector', async () => {
      const credential = await givenCredential({
        definitionId: 'github',
        secret: { value: SECRET },
      });

      await expect(
        check(credential.id, 'AcmeApi', {}, model(['api.acme.example']))
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('checkKeptConfigCredential', () => {
      const NO_LONGER_FITS =
        "This Data Mart's Credential no longer fits its connector. Select a fitting Credential.";
      const kept = (
        credentialId: string,
        connectorName: string,
        config: Record<string, unknown>,
        manifestModel: CustomConnectorKeyModel | null
      ) =>
        sourceCredentials.checkKeptConfigCredential({
          projectId: 'project-1',
          credentialId,
          connectorName,
          config,
          model: manifestModel,
        });

      it('refuses a kept Credential that no longer fits with the fixed copy, without a USE check', async () => {
        const credential = await givenCredential();
        const oauth = await givenCredential({
          definitionId: 'source:GoogleAds:oauth2',
          secret: { fields: { ClientSecret: SECRET } },
          publicMetadata: null,
        });
        access.canAccess.mockResolvedValue(false);

        const misfit = await rejection(
          kept(credential.id, 'AcmeApi', {}, model(['api.x.example']))
        );
        const variant = await rejection(
          kept(oauth.id, 'GoogleAds', { AuthType: { service_account: {} } }, null)
        );

        expect(misfit).toBeInstanceOf(BadRequestException);
        expect(misfit.message).toBe(NO_LONGER_FITS);
        expect(variant.message).toBe(NO_LONGER_FITS);
        await expect(
          kept(credential.id, 'AcmeApi', {}, model(['api.acme.example']))
        ).resolves.toBeUndefined();
        expect(access.canAccess).not.toHaveBeenCalled();
      });

      it('leaves a deleted Credential to the run', async () => {
        await expect(
          kept('deleted-credential', 'AcmeApi', {}, model(['api.acme.example']))
        ).resolves.toBeUndefined();
      });
    });
  });

  it('assertCanUseCredential refuses a member without USE on the Credential', async () => {
    const credential = await givenCredential();
    access.canAccess.mockResolvedValue(false);

    await expect(
      sourceCredentials.assertCanUseCredential({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['viewer'],
        credentialId: credential.id,
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.canAccess).toHaveBeenCalledWith(
      'member-1',
      ['viewer'],
      EntityType.CREDENTIAL,
      credential.id,
      Action.USE,
      'project-1'
    );
  });
});
