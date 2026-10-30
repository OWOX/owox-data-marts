// source-credential-injector.service.spec.ts
jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { DataSource } from 'typeorm';
import { CREDENTIAL_VALIDATION_ENTITIES } from '../../../../test/fixtures/credential-validation-writes';
import { Credential } from '../../credentials/entities/credential.entity';
import { CredentialService } from '../../credentials/services/credential.service';
import {
  BUILDER_TEST_ROTATION_LEASE_WAIT_MS,
  ROTATION_LEASE_BUSY,
  RUN_ROTATION_LEASE_WAIT_MS,
  SourceCredentialInjectorService,
} from './source-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorService } from './connector.service';
import { ConnectorCredentialBoundaryError } from '../../errors/connector-credential-boundary.error';
import { SourceCredentialUnavailableException } from '../../exceptions/source-credential-unavailable.exception';
import type {
  ResolvedSourceCredential,
  SourceCredentialBindingService,
} from '../../connector-types/source-credential-binding.service';

describe('SourceCredentialInjectorService', () => {
  const createService = (
    credentialService = {
      updateSecretFields: jest.fn().mockResolvedValue({ updated: true }),
      findById: jest.fn(),
      claimRotation: jest.fn().mockResolvedValue('lease-1'),
      releaseRotation: jest.fn().mockResolvedValue(undefined),
    } as unknown as CredentialService
  ) => {
    const connectorSourceCredentialsService = {
      getCredentialsById: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;

    const connectorService = {
      refreshBoundCredential: jest.fn().mockResolvedValue(null),
    } as unknown as ConnectorService;

    const sourceCredentials = {
      resolveForConfig: jest.fn().mockResolvedValue(null),
      resolveCredential: jest.fn(),
      markConfigUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as SourceCredentialBindingService;

    const service = new SourceCredentialInjectorService(
      connectorSourceCredentialsService,
      connectorService,
      sourceCredentials,
      credentialService
    );

    return {
      service,
      connectorSourceCredentialsService,
      connectorService,
      sourceCredentials,
      credentialService,
    };
  };

  describe('resolveBoundConfig', () => {
    const MISFIT =
      "This Data Mart's Credential no longer fits its connector. Select a fitting Credential.";

    const facebook = (fields: Record<string, string> = {}): ResolvedSourceCredential => ({
      credentialId: 'cred-1',
      definitionId: 'source:FacebookMarketing:oauth2',
      secret: { fields: { AccessToken: 'fb-token', AppSecret: 'app-secret', ...fields } },
      publicMetadata: { fields: { AppId: 'app-1' } },
    });

    /** Signed in with Connect, so a run refreshes it through the connector first. */
    const microsoft = (): ResolvedSourceCredential => ({
      credentialId: 'cred-1',
      definitionId: 'source:MicrosoftAds:oauth2',
      secret: { fields: { RefreshToken: 'refresh-token', ClientSecret: 's', DeveloperToken: 'd' } },
      publicMetadata: {
        fields: { ClientId: 'client-id' },
        connection: { account: null, expiresAt: null },
      },
    });

    const custom = (
      hosts: string[],
      fieldList: { key: string; secret: boolean }[],
      secret: Record<string, string>,
      fields: Record<string, string> = {}
    ): ResolvedSourceCredential => ({
      credentialId: 'cred-1',
      definitionId: 'custom-connector',
      secret: { fields: secret },
      publicMetadata: {
        hosts,
        fieldList: fieldList.map(field => ({ ...field, label: field.key })),
        fields,
      },
    });

    const oauthManifest = {
      version: '1.0',
      name: 'AcmeApi',
      baseUrl: 'https://api.acme.example',
      authentication: {
        type: 'oauth2',
        tokenUrl: 'https://oauth.acme.example/token',
        clientId: '{{ parameters.ClientId }}',
        clientSecret: '{{ parameters.ClientSecret }}',
        refreshToken: '{{ parameters.RefreshToken }}',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      parameters: {
        ClientId: { requiredType: 'string', isRequired: true },
        ClientSecret: { requiredType: 'string', isRequired: true },
        RefreshToken: { requiredType: 'string', isRequired: true },
      },
      nodes: {
        items: {
          destinationName: 'items',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { type: 'string' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: ['data'] },
        },
      },
    };

    const acme = (rotated?: string) =>
      custom(
        ['api.acme.example', 'oauth.acme.example'],
        [
          { key: 'ClientId', secret: false },
          { key: 'ClientSecret', secret: true },
          { key: 'RefreshToken', secret: true },
        ],
        {
          ClientSecret: 'client-secret',
          RefreshToken: 'refresh-token',
          ...(rotated ? { generated_refresh_token: rotated } : {}),
        },
        { ClientId: 'client-id' }
      );

    const resolveBound = (
      service: SourceCredentialInjectorService,
      config: Record<string, unknown>,
      connectorName = 'FacebookMarketing',
      manifest: Record<string, unknown> | null = null
    ) => service.resolveBoundConfig('proj-1', 'dm-1', connectorName, 'cfg-1', config, manifest);

    it('previewBoundConfig injects a given Credential without a binding, refresh or usage mark', async () => {
      const { service, sourceCredentials, connectorService } = createService();

      const config = service.previewBoundConfig(
        { _id: 'cfg-1', _secrets_id: 'old', AuthType: { oauth2: {}, token: {} } },
        'FacebookMarketing',
        facebook()
      );

      expect(config).toEqual({
        _id: 'cfg-1',
        AuthType: { oauth2: { AccessToken: 'fb-token', AppId: 'app-1', AppSecret: 'app-secret' } },
      });
      expect(sourceCredentials.resolveForConfig).not.toHaveBeenCalled();
      expect(sourceCredentials.markConfigUsed).not.toHaveBeenCalled();
      expect(connectorService.refreshBoundCredential).not.toHaveBeenCalled();
    });

    it('previewBoundConfig refuses a Credential of another connector', () => {
      const { service } = createService();

      expect(() => service.previewBoundConfig({ _id: 'cfg-1' }, 'TikTokAds', facebook())).toThrow(
        ConnectorCredentialBoundaryError
      );
    });

    it('returns null for an unbound configuration', async () => {
      const { service, sourceCredentials } = createService();

      await expect(resolveBound(service, { _id: 'cfg-1', _secrets_id: 'old' })).resolves.toBeNull();
      expect(sourceCredentials.resolveForConfig).toHaveBeenCalledWith('proj-1', 'dm-1', 'cfg-1');
    });

    it('a bound built-in configuration runs with the Credential values at the variant path', async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(facebook());

      const result = await resolveBound(service, {
        _id: 'cfg-1',
        AccountIDs: '123',
        AuthType: { oauth2: {} },
      });

      expect(result).toEqual({
        config: {
          _id: 'cfg-1',
          AccountIDs: '123',
          AuthType: {
            oauth2: { AccessToken: 'fb-token', AppId: 'app-1', AppSecret: 'app-secret' },
          },
        },
        credentialId: 'cred-1',
        expected: {
          generated_refresh_token: undefined,
          AccessToken: 'fb-token',
          AppSecret: 'app-secret',
        },
      });
      expect(result?.keyParameters).toBeUndefined();
    });

    it('a run on a bound Credential marks it used', async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(facebook());

      await resolveBound(service, { _id: 'cfg-1', AuthType: { oauth2: {} } });
      await expect(resolveBound(service, { _id: 'cfg-1' }, 'TikTokAds')).rejects.toBeInstanceOf(
        ConnectorCredentialBoundaryError
      );

      expect(sourceCredentials.markConfigUsed).toHaveBeenCalledTimes(1);
      expect(sourceCredentials.markConfigUsed).toHaveBeenCalledWith('dm-1', 'cfg-1', 'cred-1');
    });

    it('a bound configuration ignores its old _secrets_id and _source_credential_id', async () => {
      const { service, sourceCredentials, connectorSourceCredentialsService } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(facebook());
      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'old-oauth',
        projectId: 'proj-1',
        connectorName: 'FacebookMarketing',
        credentials: { accessToken: 'old-token' },
        modifiedAt: new Date(),
      });

      const result = await resolveBound(service, {
        _id: 'cfg-1',
        _secrets_id: 'old-secrets',
        AuthType: { oauth2: { _source_credential_id: 'old-oauth' }, token: {} },
      });

      expect(result?.config).toEqual({
        _id: 'cfg-1',
        AuthType: {
          oauth2: { AccessToken: 'fb-token', AppId: 'app-1', AppSecret: 'app-secret' },
        },
      });
      expect(JSON.stringify(result)).not.toContain('old-');
    });

    it("a Credential of another connector's definition throws ConnectorCredentialBoundaryError", async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(facebook());

      await expect(resolveBound(service, { _id: 'cfg-1' }, 'TikTokAds')).rejects.toBeInstanceOf(
        ConnectorCredentialBoundaryError
      );
      await expect(
        resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest)
      ).rejects.toBeInstanceOf(ConnectorCredentialBoundaryError);
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(acme());
      await expect(
        resolveBound(service, { _id: 'cfg-1' }, 'FacebookMarketing')
      ).rejects.toBeInstanceOf(ConnectorCredentialBoundaryError);
    });

    it('a custom connector Credential that no longer fits fails with the fixed copy', async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
        custom(
          ['api.acme.example'],
          [
            { key: 'ClientId', secret: false },
            { key: 'ClientSecret', secret: true },
            { key: 'RefreshToken', secret: true },
          ],
          { ClientSecret: 's', RefreshToken: 'r' },
          { ClientId: 'c' }
        )
      );

      const failure = resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);

      await expect(failure).rejects.toBeInstanceOf(SourceCredentialUnavailableException);
      await expect(failure).rejects.toThrow(MISFIT);
    });

    it('a manifest that misuses a key parameter fails with the engine wording', async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(acme());
      const leaky = {
        ...oauthManifest.nodes.items,
        transformations: [{ type: 'add', field: 'label', value: '{{ parameters.ClientId }}' }],
      };

      const failure = resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', {
        ...oauthManifest,
        nodes: { items: leaky },
      });

      await expect(failure).rejects.toBeInstanceOf(SourceCredentialUnavailableException);
      await expect(failure).rejects.toThrow(
        'Key parameter "ClientId" cannot be used in transformations.add of node "items"'
      );
    });

    it('OW_KEY_PARAMETERS lists the key parameters filled from the Credential', async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(acme('rotated-1'));

      const result = await resolveBound(
        service,
        { _id: 'cfg-1', Since: '2026-01-01' },
        'AcmeApi',
        oauthManifest
      );

      expect(result).toEqual({
        config: {
          _id: 'cfg-1',
          Since: '2026-01-01',
          ClientId: 'client-id',
          ClientSecret: 'client-secret',
          RefreshToken: 'refresh-token',
          GeneratedRefreshToken: { value: 'rotated-1' },
        },
        credentialId: 'cred-1',
        expected: {
          ClientSecret: 'client-secret',
          RefreshToken: 'refresh-token',
          generated_refresh_token: 'rotated-1',
        },
        keyParameters: ['ClientId', 'ClientSecret', 'RefreshToken', 'GeneratedRefreshToken'],
        rotationLease: { credentialId: 'cred-1', leaseId: 'lease-1' },
      });
    });

    it('OW_KEY_PARAMETERS lists a stored rotated token even when the manifest does not list it', async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
        custom(
          ['api.acme.example'],
          [{ key: 'ApiKey', secret: true }],
          { ApiKey: 'key-1', generated_refresh_token: 'rotated-1' },
          {}
        )
      );
      const manifest = {
        ...oauthManifest,
        authentication: {
          type: 'apiKey',
          inject: { into: 'header', name: 'X-Key', format: '{{ parameters.ApiKey }}' },
        },
        parameters: { ApiKey: { requiredType: 'string', isRequired: true } },
      };

      const result = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', manifest);

      expect(result?.keyParameters).toEqual(['ApiKey', 'GeneratedRefreshToken']);
    });

    it('fits a Credential without a rotated token when the manifest declares GeneratedRefreshToken as required', async () => {
      const { service, sourceCredentials } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(acme());
      const manifest = {
        ...oauthManifest,
        parameters: {
          ...oauthManifest.parameters,
          GeneratedRefreshToken: { requiredType: 'string', isRequired: true },
        },
      };

      const result = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', manifest);

      expect(result?.config.ClientId).toBe('client-id');
    });

    it('testValues lists a rotated token among the key parameters', () => {
      const { service } = createService();

      const test = service.testValues('AcmeApi', {}, oauthManifest, acme('rotated-1'));

      expect(test.parameters.GeneratedRefreshToken).toBe('rotated-1');
      expect(test.keyParameters).toEqual([
        'ClientId',
        'ClientSecret',
        'RefreshToken',
        'GeneratedRefreshToken',
      ]);
    });

    describe('a Credential field that is not a key parameter of the manifest', () => {
      const withAccountId = custom(
        ['api.acme.example', 'oauth.acme.example'],
        [
          { key: 'ClientId', secret: false },
          { key: 'ClientSecret', secret: true },
          { key: 'RefreshToken', secret: true },
          { key: 'AccountId', secret: false },
        ],
        { ClientSecret: 'client-secret', RefreshToken: 'refresh-token' },
        { ClientId: 'client-id', AccountId: 'credential-account' }
      );
      const manifest = {
        ...oauthManifest,
        parameters: { ...oauthManifest.parameters, AccountId: { requiredType: 'string' } },
      };

      it("leaves the run's configuration value and stays out of OW_KEY_PARAMETERS", async () => {
        const { service, sourceCredentials } = createService();
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(withAccountId);

        const result = await resolveBound(
          service,
          { _id: 'cfg-1', AccountId: 'data-mart-account' },
          'AcmeApi',
          manifest
        );

        expect(result?.config.AccountId).toBe('data-mart-account');
        expect(result?.config.ClientId).toBe('client-id');
        expect(result?.keyParameters).not.toContain('AccountId');
      });

      it("leaves the test's typed value and stays out of the test's key parameters", () => {
        const { service } = createService();

        const test = service.testValues(
          'AcmeApi',
          { AccountId: 'typed-account' },
          manifest,
          withAccountId
        );

        expect(test.parameters).not.toHaveProperty('AccountId');
        expect(test.parameters.ClientId).toBe('client-id');
        expect(test.keyParameters).not.toContain('AccountId');
      });
    });

    describe('a selective manifest', () => {
      const selective = (selection: Record<string, unknown>) => ({
        ...oauthManifest,
        authentication: {
          type: 'selective',
          selectionParameter: 'AuthType',
          authenticators: {
            key: {
              type: 'apiKey',
              inject: { into: 'query', name: 'k', format: '{{ parameters.ApiKey }}' },
            },
            oauth2: oauthManifest.authentication,
          },
        },
        parameters: {
          AuthType: selection,
          ApiKey: { requiredType: 'string', isRequired: true },
          ...oauthManifest.parameters,
        },
      });
      const apiKeyOnly = custom(
        ['api.acme.example', 'oauth.acme.example'],
        [{ key: 'ApiKey', secret: true }],
        { ApiKey: 'api-key' }
      );

      it('fits on the branch the configuration selects', async () => {
        const { service, sourceCredentials } = createService();
        const manifest = selective({ requiredType: 'string' });
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(apiKeyOnly);

        const fits = await resolveBound(
          service,
          { _id: 'cfg-1', AuthType: 'key' },
          'AcmeApi',
          manifest
        );
        expect(fits?.config.ApiKey).toBe('api-key');
        await expect(
          resolveBound(service, { _id: 'cfg-1', AuthType: 'oauth2' }, 'AcmeApi', manifest)
        ).rejects.toThrow(MISFIT);
      });

      it("fits on the selection's default when the configuration leaves it untyped", async () => {
        const { service, sourceCredentials } = createService();
        const manifest = selective({ requiredType: 'string', default: 'key' });
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(apiKeyOnly);

        const run = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', manifest);
        const test = service.testValues('AcmeApi', { AuthType: '' }, manifest, apiKeyOnly);

        expect(run?.config.ApiKey).toBe('api-key');
        expect(test.parameters.ApiKey).toBe('api-key');
      });
    });

    it('a refresh updates the Credential in place instead of creating a row', async () => {
      const { service, sourceCredentials, connectorService, credentialService } = createService();
      const expiresAt = new Date('2027-01-01T00:00:00.000Z');
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
        facebook({ AccessToken: 'stale' })
      );
      (sourceCredentials.resolveCredential as jest.Mock).mockResolvedValue(
        facebook({ AccessToken: 'fresh' })
      );
      (connectorService.refreshBoundCredential as jest.Mock).mockResolvedValue({
        fields: { AccessToken: 'fresh' },
        expiresAt,
      });

      const result = await resolveBound(service, { _id: 'cfg-1', AuthType: { oauth2: {} } });

      expect(connectorService.refreshBoundCredential).toHaveBeenCalledWith(
        'FacebookMarketing',
        facebook({ AccessToken: 'stale' }),
        expect.objectContaining({ path: ['AuthType', 'oauth2'] })
      );
      expect(credentialService.updateSecretFields).toHaveBeenCalledWith(
        'cred-1',
        'proj-1',
        { AccessToken: 'fresh' },
        { AccessToken: 'stale' },
        expiresAt
      );
      expect(result?.config.AuthType).toEqual({
        oauth2: { AccessToken: 'fresh', AppId: 'app-1', AppSecret: 'app-secret' },
      });
    });

    it("a refresh that loses to a concurrent one runs on the winner's token", async () => {
      const { service, sourceCredentials, connectorService, credentialService } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
        facebook({ AccessToken: 'stale' })
      );
      (sourceCredentials.resolveCredential as jest.Mock).mockResolvedValue(
        facebook({ AccessToken: 'winner' })
      );
      (connectorService.refreshBoundCredential as jest.Mock).mockResolvedValue({
        fields: { AccessToken: 'loser' },
        expiresAt: new Date(),
      });
      (credentialService.updateSecretFields as jest.Mock).mockResolvedValue({ updated: false });

      const result = await resolveBound(service, { _id: 'cfg-1', AuthType: { oauth2: {} } });

      expect(sourceCredentials.resolveCredential).toHaveBeenCalledWith('proj-1', 'cred-1');
      expect(JSON.stringify(result)).not.toContain('loser');
      expect(
        (result?.config.AuthType as Record<string, Record<string, string>>).oauth2.AccessToken
      ).toBe('winner');
    });

    it('keeps the current values when the refresh fails', async () => {
      const { service, sourceCredentials, connectorService, credentialService } = createService();
      (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(facebook());
      (connectorService.refreshBoundCredential as jest.Mock).mockRejectedValue(
        new Error('provider unreachable')
      );
      const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      const result = await resolveBound(service, { _id: 'cfg-1', AuthType: { oauth2: {} } });

      expect(warn).toHaveBeenCalledWith(
        'Failed to refresh Credential cred-1: provider unreachable. Using its current values.'
      );

      expect(
        (result?.config.AuthType as Record<string, Record<string, string>>).oauth2.AccessToken
      ).toBe('fb-token');
      expect(credentialService.updateSecretFields).not.toHaveBeenCalled();
    });

    describe('the rotation lease', () => {
      afterEach(() => jest.useRealTimers());

      it('a Credential holding a rotated token is read again after the lease is claimed', async () => {
        jest.useFakeTimers();
        const { service, sourceCredentials, credentialService } = createService();
        // Another run holds the lease while it redeems rotated-0 and stores rotated-1.
        (sourceCredentials.resolveForConfig as jest.Mock)
          .mockResolvedValueOnce(acme('rotated-0'))
          .mockResolvedValue(acme('rotated-1'));
        (credentialService.claimRotation as jest.Mock)
          .mockResolvedValueOnce(null)
          .mockResolvedValue('lease-1');

        const pending = resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);
        await jest.advanceTimersByTimeAsync(500);
        const result = await pending;

        expect(credentialService.claimRotation).toHaveBeenCalledTimes(2);
        expect(credentialService.claimRotation).toHaveBeenCalledWith('cred-1');
        expect(result?.config.GeneratedRefreshToken).toEqual({ value: 'rotated-1' });
        expect(result?.expected.generated_refresh_token).toBe('rotated-1');
        expect(result?.rotationLease).toEqual({ credentialId: 'cred-1', leaseId: 'lease-1' });
        expect(JSON.stringify(result)).not.toContain('rotated-0');
        expect(credentialService.releaseRotation).not.toHaveBeenCalled();
      });

      it('a first run takes the lease when its connector can report a rotated token', async () => {
        const { service, sourceCredentials, credentialService } = createService();
        const resolve = sourceCredentials.resolveForConfig as jest.Mock;

        // A custom connector with a refresh grant.
        resolve.mockResolvedValue(acme());
        const custom = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);
        // Microsoft Ads declares that it rotates its refresh token.
        resolve.mockResolvedValue(microsoft());
        const bundled = await resolveBound(service, { _id: 'cfg-1' }, 'MicrosoftAds');

        expect((credentialService.claimRotation as jest.Mock).mock.calls).toEqual([
          ['cred-1'],
          ['cred-1'],
        ]);
        expect(custom?.rotationLease).toEqual({ credentialId: 'cred-1', leaseId: 'lease-1' });
        expect(bundled?.rotationLease).toEqual({ credentialId: 'cred-1', leaseId: 'lease-1' });
      });

      it('fails with the run copy once the wait is over, before contacting the provider', async () => {
        jest.useFakeTimers();
        const { service, sourceCredentials, connectorService, credentialService } = createService();
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(microsoft());
        (credentialService.claimRotation as jest.Mock).mockResolvedValue(null);

        const failure = expect(
          resolveBound(service, { _id: 'cfg-1', AuthType: { oauth2: {} } }, 'MicrosoftAds')
        ).rejects.toThrow(new SourceCredentialUnavailableException(ROTATION_LEASE_BUSY));
        await jest.advanceTimersByTimeAsync(RUN_ROTATION_LEASE_WAIT_MS);
        await failure;

        expect(ROTATION_LEASE_BUSY).toBe(
          "Another run is refreshing this Credential's token; the next run retries."
        );
        expect(connectorService.refreshBoundCredential).not.toHaveBeenCalled();
        expect(sourceCredentials.markConfigUsed).not.toHaveBeenCalled();
        expect(credentialService.releaseRotation).not.toHaveBeenCalled();
      });

      it('fails the run when claiming it fails', async () => {
        const { service, sourceCredentials, connectorService, credentialService } = createService();
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(microsoft());
        (credentialService.claimRotation as jest.Mock).mockRejectedValue(new Error('db down'));

        await expect(
          resolveBound(service, { _id: 'cfg-1', AuthType: { oauth2: {} } }, 'MicrosoftAds')
        ).rejects.toThrow('db down');
        expect(connectorService.refreshBoundCredential).not.toHaveBeenCalled();
      });

      it('is released when the run cannot start after it was claimed', async () => {
        const { service, sourceCredentials, credentialService } = createService();
        const disabled = new SourceCredentialUnavailableException('disabled');
        (sourceCredentials.resolveForConfig as jest.Mock)
          .mockResolvedValueOnce(acme('rotated-1'))
          .mockRejectedValueOnce(disabled);
        (sourceCredentials.markConfigUsed as jest.Mock).mockRejectedValueOnce(new Error('db down'));

        await expect(
          resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest)
        ).rejects.toBe(disabled);
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(acme('rotated-1'));
        await expect(
          resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest)
        ).rejects.toThrow('db down');

        expect((credentialService.releaseRotation as jest.Mock).mock.calls).toEqual([
          ['cred-1', 'lease-1'],
          ['cred-1', 'lease-1'],
        ]);
      });

      it('a connector that cannot report a rotated token takes no lease', async () => {
        const { service, sourceCredentials, credentialService } = createService();
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(facebook());

        const result = await resolveBound(service, { _id: 'cfg-1', AuthType: { oauth2: {} } });

        expect(credentialService.claimRotation).not.toHaveBeenCalled();
        expect(sourceCredentials.resolveForConfig).toHaveBeenCalledTimes(1);
        expect(result?.rotationLease).toBeUndefined();
      });

      it('a Credential a run found static takes no lease until it holds a rotated token', async () => {
        const { service, sourceCredentials, credentialService } = createService();
        const resolve = sourceCredentials.resolveForConfig as jest.Mock;
        const refreshTokenStaticAt = new Date('2026-10-30T00:00:00.000Z');

        resolve.mockResolvedValue({ ...acme(), refreshTokenStaticAt });
        const unleased = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);
        expect(credentialService.claimRotation).not.toHaveBeenCalled();
        expect(unleased?.rotationLease).toBeUndefined();

        resolve.mockResolvedValue({ ...acme('rotated-1'), refreshTokenStaticAt });
        const leased = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);
        expect(credentialService.claimRotation).toHaveBeenCalledWith('cred-1');
        expect(leased?.rotationLease).toEqual({ credentialId: 'cred-1', leaseId: 'lease-1' });
      });

      it('is handed back when the read under it shows another run found the token stays', async () => {
        const { service, sourceCredentials, credentialService } = createService();
        const refreshTokenStaticAt = new Date('2026-10-30T00:00:00.000Z');
        (sourceCredentials.resolveForConfig as jest.Mock)
          .mockResolvedValueOnce(acme())
          .mockResolvedValue({ ...acme(), refreshTokenStaticAt });

        const result = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);

        expect(credentialService.claimRotation).toHaveBeenCalledWith('cred-1');
        expect((credentialService.releaseRotation as jest.Mock).mock.calls).toEqual([
          ['cred-1', 'lease-1'],
        ]);
        expect(result?.rotationLease).toBeUndefined();
        expect(result?.credentialId).toBe('cred-1');
      });

      it('leaseRotation hands a builder test the values read under the lease', async () => {
        const { service, credentialService } = createService();
        const reread = jest.fn().mockResolvedValue(acme('rotated-1'));
        const wait = BUILDER_TEST_ROTATION_LEASE_WAIT_MS;

        await expect(service.leaseRotation(acme(), reread, wait, () => true)).resolves.toEqual({
          credential: acme('rotated-1'),
          leaseId: 'lease-1',
        });
        await expect(service.leaseRotation(acme(), reread, wait, () => false)).resolves.toEqual({
          credential: acme(),
        });
        expect(reread).toHaveBeenCalledTimes(1);
        expect(credentialService.claimRotation).toHaveBeenCalledTimes(1);
      });

      it('a run waits for a held lease up to 60 s, a builder test up to 5 s, then both fail alike', async () => {
        jest.useFakeTimers();
        const { service, credentialService } = createService();
        (credentialService.claimRotation as jest.Mock).mockResolvedValue(null);
        const reread = jest.fn().mockResolvedValue(acme('rotated-1'));
        const settled: string[] = [];
        const failed = (name: string) => (error: unknown) => {
          if (error instanceof SourceCredentialUnavailableException) settled.push(name);
        };

        void service
          .leaseRotation(acme('rotated-0'), reread, RUN_ROTATION_LEASE_WAIT_MS, () => true)
          .catch(failed('run'));
        void service
          .leaseRotation(acme('rotated-0'), reread, BUILDER_TEST_ROTATION_LEASE_WAIT_MS, () => true)
          .catch(failed('builder test'));

        await jest.advanceTimersByTimeAsync(5_000);
        expect(settled).toEqual(['builder test']);
        await jest.advanceTimersByTimeAsync(55_000);
        expect(settled).toEqual(['builder test', 'run']);
      });

      describe('a configuration rebound to another Credential during the wait', () => {
        const unfitting = {
          ...custom(
            ['api.acme.example'],
            [
              { key: 'ClientId', secret: false },
              { key: 'ClientSecret', secret: true },
              { key: 'RefreshToken', secret: true },
            ],
            { ClientSecret: 's', RefreshToken: 'r' },
            { ClientId: 'c' }
          ),
          credentialId: 'cred-2',
        };

        it('is judged on the Credential read under the lease, and a refusal frees the first lease', async () => {
          const { service, sourceCredentials, credentialService } = createService();
          (sourceCredentials.resolveForConfig as jest.Mock)
            .mockResolvedValueOnce(acme('rotated-1'))
            .mockResolvedValueOnce(unfitting);

          const failure = resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);

          await expect(failure).rejects.toThrow(MISFIT);
          expect((credentialService.releaseRotation as jest.Mock).mock.calls).toEqual([
            ['cred-1', 'lease-1'],
          ]);
        });

        it('hands back the lease of the first and runs under the lease of the new one', async () => {
          const { service, sourceCredentials, credentialService } = createService();
          (sourceCredentials.resolveForConfig as jest.Mock)
            .mockResolvedValueOnce(acme('rotated-1'))
            .mockResolvedValue({ ...acme('rotated-9'), credentialId: 'cred-2' });
          (credentialService.claimRotation as jest.Mock)
            .mockResolvedValueOnce('lease-1')
            .mockResolvedValueOnce('lease-2');

          const result = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);

          expect(result?.credentialId).toBe('cred-2');
          expect(result?.config.GeneratedRefreshToken).toEqual({ value: 'rotated-9' });
          expect(result?.rotationLease).toEqual({ credentialId: 'cred-2', leaseId: 'lease-2' });
          expect((credentialService.claimRotation as jest.Mock).mock.calls).toEqual([
            ['cred-1'],
            ['cred-2'],
          ]);
          expect((credentialService.releaseRotation as jest.Mock).mock.calls).toEqual([
            ['cred-1', 'lease-1'],
          ]);
        });

        it('fails with the run copy when the binding keeps moving, with every lease handed back', async () => {
          const { service, sourceCredentials, credentialService } = createService();
          let reads = 0;
          (sourceCredentials.resolveForConfig as jest.Mock).mockImplementation(() =>
            Promise.resolve({ ...acme('rotated-1'), credentialId: `cred-${++reads}` })
          );

          await expect(
            resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest)
          ).rejects.toThrow(new SourceCredentialUnavailableException(ROTATION_LEASE_BUSY));
          expect((credentialService.releaseRotation as jest.Mock).mock.calls).toEqual([
            ['cred-1', 'lease-1'],
            ['cred-2', 'lease-1'],
            ['cred-3', 'lease-1'],
          ]);
          expect(sourceCredentials.markConfigUsed).not.toHaveBeenCalled();
        });
      });
    });

    describe('rollout', () => {
      /** The old row the configuration still names; its key values are those of the Credential's grant. */
      const oldRow = (
        rotated: string,
        keys = { access_token: 'fb-token', app_secret: 'app-secret' }
      ) => ({
        id: 'old-oauth',
        projectId: 'proj-1',
        connectorName: 'FacebookMarketing',
        credentials: { ...keys, generated_refresh_token: rotated },
        // An N-1 save or a delete hand-over moves it without a rotation.
        modifiedAt: new Date('2026-10-28T12:00:00.000Z'),
      });
      /** A converted Credential: its token, and the old row's token as last taken. */
      const converted = (token: string, base?: string) =>
        facebook({
          generated_refresh_token: token,
          ...(base && { legacy_generated_refresh_token: base }),
        });
      const config = { _id: 'cfg-1', AuthType: { oauth2: { _source_credential_id: 'old-oauth' } } };

      const setUp = () => {
        const created = createService();
        // Older than the old row's, so the order of the two never decides.
        (created.credentialService.findById as jest.Mock).mockResolvedValue({
          modifiedAt: new Date('2026-10-28T11:00:00.000Z'),
        });
        return created;
      };

      it("keeps the Credential's newer token when the old row moved without a rotation", async () => {
        const { service, sourceCredentials, credentialService, connectorSourceCredentialsService } =
          setUp();
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
          converted('rotated-on-n', 'converted')
        );
        (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
          oldRow('converted')
        );

        await resolveBound(service, config);

        expect(credentialService.updateSecretFields).not.toHaveBeenCalled();
      });

      it("ignores an old row of another grant: another account's sign-in or a key replaced on N-1", async () => {
        const { service, sourceCredentials, credentialService, connectorSourceCredentialsService } =
          setUp();
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
          converted('converted', 'converted')
        );
        const getRow = connectorSourceCredentialsService.getCredentialsById as jest.Mock;

        getRow.mockResolvedValue(
          oldRow('rotated-by-n-1', { access_token: 'account-2-token', app_secret: 'app-secret' })
        );
        await resolveBound(service, config);
        getRow.mockResolvedValue(
          oldRow('rotated-by-n-1', { access_token: 'fb-token', app_secret: 'replaced-on-n-1' })
        );
        await resolveBound(service, config);

        expect(credentialService.updateSecretFields).not.toHaveBeenCalled();
      });

      it('takes a token an N-1 run rotated since the conversion and moves the base to it', async () => {
        const { service, sourceCredentials, credentialService, connectorSourceCredentialsService } =
          setUp();
        // Read, read again under the rotation lease, then read the leased Credential after taking the old row's token.
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
          converted('converted', 'converted')
        );
        (sourceCredentials.resolveCredential as jest.Mock).mockResolvedValue(
          converted('rotated-by-n-1', 'rotated-by-n-1')
        );
        (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
          oldRow('rotated-by-n-1')
        );

        const result = await resolveBound(service, config);

        expect(connectorSourceCredentialsService.getCredentialsById).toHaveBeenCalledWith(
          'old-oauth'
        );
        expect(credentialService.updateSecretFields).toHaveBeenCalledWith(
          'cred-1',
          'proj-1',
          {
            generated_refresh_token: 'rotated-by-n-1',
            legacy_generated_refresh_token: 'rotated-by-n-1',
          },
          { generated_refresh_token: 'converted', legacy_generated_refresh_token: 'converted' }
        );
        // The base is never injected.
        expect(result?.config.AuthType).toEqual({
          oauth2: {
            AccessToken: 'fb-token',
            AppId: 'app-1',
            AppSecret: 'app-secret',
            GeneratedRefreshToken: { value: 'rotated-by-n-1' },
          },
        });
        expect(result?.expected).toEqual({
          AccessToken: 'fb-token',
          AppSecret: 'app-secret',
          generated_refresh_token: 'rotated-by-n-1',
          legacy_generated_refresh_token: 'rotated-by-n-1',
        });
      });

      it('takes nothing once the Credential has rotated its own token', async () => {
        const { service, sourceCredentials, credentialService, connectorSourceCredentialsService } =
          setUp();
        (sourceCredentials.resolveForConfig as jest.Mock).mockResolvedValue(
          converted('rotated-on-n', 'converted')
        );
        (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
          oldRow('rotated-by-n-1')
        );

        await resolveBound(service, config);

        expect(credentialService.updateSecretFields).not.toHaveBeenCalled();
      });

      it('ignores a foreign or missing old row, and a Credential converted without a base', async () => {
        const { service, sourceCredentials, credentialService, connectorSourceCredentialsService } =
          setUp();
        const resolve = sourceCredentials.resolveForConfig as jest.Mock;
        const getRow = connectorSourceCredentialsService.getCredentialsById as jest.Mock;

        resolve.mockResolvedValue(converted('converted', 'converted'));
        getRow.mockResolvedValue({ ...oldRow('rotated-by-n-1'), projectId: 'proj-2' });
        await resolveBound(service, config);
        getRow.mockResolvedValue({ ...oldRow('rotated-by-n-1'), connectorName: 'TikTokAds' });
        await resolveBound(service, config);
        getRow.mockResolvedValue(null);
        await resolveBound(service, config);
        resolve.mockResolvedValue(converted('converted'));
        getRow.mockResolvedValue(oldRow('rotated-by-n-1'));
        await resolveBound(service, config);

        expect(credentialService.updateSecretFields).not.toHaveBeenCalled();
      });
    });

    describe('a rotation against the stored Credential (SQLite)', () => {
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

      it('is dropped when the key changed after the run read it', async () => {
        const credentials = dataSource.getRepository(Credential);
        const credentialService = new CredentialService(
          credentials as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never
        );
        const { service, sourceCredentials } = createService(credentialService);
        const { id } = await credentials.save(
          credentials.create({
            projectId: 'proj-1',
            title: 'Acme',
            definitionSource: 'builtin',
            definitionId: 'custom-connector',
            secret: acme().secret,
            publicMetadata: acme().publicMetadata,
          })
        );
        const stored = async (): Promise<ResolvedSourceCredential> => {
          const credential = await credentials.findOneByOrFail({ id });
          return {
            credentialId: id,
            definitionId: credential.definitionId,
            secret: credential.secret,
            publicMetadata: credential.publicMetadata,
          };
        };
        (sourceCredentials.resolveForConfig as jest.Mock).mockImplementation(stored);
        const rotate = (token: string, expected: Record<string, string | undefined>) =>
          credentialService.updateSecretFields(
            id,
            'proj-1',
            { generated_refresh_token: token },
            expected
          );

        const run = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);
        // As the run does when it ends.
        await credentialService.releaseRotation(id, run!.rotationLease!.leaseId);
        const test = service.testValues('AcmeApi', {}, oauthManifest, await stored());
        // The owner reconnects the Credential to another account while both are going.
        const reconnected = {
          fields: { ClientSecret: 'client-secret', RefreshToken: 'refresh-2' },
        };
        await credentials.update({ id }, { secret: reconnected });

        await expect(rotate('rotated-1', run!.expected)).resolves.toEqual({ updated: false });
        await expect(rotate('rotated-2', test.expected)).resolves.toEqual({ updated: false });
        expect((await credentials.findOneByOrFail({ id })).secret).toEqual(reconnected);

        // With no change meanwhile, the next run's rotation lands.
        const next = await resolveBound(service, { _id: 'cfg-1' }, 'AcmeApi', oauthManifest);
        await expect(rotate('rotated-3', next!.expected)).resolves.toEqual({ updated: true });
      });

      it("takes an old row's token with its base, so a run that read before loses its rotation", async () => {
        const credentials = dataSource.getRepository(Credential);
        const credentialService = new CredentialService(
          credentials as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never
        );
        const { service, sourceCredentials, connectorSourceCredentialsService } =
          createService(credentialService);
        const keys = { ClientSecret: 'client-secret', RefreshToken: 'refresh-token' };
        const { id } = await credentials.save(
          credentials.create({
            projectId: 'proj-1',
            title: 'Acme',
            definitionSource: 'builtin',
            definitionId: 'custom-connector',
            secret: {
              fields: {
                ...keys,
                generated_refresh_token: 'converted',
                legacy_generated_refresh_token: 'converted',
              },
            },
            publicMetadata: acme().publicMetadata,
          })
        );
        const stored = async (): Promise<ResolvedSourceCredential> => {
          const credential = await credentials.findOneByOrFail({ id });
          return { ...credential, credentialId: id };
        };
        (sourceCredentials.resolveForConfig as jest.Mock).mockImplementation(stored);
        (sourceCredentials.resolveCredential as jest.Mock).mockImplementation(stored);
        (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
          projectId: 'proj-1',
          connectorName: 'AcmeApi',
          credentials: { ...keys, generated_refresh_token: 'rotated-by-n-1' },
        });
        const before = service.testValues('AcmeApi', {}, oauthManifest, await stored());

        const run = await resolveBound(
          service,
          { _id: 'cfg-1', _secrets_id: 'old-row' },
          'AcmeApi',
          oauthManifest
        );

        expect(run?.config.GeneratedRefreshToken).toEqual({ value: 'rotated-by-n-1' });
        expect((await credentials.findOneByOrFail({ id })).secret).toEqual({
          fields: {
            ...keys,
            generated_refresh_token: 'rotated-by-n-1',
            legacy_generated_refresh_token: 'rotated-by-n-1',
          },
        });
        await expect(
          credentialService.updateSecretFields(
            id,
            'proj-1',
            { generated_refresh_token: 'rotated-by-test' },
            before.expected
          )
        ).resolves.toEqual({ updated: false });
      });
    });
  });
});
