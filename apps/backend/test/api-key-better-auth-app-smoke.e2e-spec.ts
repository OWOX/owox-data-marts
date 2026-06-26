import { randomUUID } from 'node:crypto';

import {
  cleanupApp,
  completeBetterAuthMagicLink,
  createProjectMemberApiKey,
  decodeApiKey,
  exchangeApiKey,
  expectApiKeyManagementRejected,
  expectApiKeyAuthContext,
  expectApiKeyAuthContextStatus,
  expectCtlStatus,
  expectDataMartsAccessible,
  readBrowserAccessToken,
  startOwoxApp,
  type StartedApp,
} from './utils/api-key-app-smoke';

// Kept separate from the Null IDP smoke so Jest --shard can split the app boots across runners.
jest.setTimeout(180_000);

describe('Better Auth app smoke (e2e)', () => {
  it('creates an API key, exchanges it, binds the token, and works with owox-ctl status', async () => {
    const primaryAdminEmail = `admin-${randomUUID()}@example.test`;
    let app: StartedApp | undefined;

    try {
      app = await startOwoxApp('better-auth', {
        IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL: primaryAdminEmail,
      });

      const session = await completeBetterAuthMagicLink(app, primaryAdminEmail);
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
      await expectApiKeyAuthContextStatus(app.origin, undefined, parsedKey.apiKeyId, 401);
      await expectApiKeyManagementRejected(app.origin, apiKeyAccessToken, parsedKey.apiKeyId);
      await expectDataMartsAccessible(app.origin, apiKeyAccessToken, parsedKey.apiKeyId);
      await expectCtlStatus(createdKey.apiKey, parsedKey);
    } finally {
      if (app) {
        await cleanupApp(app);
      }
    }
  });
});
