jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateDataMartDefinitionService } from './update-data-mart-definition.service';
import { ConnectorService } from '../services/connector/connector.service';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { passThroughSqlReferenceValidator } from '../sql-references/__fixtures__/pass-through-sql-reference-resolver';
import { SECRET_MASK } from '../services/connector/connector-secret.service';

const OUT_OF_DATE = 'This page is out of date. Reload it.';

/** Bindings by configuration id; a null Credential was deleted. */
function sourceCredentialsMock(bound: Record<string, string | null> = {}) {
  const lockedIds: Record<string, string> = {};
  for (const [configId, credentialId] of Object.entries(bound)) {
    lockedIds[configId] = credentialId ?? 'deleted-credential';
  }
  return {
    boundCredentialIds: jest.fn().mockResolvedValue(new Map(Object.entries(bound))),
    lockBoundCredentialId: jest.fn(
      async (_projectId: string, _dataMartId: string, configId: string): Promise<string | null> =>
        lockedIds[configId] ?? null
    ),
    checkConfigCredential: jest.fn().mockResolvedValue(undefined),
    checkKeptConfigCredential: jest.fn().mockResolvedValue(undefined),
    bindConfig: jest.fn().mockResolvedValue(undefined),
    unbindConfig: jest.fn().mockResolvedValue(undefined),
    deactivateDataMart: jest.fn().mockResolvedValue(undefined),
  };
}

