import {
  cleanupApp,
  createProjectMemberApiKey,
  decodeApiKey,
  exchangeApiKey,
  expectApiKeyAuthContext,
  expectApiKeyAuthContextStatus,
  expectCtlStatus,
  expectDataMartsAccessible,
  expectProjectMemberAdministrationRejected,
  readBrowserAccessToken,
  signInNullIdp,
  startOwoxApp,
  type StartedApp,
} from './utils/api-key-app-smoke';

// Kept separate from the Better Auth smoke so Jest --shard can split the app boots across runners.
jest.setTimeout(180_000);

describe('Null IDP app smoke (e2e)', () => {
  it('creates an API key, exchanges it, binds the token, and works with owox-ctl status', async () => {
    let app: StartedApp | undefined;

    try {
      app = await startOwoxApp('none');

      const session = await signInNullIdp(app.origin);
      const memberAccessToken = await readBrowserAccessToken(app.origin, session);
      const createdKey = await createProjectMemberApiKey(app.origin, memberAccessToken);
      const parsedKey = decodeApiKey(createdKey.apiKey);
      const apiKeyAccessToken = await exchangeApiKey(app.origin, parsedKey);

      await expectApiKeyAuthContext(app.origin, apiKeyAccessToken, parsedKey.apiKeyId);
      await expectApiKeyAuthContextStatus(app.origin, apiKeyAccessToken, undefined, 403);
      await expectApiKeyAuthContextStatus(
        app.origin,
        apiKeyAccessToken,
        `${parsedKey.apiKeyId}-other`,
        403
      );
      await expectProjectMemberAdministrationRejected(
        app.origin,
        apiKeyAccessToken,
        parsedKey.apiKeyId
      );
      await expectDataMartsAccessible(app.origin, apiKeyAccessToken, parsedKey.apiKeyId);
      await expectCtlStatus(createdKey.apiKey, parsedKey);
    } finally {
      if (app) {
        await cleanupApp(app);
      }
    }
  });
});
