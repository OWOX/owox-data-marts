jest.mock('@google-cloud/bigquery', () => ({ BigQuery: jest.fn() }));
const listProjects = jest.fn();
jest.mock('googleapis', () => ({
  google: { bigquery: () => ({ projects: { list: listProjects } }) },
}));
import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { QueryFailedError } from 'typeorm';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { StorageCredentialType } from '../../../enums/storage-credential-type.enum';
import { GoogleOAuthClientService } from '../../../services/google-oauth/google-oauth-client.service';
import { GoogleOAuthFlowService } from '../../../services/google-oauth/google-oauth-flow.service';
import { BigQueryStorageResourceBrowser } from './bigquery-storage-resource-browser.service';

describe('BigQuery strict resource browsing', () => {
  const clients = { bigQuery: { projectId: 'configured-fallback' }, authClient: {} };
  let browser: BigQueryStorageResourceBrowser;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.resetAllMocks();
    browser = new BigQueryStorageResourceBrowser({} as never);
    jest.spyOn(browser as never, 'createClients').mockResolvedValue(clients as never);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  function withRealCredentialResolution() {
    const credential = {
      id: 'credential-1',
      type: StorageCredentialType.GOOGLE_OAUTH,
      credentials: {
        access_token: 'private-old-access',
        refresh_token: 'private-refresh-marker',
        token_type: 'Bearer',
        scope: 'test',
        expiry_date: 1,
      },
    };
    const storage = {
      id: 'storage-1',
      credentialId: credential.id,
      credential,
      config: { projectId: 'project-1' },
    };
    const repository = { findOne: jest.fn().mockResolvedValue(storage) };
    const credentials = {
      getById: jest.fn().mockResolvedValue(credential),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      getStorageClientId: () => 'test-client',
      getStorageClientSecret: () => 'private-client-secret',
      getRedirectUri: () => 'https://app.test/callback',
    };
    const flow = new GoogleOAuthFlowService(
      credentials as never,
      {} as never,
      config as never,
      repository as never,
      {} as never
    );
    const client = new GoogleOAuthClientService(
      config as never,
      flow,
      credentials as never,
      {} as never,
      repository as never,
      {} as never
    );
    const resolver = new DataStorageCredentialsResolver(
      client,
      repository as never,
      credentials as never
    );
    return { browser: new BigQueryStorageResourceBrowser(resolver), storage, credentials };
  }

  it('preserves expired authorization through the real resolver and OAuth refresh flow', async () => {
    const actual = withRealCredentialResolution();
    jest
      .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
      .mockImplementation(() => Promise.reject({ response: { data: { error: 'invalid_grant' } } }));
    await expect(
      actual.browser.listNamespaces(actual.storage as never, { strict: true })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(listProjects).not.toHaveBeenCalled();
    expect(actual.credentials.update).not.toHaveBeenCalled();
  });

  it.each(['refresh', 'persist'])(
    'keeps %s failure secrets out of logs and errors',
    async stage => {
      const actual = withRealCredentialResolution();
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const refresh = jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken');
      const tokens = {
        access_token: 'private-new-access-marker',
        refresh_token: 'private-refresh-marker',
      };
      if (stage === 'persist') {
        refresh.mockImplementation(async () => ({ credentials: tokens }));
        actual.credentials.update.mockRejectedValue(
          new QueryFailedError(
            'UPDATE credentials SET credentials = ?',
            [JSON.stringify(tokens)],
            new Error('db failure')
          )
        );
      } else {
        refresh.mockImplementation(() =>
          Promise.reject({
            response: { data: { error: 'temporarily_unavailable' } },
            config: { data: JSON.stringify(tokens), client_secret: 'private-client-secret' },
          })
        );
      }
      const result = actual.browser.listNamespaces(actual.storage as never, { strict: true });
      await expect(result).rejects.toThrow('Storage resource discovery failed');
      const diagnostics = JSON.stringify([logged.mock.calls, warn.mock.calls]);
      expect(diagnostics).not.toContain('private-');
      expect(listProjects).not.toHaveBeenCalled();
    }
  );
  it.each([401, 403, 500])(
    'rejects %s without logging raw diagnostics or returning fallback',
    async code => {
      listProjects.mockRejectedValue({ code, message: 'token=private-value' });
      const promise = browser.listNamespaces({} as never, { strict: true });
      await expect(promise).rejects.toThrow(
        code === 401
          ? UnauthorizedException
          : code === 403
            ? ForbiddenException
            : 'Storage resource discovery failed'
      );
      expect(warn).not.toHaveBeenCalled();
    }
  );
  it('keeps legacy app fallback behavior', async () => {
    listProjects.mockRejectedValue(new Error('upstream unavailable'));
    expect(await browser.listNamespaces({} as never)).toEqual([
      { id: 'configured-fallback', label: undefined },
    ]);
    expect(warn).toHaveBeenCalled();
  });
  it('does not return configured fallback on strict empty listing', async () => {
    listProjects.mockResolvedValue({ data: { projects: [] } });
    expect(await browser.listNamespaces({} as never, { strict: true })).toEqual([]);
  });
  it('rejects partial per-dataset results without raw logs', async () => {
    jest
      .spyOn(browser as never, 'listDatasets')
      .mockResolvedValue([{ id: 'one' }, { id: 'two' }] as never);
    jest
      .spyOn(browser as never, 'listTables')
      .mockImplementation((...args: unknown[]) =>
        (args[2] as { id: string }).id === 'one'
          ? (Promise.resolve([{ id: 'row' }]) as never)
          : (Promise.reject({ code: 401, message: 'token=private-value' }) as never)
      );
    await expect(
      browser.listLeafResources({} as never, 'warehouse', undefined, { strict: true })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).not.toHaveBeenCalled();
  });
  it('refuses provider truncation rather than returning incomplete success', async () => {
    listProjects.mockResolvedValue({
      data: { projects: Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}` })) },
    });
    await expect(browser.listNamespaces({} as never, { strict: true })).rejects.toThrow(
      'Storage resource discovery failed'
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