describe('UpdateDataMartDefinitionService', () => {
  const createService = (
    overrides: {
      definitionType?: DataMartDefinitionType;
      definition?: unknown;
      storageType?: DataStorageType;
      sqlReferenceValidator?: { prepareForSave: jest.Mock };
      bound?: Record<string, string | null>;
    } = {}
  ) => {
    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
      createdById: 'user-1',
      storage: {
        id: 'storage-1',
        type: overrides.storageType ?? DataStorageType.GOOGLE_BIGQUERY,
      },
      definitionType: overrides.definitionType as DataMartDefinitionType | undefined,
      definition: overrides.definition as any,
    };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }),
    };
    const connectorSecretService = {
      mergeDefinitionSecrets: jest.fn(),
      extractAndSaveSecrets: jest.fn(),
      deleteOrphanedSecrets: jest.fn(),
      hasTypedSecrets: jest.fn().mockResolvedValue(false),
    };
    const legacyDataMartsService = {
      updateQuery: jest.fn(),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const eventDispatcher = {
      publishExternal: jest.fn(),
    };
    const connectorService = {
      resolveConnectorCapabilities: jest.fn().mockResolvedValue({
        singleConfiguration: false,
        copySecretsByValue: false,
      }),
      resolveSourceKeys: jest.fn().mockResolvedValue({ fields: [], model: null }),
    };
    const sourceCredentials = sourceCredentialsMock(overrides.bound);
    const definitionValidatorFacade = {
      checkIsValid: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UpdateDataMartDefinitionService(
      dataMartService as any,
      mapper as any,
      connectorSecretService as any,
      legacyDataMartsService as any,
      accessDecisionService as any,
      definitionValidatorFacade as any,
      eventDispatcher as any,
      connectorService as any,
      (overrides.sqlReferenceValidator ?? passThroughSqlReferenceValidator) as never,
      sourceCredentials as any
    );

    return {
      legacyDataMartsService,
      service,
      dataMartService,
      accessDecisionService,
      connectorSecretService,
      definitionValidatorFacade,
      eventDispatcher,
      connectorService,
      sourceCredentials,
      dataMart,
    };
  };

  const commandFor = (
    definitionType: DataMartDefinitionType,
    definition: unknown
  ): UpdateDataMartDefinitionCommand =>
    new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      definitionType,
      definition as never,
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    DataMartDefinitionType.TABLE,
    DataMartDefinitionType.VIEW,
    DataMartDefinitionType.TABLE_PATTERN,
  ])(
    'should succeed when saving a %s definition type without performing storage validation',
    async definitionType => {
      const { service, dataMartService, dataMart } = createService();
      const definition = {
        tableName: 'my_table',
      };
      const command = new UpdateDataMartDefinitionCommand(
        'dm-1',
        'proj-1',
        definitionType,
        definition,
        undefined,
        undefined,
        'user-1',
        ['editor']
      );

      const result = await service.run(command);

      expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'proj-1');
      expect(dataMart.definitionType).toBe(definitionType);
      expect(dataMart.definition).toBe(definition);
      expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
      expect(result).toEqual({ id: 'dm-1' });
    }
  );

  it('cleans up orphaned secrets against the definition that was actually saved', async () => {
    const { service, connectorSecretService, dataMart } = createService();

    const previousDefinition = {
      connector: {
        source: { name: 'FacebookMarketing', configuration: [{ _id: 'c-1', _secrets_id: 'old' }] },
      },
    };
    dataMart.definitionType = DataMartDefinitionType.CONNECTOR;
    dataMart.definition = previousDefinition;

    const merged = {
      connector: { source: { name: 'FacebookMarketing', configuration: [{ _id: 'c-2' }] } },
    };
    // What extractAndSaveSecrets returns is what gets stored, so it is also
    // what cleanup must be compared against.
    const savedDefinition = {
      connector: {
        source: { name: 'FacebookMarketing', configuration: [{ _id: 'c-2', _secrets_id: 'new' }] },
      },
    };
    connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(merged);
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue(savedDefinition);

    const incomingDefinition = {
      connector: { source: { name: 'FacebookMarketing', configuration: [{ _id: 'c-2' }] } },
    };
    await service.run(commandFor(DataMartDefinitionType.CONNECTOR, incomingDefinition));

    expect(connectorSecretService.mergeDefinitionSecrets).toHaveBeenCalledWith(
      'proj-1',
      incomingDefinition,
      previousDefinition
    );
    expect(connectorSecretService.deleteOrphanedSecrets).toHaveBeenCalledWith(
      'dm-1',
      savedDefinition,
      previousDefinition
    );
    expect(dataMart.definition).toBe(savedDefinition);
  });

  describe('Data Mart references in SQL', () => {
    const sqlWithReference = 'SELECT * FROM [Old title](dm:aaaaaaaa-0000-4000-8000-000000000002) o';

    it('saves the query the reference check returns', async () => {
      const sqlReferenceValidator = {
        prepareForSave: jest.fn().mockResolvedValue('SELECT * FROM [Orders](dm:…) o'),
      };
      const { service, dataMartService, dataMart } = createService({
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
        sqlReferenceValidator,
      });

      await service.run(commandFor(DataMartDefinitionType.SQL, { sqlQuery: sqlWithReference }));

      expect(sqlReferenceValidator.prepareForSave).toHaveBeenCalledWith({
        dataMart,
        sqlQuery: sqlWithReference,
        userId: 'user-1',
        roles: ['editor'],
      });
      expect(dataMartService.save).toHaveBeenCalledWith(
        expect.objectContaining({ definition: { sqlQuery: 'SELECT * FROM [Orders](dm:…) o' } })
      );
    });

    it('refuses an unusable reference before a legacy storage receives the query', async () => {
      const sqlReferenceValidator = {
        prepareForSave: jest
          .fn()
          .mockRejectedValue(
            new BusinessViolationException('Data Mart references are not supported')
          ),
      };
      const { service, dataMartService, legacyDataMartsService } = createService({
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
        storageType: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
        sqlReferenceValidator,
      });

      await expect(
        service.run(commandFor(DataMartDefinitionType.SQL, { sqlQuery: sqlWithReference }))
      ).rejects.toThrow('Data Mart references are not supported');
      expect(legacyDataMartsService.updateQuery).not.toHaveBeenCalled();
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('does not check references for a non-SQL definition', async () => {
      const sqlReferenceValidator = { prepareForSave: jest.fn() };
      const { service } = createService({ sqlReferenceValidator });

      await service.run(commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'p.d.t' }));

      expect(sqlReferenceValidator.prepareForSave).not.toHaveBeenCalled();
    });
  });

  it('should throw ForbiddenException when user has no edit access to data mart', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccess.mockResolvedValue(false);

    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.TABLE,
      { tableName: 'my_table' },
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('rejects multiple configurations when the connector requires exactly one', async () => {
    const { service, dataMartService, connectorService } = createService();
    connectorService.resolveConnectorCapabilities.mockResolvedValue({
      singleConfiguration: true,
      copySecretsByValue: false,
    });
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      {
        connector: {
          source: {
            name: 'SingleConfigurationConnector',
            node: 'sheet',
            fields: ['name'],
            configuration: [{ _id: 'config-1' }, { _id: 'config-2' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(BadRequestException);
    expect(dataMartService.save).not.toHaveBeenCalled();
  });

  it('keeps multiple configurations available when the connector allows them', async () => {
    const { service, dataMartService, dataMart } = createService();
    const definition = {
      connector: {
        source: {
          name: 'GoogleAds',
          node: 'campaigns',
          fields: ['id'],
          configuration: [{ _id: 'config-1' }, { _id: 'config-2' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      definition,
      undefined,
      undefined,
      'user-1',
      ['editor']
    );
    const connectorSecretService = service['connectorSecretService'] as any;
    connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(definition);
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue(definition);

    await service.run(command);

    expect(dataMart.definition).toBe(definition);
    expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
  });

  describe('Source credentials', () => {
    const KEY_FIELDS = [{ path: [], parameters: ['AccessToken'] }];

    const connectorDefinition = (configuration: Array<Record<string, unknown>>) => ({
      connector: {
        source: { name: 'GitHub', configuration, node: 'stars', fields: ['date'] },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    });

    /** A GitHub Data Mart with `previous` stored and `bound` bindings; merge and extract pass through. */
    const givenDataMart = (
      previous: Array<Record<string, unknown>> | null,
      bound: Record<string, string | null> = {}
    ) => {
      const harness = createService(
        previous
          ? {
              definitionType: DataMartDefinitionType.CONNECTOR,
              definition: connectorDefinition(previous),
              bound,
            }
          : { bound }
      );
      harness.connectorService.resolveSourceKeys.mockResolvedValue({
        fields: KEY_FIELDS,
        model: null,
      });
      harness.connectorSecretService.mergeDefinitionSecrets.mockImplementation(
        async (_projectId: string, incoming: any) => incoming
      );
      harness.connectorSecretService.extractAndSaveSecrets.mockImplementation(
        async (_id: string, _projectId: string, _name: string, definition: any) => definition
      );
      const save = (configuration: Array<Record<string, unknown>>) =>
        harness.service.run(
          commandFor(DataMartDefinitionType.CONNECTOR, connectorDefinition(configuration))
        );
      const stored = () =>
        (harness.dataMart.definition as ReturnType<typeof connectorDefinition>).connector.source
          .configuration;
      return { ...harness, save, stored };
    };

    it('binds _credential_id per configuration after checking USE', async () => {
      const { save, sourceCredentials } = givenDataMart(null);

      await save([
        { _id: 'c-1', _credential_id: 'cred-1', RepositoryName: 'a/b' },
        { _id: 'c-2', _credential_id: 'cred-2', RepositoryName: 'c/d' },
      ]);

      expect(sourceCredentials.checkConfigCredential).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: 'user-1',
        roles: ['editor'],
        credentialId: 'cred-1',
        connectorName: 'GitHub',
        config: expect.objectContaining({ _id: 'c-1' }),
        model: null,
      });
      expect(sourceCredentials.bindConfig.mock.calls).toEqual([
        [
          {
            projectId: 'proj-1',
            userId: 'user-1',
            roles: ['editor'],
            dataMartId: 'dm-1',
            configId: 'c-1',
            credentialId: 'cred-1',
          },
        ],
        [
          {
            projectId: 'proj-1',
            userId: 'user-1',
            roles: ['editor'],
            dataMartId: 'dm-1',
            configId: 'c-2',
            credentialId: 'cred-2',
          },
        ],
      ]);
      expect(sourceCredentials.checkConfigCredential.mock.invocationCallOrder[0]).toBeLessThan(
        sourceCredentials.bindConfig.mock.invocationCallOrder[0]
      );
      expect(sourceCredentials.lockBoundCredentialId).toHaveBeenCalledWith('proj-1', 'dm-1', 'c-1');
    });

    it('binds nothing when the Credential check refuses it', async () => {
      const { save, sourceCredentials, dataMartService } = givenDataMart(null);
      sourceCredentials.checkConfigCredential.mockRejectedValue(
        new ForbiddenException('You cannot use this Credential.')
      );

      await expect(save([{ _id: 'c-1', _credential_id: 'cred-1' }])).rejects.toThrow(
        ForbiddenException
      );
      expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('keeps an unchanged _credential_id without USE', async () => {
      const { save, sourceCredentials, dataMartService } = givenDataMart(
        [{ _id: 'c-1', RepositoryName: 'a/b' }],
        { 'c-1': 'cred-1' }
      );

      await save([{ _id: 'c-1', _credential_id: 'cred-1', RepositoryName: 'a/c' }]);

      expect(sourceCredentials.checkConfigCredential).not.toHaveBeenCalled();
      expect(sourceCredentials.checkKeptConfigCredential).not.toHaveBeenCalled();
      expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
      expect(dataMartService.save).toHaveBeenCalled();
    });

    describe('a kept Credential is re-checked, without USE, when what it must fit changes', () => {
      const NO_LONGER_FITS =
        "This Data Mart's Credential no longer fits its connector. Select a fitting Credential.";
      const selective = {
        allowedHosts: ['api.acme.example'],
        keyParameters: ['AccessToken'],
        keyParameterBranches: { token: ['AccessToken'], open: [] },
        keyParameterMisuse: [],
        parameters: { AuthMode: { default: 'token' }, AccessToken: { isRequired: true } },
        authentication: { selectionParameter: 'AuthMode' },
      };

      it('refuses a connector version the Credential no longer fits', async () => {
        const { service, sourceCredentials, connectorService, dataMartService } = givenDataMart(
          [{ _id: 'c-1' }],
          { 'c-1': 'cred-1' }
        );
        connectorService.resolveSourceKeys.mockResolvedValue({
          fields: KEY_FIELDS,
          model: selective,
        });
        sourceCredentials.checkKeptConfigCredential.mockRejectedValue(
          new BadRequestException(NO_LONGER_FITS)
        );
        const definition = connectorDefinition([{ _id: 'c-1', _credential_id: 'cred-1' }]);

        await expect(
          service.run(
            commandFor(DataMartDefinitionType.CONNECTOR, {
              ...definition,
              connector: {
                ...definition.connector,
                source: { ...definition.connector.source, version: 2 },
              },
            })
          )
        ).rejects.toThrow(NO_LONGER_FITS);
        expect(sourceCredentials.checkKeptConfigCredential).toHaveBeenCalledWith({
          projectId: 'proj-1',
          credentialId: 'cred-1',
          connectorName: 'GitHub',
          config: expect.objectContaining({ _id: 'c-1' }),
          model: selective,
        });
        expect(sourceCredentials.checkConfigCredential).not.toHaveBeenCalled();
        expect(dataMartService.save).not.toHaveBeenCalled();
      });

      it('on another selective branch, read with its default', async () => {
        const { save, sourceCredentials, connectorService } = givenDataMart(
          [{ _id: 'c-1', AuthMode: 'token' }],
          { 'c-1': 'cred-1' }
        );
        connectorService.resolveSourceKeys.mockResolvedValue({
          fields: KEY_FIELDS,
          model: selective,
        });

        await save([{ _id: 'c-1', _credential_id: 'cred-1', AuthMode: '' }]);
        expect(sourceCredentials.checkKeptConfigCredential).not.toHaveBeenCalled();

        await save([{ _id: 'c-1', _credential_id: 'cred-1', AuthMode: 'open' }]);
        expect(sourceCredentials.checkKeptConfigCredential).toHaveBeenCalledWith(
          expect.objectContaining({ credentialId: 'cred-1', model: selective })
        );
      });

      it('on another auth variant', async () => {
        const { save, sourceCredentials, connectorService } = givenDataMart(
          [{ _id: 'c-1', AuthType: { oauth2: {} } }],
          { 'c-1': 'cred-oauth' }
        );
        connectorService.resolveSourceKeys.mockResolvedValue({
          fields: [
            { path: ['AuthType', 'oauth2'], parameters: ['RefreshToken'] },
            { path: ['AuthType', 'service_account'], parameters: ['ServiceAccountKey'] },
          ],
          model: null,
        });

        await save([{ _id: 'c-1', _credential_id: 'cred-oauth', AuthType: { oauth2: {} } }]);
        expect(sourceCredentials.checkKeptConfigCredential).not.toHaveBeenCalled();

        await save([
          { _id: 'c-1', _credential_id: 'cred-oauth', AuthType: { service_account: {} } },
        ]);
        expect(sourceCredentials.checkKeptConfigCredential).toHaveBeenCalledWith(
          expect.objectContaining({ credentialId: 'cred-oauth', model: null })
        );
      });
    });

    it('removing a configuration unbinds it', async () => {
      const { save, sourceCredentials } = givenDataMart([{ _id: 'c-1' }, { _id: 'c-2' }], {
        'c-1': 'cred-1',
        'c-2': 'cred-2',
      });

      await save([{ _id: 'c-1', _credential_id: 'cred-1' }]);

      expect(sourceCredentials.unbindConfig.mock.calls).toEqual([['dm-1', 'c-2']]);
    });

    it('unbinds a live binding whose configuration an N-1 save removed', async () => {
      const { save, sourceCredentials } = givenDataMart([{ _id: 'c-1' }], {
        'c-1': 'cred-1',
        'c-2': 'cred-2',
      });

      await save([{ _id: 'c-1', _credential_id: 'cred-1' }]);

      expect(sourceCredentials.unbindConfig.mock.calls).toEqual([['dm-1', 'c-2']]);
    });

    it('unbinds the binding of a connector an N-1 save switched away from', async () => {
      const { save, sourceCredentials } = givenDataMart([{ _id: 'c-new', _secrets_id: 'row-1' }], {
        'c-old': 'cred-old',
      });

      await save([{ _id: 'c-new', _secrets_id: 'row-1' }]);

      expect(sourceCredentials.deactivateDataMart).not.toHaveBeenCalled();
      expect(sourceCredentials.unbindConfig.mock.calls).toEqual([['dm-1', 'c-old']]);
    });

    it('two configurations whose ids differ only in case or accents are out of date', async () => {
      const { save, sourceCredentials, dataMartService } = givenDataMart(null);

      await expect(
        save([
          { _id: 'main', _credential_id: 'cred-1' },
          { _id: 'Máin', _credential_id: 'cred-2' },
        ])
      ).rejects.toThrow(OUT_OF_DATE);
      expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('two configurations whose ids differ only by a ligature are out of date', async () => {
      const { save, dataMartService } = givenDataMart(null);

      await expect(
        save([
          { _id: 'file', _credential_id: 'cred-1' },
          { _id: '\uFB01le', _credential_id: 'cred-2' },
        ])
      ).rejects.toThrow(OUT_OF_DATE);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('a spelling-only _id change of a bound configuration is out of date where the index folds case', async () => {
      const { save, sourceCredentials, dataMartService } = givenDataMart(
        [{ _id: 'Main', _secrets_id: 'row-1' }],
        { Main: 'cred-1' }
      );
      // The binding index compares without case, as MySQL does.
      sourceCredentials.lockBoundCredentialId.mockImplementation(
        async (_projectId: string, _dataMartId: string, configId: string) =>
          configId.toLowerCase() === 'main' ? 'cred-1' : null
      );

      await expect(
        save([{ _id: 'main', _credential_id: 'cred-1', _secrets_id: 'row-1' }])
      ).rejects.toThrow(OUT_OF_DATE);
      expect(sourceCredentials.unbindConfig).not.toHaveBeenCalled();
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('a spelling-only _id change of a bound configuration is out of date where the index is binary', async () => {
      const { save, sourceCredentials, dataMartService } = givenDataMart([{ _id: 'Main' }], {
        Main: 'cred-1',
      });

      await expect(save([{ _id: 'main' }])).rejects.toThrow(OUT_OF_DATE);
      expect(sourceCredentials.unbindConfig).not.toHaveBeenCalled();
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('a spelling-only _id change of an unbound configuration keeps its one previous item', async () => {
      const { save, stored } = givenDataMart([{ _id: 'Main', _secrets_id: 'row-1' }]);

      await save([{ _id: 'main', _secrets_id: 'row-1' }]);

      expect(stored()).toEqual([{ _id: 'main', _secrets_id: 'row-1' }]);
    });

    it('an id that matches two stored items only when folded has no previous item', async () => {
      const { save, dataMartService } = givenDataMart([
        { _id: 'Main', _secrets_id: 'row-B' },
        { _id: 'main', _secrets_id: 'row-A' },
      ]);

      await expect(save([{ _id: 'MAIN', _secrets_id: 'row-B' }])).rejects.toThrow(OUT_OF_DATE);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('the stored definition holds no _credential_id and no key values; old key references stay', async () => {
      const { save, stored } = givenDataMart(
        [
          {
            _id: 'c-1',
            _secrets_id: 'old-row',
            AuthType: { oauth2: { _source_credential_id: 'oauth-row' } },
          },
        ],
        { 'c-1': 'cred-1' }
      );

      // As a GET returns it: the variant without its old reference.
      await save([
        { _id: 'c-1', _credential_id: 'cred-1', AuthType: { oauth2: {} }, RepositoryName: 'a/b' },
      ]);

      expect(stored()).toEqual([
        {
          _id: 'c-1',
          _secrets_id: 'old-row',
          AuthType: { oauth2: { _source_credential_id: 'oauth-row' } },
          RepositoryName: 'a/b',
        },
      ]);
    });

    it.each([
      ['a rebind to another Credential', { 'c-1': 'cred-a' }],
      ['a first binding', {}],
    ])('%s stores no old key references', async (_case, bound: Record<string, string>) => {
      const { save, stored } = givenDataMart(
        [
          {
            _id: 'c-1',
            _secrets_id: 'old-row',
            AuthType: { oauth2: { _source_credential_id: 'oauth-row' } },
          },
        ],
        bound
      );

      await save([
        {
          _id: 'c-1',
          _secrets_id: 'old-row',
          _credential_id: 'cred-b',
          AuthType: { oauth2: {} },
          RepositoryName: 'a/b',
        },
      ]);

      expect(stored()).toEqual([{ _id: 'c-1', AuthType: { oauth2: {} }, RepositoryName: 'a/b' }]);
    });

    it('one save keeps the old key references of an unchanged binding and drops a rebound one', async () => {
      const { save, stored } = givenDataMart(
        [
          { _id: 'c-1', _secrets_id: 'row-1' },
          { _id: 'c-2', _secrets_id: 'row-2' },
        ],
        { 'c-1': 'cred-1', 'c-2': 'cred-2' }
      );

      await save([
        { _id: 'c-1', _credential_id: 'cred-1', RepositoryName: 'a/b' },
        { _id: 'c-2', _credential_id: 'cred-3', RepositoryName: 'c/d' },
      ]);

      expect(stored()).toEqual([
        { _id: 'c-1', _secrets_id: 'row-1', RepositoryName: 'a/b' },
        { _id: 'c-2', RepositoryName: 'c/d' },
      ]);
    });

    it.each([
      ['sourceDataMartId', { sourceDataMartId: 'dm-source' }, [{ _id: 'c-1' }]],
      ['_copiedFrom', {}, [{ _copiedFrom: { configId: 'src-1' }, _credential_id: 'cred-1' }]],
      [
        '_source_credential_id',
        {},
        [{ _id: 'c-1', AuthType: { oauth2: { _source_credential_id: 'oauth-row' } } }],
      ],
      ['another _secrets_id', {}, [{ _id: 'c-1', _secrets_id: 'foreign-row' }]],
      [
        'key values beside _credential_id',
        {},
        [{ _id: 'c-1', _credential_id: 'cred-1', AccessToken: SECRET_MASK }],
      ],
    ])(
      'rejects %s with "This page is out of date. Reload it."',
      async (_case, request: Record<string, unknown>, configuration) => {
        const { service, sourceCredentials, dataMartService } = givenDataMart([
          { _id: 'c-1', _secrets_id: 'own-row' },
        ]);
        const command = new UpdateDataMartDefinitionCommand(
          'dm-1',
          'proj-1',
          DataMartDefinitionType.CONNECTOR,
          connectorDefinition(configuration) as never,
          request.sourceDataMartId as string | undefined,
          undefined,
          'user-1',
          ['editor']
        );

        await expect(service.run(command)).rejects.toThrow(new BadRequestException(OUT_OF_DATE));
        expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
        expect(dataMartService.save).not.toHaveBeenCalled();
      }
    );

    it('rejects non-masked key values with "This page is out of date. Reload it."', async () => {
      const { save, connectorSecretService, dataMartService } = givenDataMart([
        { _id: 'c-1', _secrets_id: 'own-row' },
      ]);
      connectorSecretService.hasTypedSecrets.mockResolvedValue(true);

      await expect(save([{ _id: 'c-1', AccessToken: 'typed' }])).rejects.toThrow(OUT_OF_DATE);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('keeps a previous _secrets_id unchanged and runs on it', async () => {
      const { save, stored, sourceCredentials } = givenDataMart([
        { _id: 'c-1', _secrets_id: 'own-row', AccessToken: SECRET_MASK, RepositoryName: 'a/b' },
      ]);

      await save([
        { _id: 'c-1', _secrets_id: 'own-row', AccessToken: SECRET_MASK, RepositoryName: 'a/c' },
      ]);

      expect(stored()).toEqual([
        { _id: 'c-1', _secrets_id: 'own-row', AccessToken: SECRET_MASK, RepositoryName: 'a/c' },
      ]);
      expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
      expect(sourceCredentials.unbindConfig).not.toHaveBeenCalled();
    });

    it('keeps a previous _source_credential_id unchanged', async () => {
      const oauth = { AuthType: { oauth2: { _source_credential_id: 'oauth-row' } } };
      const { save, stored, sourceCredentials } = givenDataMart([{ _id: 'c-1', ...oauth }]);

      await save([{ _id: 'c-1', ...oauth, RepositoryName: 'a/b' }]);

      expect(stored()).toEqual([{ _id: 'c-1', ...oauth, RepositoryName: 'a/b' }]);
      expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
    });

    it('switching the auth variant keeps no stray variant and a later Credential change is accepted', async () => {
      const { service, connectorService, sourceCredentials, dataMart, save, stored } =
        givenDataMart(
          [{ _id: 'c-1', AuthType: { oauth2: { _source_credential_id: 'oauth-row' } } }],
          {
            'c-1': 'cred-oauth',
          }
        );
      connectorService.resolveSourceKeys.mockResolvedValue({
        fields: [
          { path: ['AuthType', 'oauth2'], parameters: ['ClientId', 'RefreshToken'] },
          { path: ['AuthType', 'service_account'], parameters: ['ServiceAccountKey'] },
        ],
        model: null,
      });

      await save([
        { _id: 'c-1', _credential_id: 'cred-service', AuthType: { service_account: {} } },
      ]);
      expect(stored()).toEqual([{ _id: 'c-1', AuthType: { service_account: {} } }]);

      sourceCredentials.lockBoundCredentialId.mockResolvedValue('cred-service');
      sourceCredentials.boundCredentialIds.mockResolvedValue(new Map([['c-1', 'cred-service']]));
      sourceCredentials.checkConfigCredential.mockClear();
      await service.run(
        commandFor(DataMartDefinitionType.CONNECTOR, {
          ...dataMart.definition,
          connector: {
            ...dataMart.definition.connector,
            source: {
              ...dataMart.definition.connector.source,
              configuration: [{ ...stored()[0], _credential_id: 'cred-service-2' }],
            },
          },
        })
      );

      // The only variant left is the one the new Credential's check accepts.
      expect(sourceCredentials.checkConfigCredential).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: 'cred-service-2',
          config: expect.objectContaining({ AuthType: { service_account: {} } }),
        })
      );
      expect(sourceCredentials.bindConfig).toHaveBeenLastCalledWith({
        projectId: 'proj-1',
        userId: 'user-1',
        roles: ['editor'],
        dataMartId: 'dm-1',
        configId: 'c-1',
        credentialId: 'cred-service-2',
      });
    });

    it('an existing configuration with inline key values saved unchanged is accepted', async () => {
      const { save, stored, sourceCredentials } = givenDataMart([
        { _id: 'c-1', AccessToken: 'inline-key', RepositoryName: 'a/b' },
      ]);

      await save([{ _id: 'c-1', AccessToken: 'inline-key', RepositoryName: 'a/c' }]);

      expect(stored()).toEqual([{ _id: 'c-1', AccessToken: 'inline-key', RepositoryName: 'a/c' }]);
      expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
    });

    it('changed inline key values on an existing configuration are out of date', async () => {
      const { save, dataMartService } = givenDataMart([
        { _id: 'c-1', AccessToken: 'inline-key', RepositoryName: 'a/b' },
      ]);

      await expect(
        save([{ _id: 'c-1', AccessToken: 'another-key', RepositoryName: 'a/b' }])
      ).rejects.toThrow(OUT_OF_DATE);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('a new configuration without a Credential is still rejected', async () => {
      const { save, dataMartService } = givenDataMart([
        { _id: 'c-1', AccessToken: 'inline-key', RepositoryName: 'a/b' },
      ]);

      await expect(
        save([
          { _id: 'c-1', AccessToken: 'inline-key', RepositoryName: 'a/b' },
          { RepositoryName: 'c/d' },
        ])
      ).rejects.toThrow('Select a Credential for each configuration.');
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('a new configuration without _credential_id and without a previous old row is rejected', async () => {
      const { save, dataMartService } = givenDataMart([{ _id: 'c-1' }], { 'c-1': 'cred-1' });

      await expect(
        save([{ _id: 'c-1', _credential_id: 'cred-1' }, { RepositoryName: 'a/b' }])
      ).rejects.toThrow('Select a Credential for each configuration.');
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('a connector without key fields needs no Credential', async () => {
      const { save, connectorService, dataMartService } = givenDataMart(null);
      connectorService.resolveSourceKeys.mockResolvedValue({ fields: [], model: null });

      await save([{ Currencies: 'USD' }]);

      expect(dataMartService.save).toHaveBeenCalled();
    });

    it('a stale page that drops the _credential_id of a live binding is out of date', async () => {
      const { save, dataMartService } = givenDataMart([{ _id: 'c-1' }], { 'c-1': 'cred-1' });

      await expect(save([{ _id: 'c-1', RepositoryName: 'a/b' }])).rejects.toThrow(OUT_OF_DATE);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('keeps the binding of a configuration whose Credential was deleted', async () => {
      const { save, stored, sourceCredentials } = givenDataMart(
        [{ _id: 'c-1', _secrets_id: 'old-row' }],
        { 'c-1': null }
      );

      await save([{ _id: 'c-1', RepositoryName: 'a/b' }]);

      expect(sourceCredentials.bindConfig).not.toHaveBeenCalled();
      expect(sourceCredentials.unbindConfig).not.toHaveBeenCalled();
      expect(stored()).toEqual([{ _id: 'c-1', _secrets_id: 'old-row', RepositoryName: 'a/b' }]);
    });

    it('a request switching the connector drops every binding and checks each Credential', async () => {
      const { service, sourceCredentials } = givenDataMart([{ _id: 'c-1' }], { 'c-1': 'cred-1' });
      sourceCredentials.lockBoundCredentialId.mockResolvedValue(null);
      const definition = connectorDefinition([{ _id: 'c-1', _credential_id: 'cred-1' }]);
      definition.connector.source.name = 'OpenExchangeRates';

      await service.run(commandFor(DataMartDefinitionType.CONNECTOR, definition));

      expect(sourceCredentials.deactivateDataMart).toHaveBeenCalledWith('dm-1');
      expect(sourceCredentials.checkConfigCredential).toHaveBeenCalled();
      expect(sourceCredentials.bindConfig).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: 'user-1',
        roles: ['editor'],
        dataMartId: 'dm-1',
        configId: 'c-1',
        credentialId: 'cred-1',
      });
    });
  });

  describe('changing the input source type of an existing data mart', () => {
    const STATIC_TYPES = [
      DataMartDefinitionType.SQL,
      DataMartDefinitionType.TABLE,
      DataMartDefinitionType.VIEW,
      DataMartDefinitionType.TABLE_PATTERN,
    ];

    const transitions = STATIC_TYPES.flatMap(from =>
      STATIC_TYPES.filter(to => to !== from).map(to => [from, to] as const)
    );

    it.each(transitions)(
      'allows %s -> %s and persists both type and definition',
      async (from, to) => {
        const { service, dataMartService, dataMart } = createService({
          definitionType: from,
          definition: { fullyQualifiedName: 'project.dataset.old' },
        });
        const definition = { fullyQualifiedName: 'project.dataset.new' };

        await service.run(commandFor(to, definition));

        expect(dataMart.definitionType).toBe(to);
        expect(dataMart.definition).toBe(definition);
        expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
      }
    );

    it.each(STATIC_TYPES)('rejects switching a connector data mart to %s', async to => {
      const { service, dataMartService } = createService({
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: { connector: { source: {}, storage: {} } },
      });

      await expect(service.run(commandFor(to, { fullyQualifiedName: 'a.b.c' }))).rejects.toThrow(
        /cannot be changed to or from a connector/
      );
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it.each(STATIC_TYPES)('rejects switching a %s data mart to a connector', async from => {
      const { service, dataMartService } = createService({
        definitionType: from,
        definition: { fullyQualifiedName: 'a.b.c' },
      });

      const definition = {
        connector: {
          source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
          storage: { fullyQualifiedName: 'a.b.c' },
        },
      };

      await expect(
        service.run(commandFor(DataMartDefinitionType.CONNECTOR, definition))
      ).rejects.toThrow(/cannot be changed to or from a connector/);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('keeps a same-type connector update working, including the secrets flow', async () => {
      const existingDefinition = {
        connector: {
          source: { name: 'src', configuration: [{ _id: 'cfg-1' }], node: 'n', fields: ['f'] },
          storage: { fullyQualifiedName: 'a.b.c' },
        },
      };
      const { service, dataMartService, connectorSecretService, dataMart } = createService({
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: existingDefinition,
      });

      const nextDefinition = {
        connector: {
          source: { name: 'src', configuration: [{ _id: 'cfg-2' }], node: 'n', fields: ['f'] },
          storage: { fullyQualifiedName: 'a.b.c' },
        },
      };
      connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(nextDefinition);
      connectorSecretService.extractAndSaveSecrets.mockResolvedValue(nextDefinition);

      await service.run(commandFor(DataMartDefinitionType.CONNECTOR, nextDefinition));

      expect(connectorSecretService.mergeDefinitionSecrets).toHaveBeenCalledWith(
        'proj-1',
        nextDefinition,
        existingDefinition
      );
      expect(connectorSecretService.extractAndSaveSecrets).toHaveBeenCalled();
      expect(connectorSecretService.deleteOrphanedSecrets).toHaveBeenCalledWith(
        'dm-1',
        nextDefinition,
        existingDefinition
      );
      expect(dataMart.definitionType).toBe(DataMartDefinitionType.CONNECTOR);
      expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
    });

    it('rejects a non-SQL type on a legacy BigQuery storage', async () => {
      const { service, dataMartService } = createService({
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'select 1' },
        storageType: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      });

      await expect(
        service.run(commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'a.b.c' }))
      ).rejects.toThrow(/Only SQL definition type is supported/);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('publishes a definition type changed event only when the type actually changes', async () => {
      const { service, eventDispatcher } = createService({
        definitionType: DataMartDefinitionType.VIEW,
        definition: { fullyQualifiedName: 'project.dataset.view' },
      });

      await service.run(
        commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'project.dataset.table' })
      );

      const events = eventDispatcher.publishExternal.mock.calls.map(([event]) => event.name);
      expect(events).toContain('data-mart.definition-type.changed');
      expect(events).not.toContain('data-mart.definition-type.set');
    });

    it('refuses a new definition the storage cannot resolve, leaving the data mart untouched', async () => {
      const { service, dataMartService, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.VIEW,
        definition: { fullyQualifiedName: 'project.dataset.view' },
      });
      definitionValidatorFacade.checkIsValid.mockRejectedValue(
        new BusinessViolationException('Table not found: project.dataset.missing')
      );

      await expect(
        service.run(
          commandFor(DataMartDefinitionType.TABLE, {
            fullyQualifiedName: 'project.dataset.missing',
          })
        )
      ).rejects.toThrow(/Table not found/);

      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('refuses an invalid SQL target, persisting neither the type nor the definition', async () => {
      // The editor dry run is advisory and API callers skip it entirely, so the server has to be
      // the one that stops an invalid query from replacing a working table definition.
      const existingDefinition = { fullyQualifiedName: 'project.dataset.orders' };
      const { service, dataMartService, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: existingDefinition,
      });
      definitionValidatorFacade.checkIsValid.mockRejectedValue(
        new BusinessViolationException('Syntax error near FROM')
      );

      await expect(
        service.run(commandFor(DataMartDefinitionType.SQL, { sqlQuery: 'select from' }))
      ).rejects.toThrow(/Syntax error/);

      expect(definitionValidatorFacade.checkIsValid).toHaveBeenCalled();
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('validates a SQL target before persisting it', async () => {
      const { service, dataMartService, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName: 'project.dataset.orders' },
      });

      await service.run(commandFor(DataMartDefinitionType.SQL, { sqlQuery: 'select 1' }));

      expect(definitionValidatorFacade.checkIsValid).toHaveBeenCalled();
      expect(dataMartService.save).toHaveBeenCalled();
    });

    it('does not re-validate a same-type edit', async () => {
      const { service, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName: 'project.dataset.a' },
      });

      await service.run(
        commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'project.dataset.b' })
      );

      expect(definitionValidatorFacade.checkIsValid).not.toHaveBeenCalled();
    });

    it('does not publish a definition type changed event on a same-type edit', async () => {
      const { service, eventDispatcher } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName: 'project.dataset.a' },
      });

      await service.run(
        commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'project.dataset.b' })
      );

      const events = eventDispatcher.publishExternal.mock.calls.map(([event]) => event.name);
      expect(events).not.toContain('data-mart.definition-type.changed');
    });
  });
});

// The suite above mocks ConnectorService wholesale, so it cannot see that the
// capabilities lookup is bundled-only — which is how pointing a Data Mart at a
// published custom connector shipped returning 404. Here the real ConnectorService
// is wired in and only its DB lookup (tryResolveManifest) is stubbed.
describe('UpdateDataMartDefinitionService with the real ConnectorService', () => {
  // GoogleSheets is the one bundled connector that declares capabilities, which
  // makes it the probe for "bundled capabilities are still read and enforced".
  const BUNDLED_CONNECTOR = 'GoogleSheets';

  const CUSTOM_MANIFEST = {
    version: '1.0',
    name: 'MyCustomApi',
    baseUrl: 'https://api.example.com',
    parameters: { Token: { requiredType: 'string', isRequired: true, label: 'API Token' } },
    // Unvalidated user JSON: a stored manifest must not be able to declare
    // capabilities that relax validation of the definition being saved.
    capabilities: { singleConfiguration: true, copySecretsByValue: true },
    nodes: {
      items: {
        fields: { id: { type: 'string' } },
        uniqueKeys: ['id'],
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: [] },
      },
    },
  };

  const createHarness = () => {
    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
      createdById: 'user-1',
      storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
      definitionType: undefined as DataMartDefinitionType | undefined,
      definition: undefined as unknown,
    };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const connectorSecretService = {
      hasTypedSecrets: jest.fn().mockResolvedValue(false),
      mergeDefinitionSecrets: jest.fn(async (_projectId: string, incoming: unknown) => incoming),
      extractAndSaveSecrets: jest.fn(
        async (_id: string, _projectId: string, _name: string, merged: unknown) => merged
      ),
      deleteOrphanedSecrets: jest.fn(),
    };

    const tryResolveManifest = jest.fn();
    const connectorService = new ConnectorService({} as never, { tryResolveManifest } as never);

    const service = new UpdateDataMartDefinitionService(
      dataMartService as never,
      { toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }) } as never,
      connectorSecretService as never,
      { updateQuery: jest.fn() } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      { checkIsValid: jest.fn().mockResolvedValue(undefined) } as never,
      { publishExternal: jest.fn() } as never,
      connectorService,
      passThroughSqlReferenceValidator as never,
      sourceCredentialsMock() as never
    );

    return { service, dataMartService, dataMart, tryResolveManifest };
  };

  const connectorCommand = (
    name: string,
    configuration: Array<Record<string, unknown>>,
    version?: number
  ): UpdateDataMartDefinitionCommand =>
    new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      {
        connector: {
          source: { name, version, configuration, node: 'items', fields: ['id'] },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      } as never,
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

  const savedConfiguration = (dataMart: { definition: unknown }) =>
    (dataMart.definition as { connector: { source: { configuration: unknown[] } } }).connector
      .source.configuration;

  it('saves a definition naming a published custom connector, with more than one configuration', async () => {
    const { service, dataMartService, dataMart, tryResolveManifest } = createHarness();
    tryResolveManifest.mockResolvedValue(CUSTOM_MANIFEST);

    const result = await service.run(
      connectorCommand(
        'MyCustomApi',
        [
          { _id: 'c-1', _credential_id: 'cred-1' },
          { _id: 'c-2', _credential_id: 'cred-1' },
        ],
        3
      )
    );

    expect(tryResolveManifest).toHaveBeenCalledWith('proj-1', 'MyCustomApi', 3);
    expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
    // A custom connector declares no capabilities, so the singleConfiguration
    // restriction must not be invented for it — nor read out of its manifest.
    expect(savedConfiguration(dataMart)).toHaveLength(2);
    expect(result).toEqual({ id: 'dm-1' });
  });

  it('throws NotFoundException and saves nothing for a name that is neither bundled nor custom', async () => {
    const { service, dataMartService, tryResolveManifest } = createHarness();
    tryResolveManifest.mockResolvedValue(null);

    await expect(
      service.run(connectorCommand('NoSuchConnector', [{ _id: 'c-1' }]))
    ).rejects.toThrow(NotFoundException);

    expect(dataMartService.save).not.toHaveBeenCalled();
  });

  it('resolves a bundled connector without any DB lookup', async () => {
    const { service, dataMartService, tryResolveManifest } = createHarness();

    await service.run(
      connectorCommand(BUNDLED_CONNECTOR, [{ _id: 'c-1', _credential_id: 'cred-1' }])
    );

    expect(tryResolveManifest).not.toHaveBeenCalled();
    expect(dataMartService.save).toHaveBeenCalled();
  });

  it('still enforces singleConfiguration declared by a bundled connector', async () => {
    const { service, dataMartService } = createHarness();

    await expect(
      service.run(connectorCommand(BUNDLED_CONNECTOR, [{ _id: 'c-1' }, { _id: 'c-2' }]))
    ).rejects.toThrow(BadRequestException);

    expect(dataMartService.save).not.toHaveBeenCalled();
  });
});
