// packages/connectors/tests/regression/microsoftads-google-signin.test.js
//
// Microsoft Advertising users who sign in with Google need a Google-issued token: a
// Microsoft-identity token for the same email is rejected with error 126
// IdentityTypeMismatch on every request. These tests pin the Google path of
// MicrosoftAdsSource and that the Microsoft path stays as it was:
// - a Credential whose client ID is a Google OAuth client refreshes at Google, with no
//   scope and no rotated refresh token reported back, once for the whole run;
// - only such a Credential sends `IdentityProvider: Google`;
// - error 126 on a run names the button to reconnect with, says when the server does not
//   offer Sign in with Google yet, is a warning, and is not requested from the API again;
// - other API errors read as Microsoft Advertising's own message, under the context
//   the failing request adds;
// - "Sign in with Google" exchanges the code with the Google client and checks the user
//   with GetUser, and either sign-in of the wrong type fails with a clear message.
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { withBuildLock, buildBundle } from '../buildBundleOnce.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');

const GOOGLE_CLIENT_ID = '123456-abcdef.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = 'a90adc33-0000-4000-8000-000000000000';
const AD_PERFORMANCE_FIELDS = [
  'AccountId',
  'CampaignId',
  'AdGroupId',
  'AdId',
  'TimePeriod',
  'CurrencyCode',
  'AdDistribution',
  'DeviceType',
  'DeviceOS',
  'Network',
  'TopVsOther',
  'BidMatchType',
  'DeliveredMatchType',
  'Language',
  'CampaignType',
];
const IDENTITY_TYPE_MISMATCH = {
  Errors: [
    {
      Code: 126,
      Message: 'You must use a different identity type to sign in to Bing Ads with the same email.',
      Detail: null,
      ErrorCode: 'IdentityTypeMismatch',
    },
  ],
  Type: 'AdApiFaultDetail',
};

// The server's "Sign in with Google" variables, read from the environment at run time
const GOOGLE_SIGN_IN_ENV = {
  OAUTH_MICROSOFT_ADS_GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID,
  OAUTH_MICROSOFT_ADS_GOOGLE_CLIENT_SECRET: 'google-secret',
  OAUTH_GOOGLE_REDIRECT_URI: 'https://app.example.com/oauth/google/callback',
};

let OWOX;
let originalFetch;
let originalEnv;
let requests;

before(() => {
  withBuildLock(() => {
    buildBundle(pkgRoot);
    OWOX = require(path.join(pkgRoot, 'dist', 'index.cjs'));
  });
});

beforeEach(() => {
  originalFetch = global.fetch;
  requests = [];
  originalEnv = {};
  for (const key of Object.keys(GOOGLE_SIGN_IN_ENV)) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function makeSource(clientId) {
  const { Core, MicrosoftAds } = OWOX;
  const ctx = new Core.AbstractContext({
    source: {
      name: 'MicrosoftAds',
      config: {
        AuthType: {
          value: 'oauth2',
          items: {
            ClientId: { value: clientId },
            ClientSecret: { value: 'client-secret' },
            RefreshToken: { value: 'refresh-token' },
            DeveloperToken: { value: 'developer-token' },
          },
        },
        AccountIDs: { value: '123456789' },
        CustomerID: { value: '987654321' },
        Fields: { value: AD_PERFORMANCE_FIELDS.map(field => `ad_performance_report ${field}`) },
      },
    },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
  return { ctx, source: new MicrosoftAds.MicrosoftAdsSource(ctx) };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Routes each request by URL and records it with its headers and parsed body. */
function stubFetch(route) {
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const body = typeof options.body === 'string' ? options.body : '';
    let parsed;
    try {
      parsed = body.startsWith('{')
        ? JSON.parse(body)
        : Object.fromEntries(new URLSearchParams(body));
    } catch {
      parsed = body;
    }
    requests.push({
      url: href,
      headers: options.headers ?? {},
      body: parsed,
      signal: options.signal,
    });
    return route(href, parsed);
  };
}

const fetchAdPerformance = source =>
  source.fetchData({
    nodeName: 'ad_performance_report',
    accountId: '123456789',
    fields: AD_PERFORMANCE_FIELDS,
    startDate: '2026-11-01',
    endDate: '2026-11-01',
  });

test('a Credential with a Google client refreshes at Google and reports no rotated token', async () => {
  const { ctx, source } = makeSource(GOOGLE_CLIENT_ID);
  const reported = [];
  ctx.updateCredentials = credentials => reported.push(credentials);
  stubFetch(() => jsonResponse({ access_token: 'google-access-token', expires_in: 3599 }));

  await source.getAccessToken();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(requests[0].body.grant_type, 'refresh_token');
  assert.equal(requests[0].body.client_id, GOOGLE_CLIENT_ID);
  assert.equal(requests[0].body.refresh_token, 'refresh-token');
  assert.equal(requests[0].body.scope, undefined, 'Google takes no scope on a refresh');
  assert.equal(source._getAccessTokenValue(), 'google-access-token');
  assert.deepEqual(reported, []);
});

test('a Google client ID typed with a trailing line break is sent without it', async () => {
  const { source } = makeSource(`${GOOGLE_CLIENT_ID}\n `);
  stubFetch(() => jsonResponse({ access_token: 'google-access-token' }));

  await source.getAccessToken();

  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(requests[0].body.client_id, GOOGLE_CLIENT_ID);
});

test('a Google access token serves every day of the run', async () => {
  const { source } = makeSource(GOOGLE_CLIENT_ID);
  stubFetch(url => {
    if (url.includes('/token')) return jsonResponse({ access_token: 'access-token' });
    if (url.endsWith('/GenerateReport/Submit')) return jsonResponse({ ReportRequestId: 'r1' });
    return jsonResponse({ ReportRequestStatus: { Status: 'Success', ReportDownloadUrl: null } });
  });

  await fetchAdPerformance(source);
  await fetchAdPerformance(source);

  assert.equal(requests.filter(request => request.url.includes('/token')).length, 1);
});

test('a revoked Google grant is a warning: the user must reconnect', async () => {
  const { source } = makeSource(GOOGLE_CLIENT_ID);
  stubFetch(() =>
    jsonResponse(
      { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
      400
    )
  );

  await assert.rejects(source.getAccessToken(), error => {
    assert.match(error.message, /invalid_grant/);
    assert.equal(error.isWarning, true);
    return true;
  });
});

for (const [label, clientId, expected] of [
  ['Google', GOOGLE_CLIENT_ID, 'Google'],
  ['Microsoft', MICROSOFT_CLIENT_ID, undefined],
]) {
  test(`a ${label} Credential ${expected ? 'sends' : 'does not send'} IdentityProvider on Reporting requests`, async () => {
    const { source } = makeSource(clientId);
    stubFetch(url => {
      if (url.includes('/token')) return jsonResponse({ access_token: 'access-token' });
      if (url.endsWith('/GenerateReport/Submit')) return jsonResponse({ ReportRequestId: 'r1' });
      return jsonResponse({ ReportRequestStatus: { Status: 'Success', ReportDownloadUrl: null } });
    });

    const rows = await fetchAdPerformance(source);

    assert.deepEqual(rows, []);
    const apiRequests = requests.filter(request => request.url.includes('/Reporting/'));
    assert.equal(apiRequests.length, 2, 'Submit and Poll');
    for (const request of apiRequests) {
      assert.equal(request.headers.IdentityProvider, expected);
      assert.equal(request.headers.Authorization, 'Bearer access-token');
      assert.equal(request.headers.DeveloperToken, 'developer-token');
    }
  });
}

test('error 126 on a run names the button to reconnect with and is asked only once', async () => {
  Object.assign(process.env, GOOGLE_SIGN_IN_ENV);
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url.includes('/token')
      ? jsonResponse({ access_token: 'access-token', refresh_token: 'rotated' })
      : jsonResponse(IDENTITY_TYPE_MISMATCH, 400)
  );

  const isMismatch = error => {
    assert.match(error.message, /error 126 IdentityTypeMismatch/);
    assert.match(error.message, /Reconnect the Credential: Sign in with Google/);
    assert.equal(error.isWarning, true);
    return true;
  };
  await assert.rejects(fetchAdPerformance(source), isMismatch);
  assert.equal(
    requests.filter(request => request.url.endsWith('/GenerateReport/Submit')).length,
    1
  );

  requests = [];
  await assert.rejects(fetchAdPerformance(source), isMismatch);
  assert.deepEqual(requests, [], 'the next day must not ask Microsoft Advertising again');
});

test('error 126 on a run says when the server does not offer Sign in with Google yet', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url.includes('/token')
      ? jsonResponse({ access_token: 'access-token' })
      : jsonResponse(IDENTITY_TYPE_MISMATCH, 400)
  );

  await assert.rejects(
    fetchAdPerformance(source),
    /Reconnect the Credential: Sign in with Microsoft with the other account, or Sign in with Google once your administrator sets it up for Microsoft Ads on this server\./
  );
});

test('error 126 in the operation errors of a Submit answer is handled the same way', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url.includes('/token')
      ? jsonResponse({ access_token: 'access-token' })
      : jsonResponse({ OperationErrors: IDENTITY_TYPE_MISMATCH.Errors })
  );

  await assert.rejects(fetchAdPerformance(source), error => {
    assert.match(error.message, /error 126 IdentityTypeMismatch/);
    assert.equal(error.isWarning, true);
    return true;
  });
});

test('other Microsoft Advertising errors read as their own message, not raw JSON', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url.includes('/token')
      ? jsonResponse({ access_token: 'access-token' })
      : jsonResponse(
          {
            Errors: [
              {
                Code: 105,
                ErrorCode: 'InvalidCredentials',
                Message:
                  'Authentication failed. Either supplied credentials are invalid or the account is inactive',
              },
            ],
            Type: 'AdApiFaultDetail',
          },
          401
        )
  );

  await assert.rejects(fetchAdPerformance(source), error => {
    assert.equal(
      error.message,
      'HTTP 401: Authentication failed. Either supplied credentials are invalid or the account is inactive (105 InvalidCredentials)'
    );
    assert.equal(error.isWarning, true);
    return true;
  });
});

const fetchCampaigns = source =>
  source.fetchData({ nodeName: 'campaigns', accountId: '123456789', fields: ['Id'] });

test('a Google Credential sends IdentityProvider on Bulk requests', async () => {
  const { source } = makeSource(GOOGLE_CLIENT_ID);
  stubFetch(url => {
    if (url.includes('/token')) return jsonResponse({ access_token: 'access-token' });
    if (url.endsWith('/Campaigns/DownloadByAccountIds')) {
      return jsonResponse({ DownloadRequestId: 'd1' });
    }
    return jsonResponse({ RequestStatus: 'Failed' });
  });

  await assert.rejects(fetchCampaigns(source), /Bulk download failed/);

  const bulkRequests = requests.filter(request => request.url.includes('/Bulk/'));
  assert.deepEqual(
    bulkRequests.map(request => request.url.split('/Bulk/v13/')[1]),
    ['Campaigns/DownloadByAccountIds', 'BulkDownloadStatus/Query']
  );
  for (const request of bulkRequests) {
    assert.equal(request.headers.IdentityProvider, 'Google');
    assert.equal(request.headers.CustomerAccountId, '123456789');
  }
});

test('error 126 on a Bulk request of a Google Credential points to Sign in with Microsoft', async () => {
  const { source } = makeSource(GOOGLE_CLIENT_ID);
  stubFetch(url =>
    url.includes('/token')
      ? jsonResponse({ access_token: 'access-token' })
      : jsonResponse(IDENTITY_TYPE_MISMATCH, 400)
  );

  await assert.rejects(fetchCampaigns(source), error => {
    assert.match(
      error.message,
      /signs in with a Microsoft account, not with Google\. Reconnect the Credential: Sign in with Microsoft\./
    );
    assert.equal(error.isWarning, true);
    return true;
  });
});

test('a Keywords batch failure names Keywords and the API message and stays a warning', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  const logs = [];
  source.context.log = (level, message) => logs.push({ level, message });
  stubFetch(() =>
    jsonResponse(
      {
        Errors: [{ Code: 105, ErrorCode: 'InvalidCredentials', Message: 'Authentication failed.' }],
      },
      401
    )
  );

  await assert.rejects(
    source._fetchEntityByCampaigns({
      accountId: '123456789',
      entityType: 'Keywords',
      campaignIds: ['10'],
      onBatchReady: async () => {},
    }),
    error => {
      assert.equal(
        error.message,
        'Failed to fetch Keywords: HTTP 401: Authentication failed. (105 InvalidCredentials)'
      );
      assert.equal(error.isWarning, true);
      assert.equal(error.statusCode, 401);
      assert.equal(error.payload.Errors[0].Code, 105);
      return true;
    }
  );
  const failure = logs.find(log => log.message.startsWith('Failed to fetch keywords'));
  assert.equal(failure.level, 'warn', 'a failure the user must fix is not an ops error');
});

const GOOGLE_VARS = {
  ClientId: MICROSOFT_CLIENT_ID,
  ClientSecret: 'microsoft-secret',
  RedirectUri: 'https://app.example.com/oauth/microsoft-ads/callback',
  DeveloperToken: 'developer-token',
  GoogleClientId: GOOGLE_CLIENT_ID,
  GoogleClientSecret: 'google-secret',
  GoogleRedirectUri: 'https://app.example.com/oauth/google/callback',
};

test('Sign in with Google exchanges the code with the Google client and names the user', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url === 'https://oauth2.googleapis.com/token'
      ? jsonResponse({
          access_token: 'google-access',
          refresh_token: 'google-refresh',
          expires_in: 3599,
        })
      : jsonResponse({ User: { Id: 42, ContactInfo: { Email: 'advertiser@gmail.com' } } })
  );

  const result = await source.exchangeOauthCredentials(
    { code: 'code', identityProvider: 'google' },
    GOOGLE_VARS
  );

  const [token, getUser] = requests;
  assert.equal(token.url, 'https://oauth2.googleapis.com/token');
  assert.equal(token.body.client_id, GOOGLE_CLIENT_ID);
  assert.equal(token.body.client_secret, 'google-secret');
  assert.equal(token.body.redirect_uri, GOOGLE_VARS.GoogleRedirectUri);
  assert.equal(token.body.scope, undefined);
  assert.match(getUser.url, /\/CustomerManagement\/v13\/User\/Query$/);
  assert.equal(getUser.headers.IdentityProvider, 'Google');
  assert.equal(getUser.headers.Authorization, 'Bearer google-access');
  assert.equal(result.secret.client_id, GOOGLE_CLIENT_ID);
  assert.equal(result.secret.client_secret, 'google-secret');
  assert.equal(result.secret.refresh_token, 'google-refresh');
  assert.equal(result.secret.developer_token, 'developer-token');
  assert.deepEqual(result.user, { id: '42', name: 'advertiser@gmail.com' });
  assert.ok(getUser.signal instanceof AbortSignal, 'GetUser must not hold the sign-in up');
});

test('Sign in with Google refused with error 105 names the account and the server setup', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url === 'https://oauth2.googleapis.com/token'
      ? jsonResponse({ access_token: 'google-access', refresh_token: 'google-refresh' })
      : jsonResponse(
          {
            Errors: [
              { Code: 105, ErrorCode: 'InvalidCredentials', Message: 'Authentication failed.' },
            ],
            TrackingId: 't-1',
          },
          401
        )
  );

  await assert.rejects(
    source.exchangeOauthCredentials({ code: 'code', identityProvider: 'google' }, GOOGLE_VARS),
    error => {
      assert.match(error.message, /error 105 InvalidCredentials, tracking ID t-1/);
      assert.match(error.message, /the Google account you use for Microsoft Advertising/);
      assert.match(error.message, /Microsoft Ads Google client and developer token/);
      return true;
    }
  );
});

test('Sign in with Google for a user who signs in with Microsoft points to Sign in with Microsoft', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url === 'https://oauth2.googleapis.com/token'
      ? jsonResponse({ access_token: 'google-access', refresh_token: 'google-refresh' })
      : jsonResponse(IDENTITY_TYPE_MISMATCH, 400)
  );

  await assert.rejects(
    source.exchangeOauthCredentials({ code: 'code', identityProvider: 'google' }, GOOGLE_VARS),
    /signs in with a Microsoft account, not with Google\. Use Sign in with Microsoft\./
  );
});

test('Sign in with Microsoft hit by 126 without a reason names both other sign-ins', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url.includes('login.microsoftonline.com')
      ? jsonResponse({ access_token: 'microsoft-access', refresh_token: 'microsoft-refresh' })
      : jsonResponse(IDENTITY_TYPE_MISMATCH, 400)
  );

  await assert.rejects(
    source.exchangeOauthCredentials({ code: 'code' }, GOOGLE_VARS),
    /signs in with another account type: Google, or the other Microsoft account \(work or personal\) of this email\. Use Sign in with Google, or Sign in with Microsoft with the other account\./
  );
  assert.equal(requests[1].headers.IdentityProvider, undefined);
});

for (const [reason, expected] of [
  ['GoogleAccountIsRequired', /signs in with Google\. Use Sign in with Google\./],
  [
    'PersonalAccountIsRequired',
    /signs in with a personal Microsoft account\. Use Sign in with Microsoft and choose the personal account\./,
  ],
  [
    'WorkAccountIsRequired',
    /signs in with a work or school Microsoft account\. Use Sign in with Microsoft and choose the work or school account\./,
  ],
]) {
  test(`Sign in with Microsoft hit by 126 ${reason} names the sign-in to use`, async () => {
    const { source } = makeSource(MICROSOFT_CLIENT_ID);
    stubFetch(url =>
      url.includes('login.microsoftonline.com')
        ? jsonResponse({ access_token: 'microsoft-access', refresh_token: 'microsoft-refresh' })
        : jsonResponse({ Errors: [{ ...IDENTITY_TYPE_MISMATCH.Errors[0], Detail: reason }] }, 400)
    );

    await assert.rejects(source.exchangeOauthCredentials({ code: 'code' }, GOOGLE_VARS), expected);
  });
}

test('Sign in with Microsoft hit by 126 GoogleAccountIsRequired on a server without a Google client', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(url =>
    url.includes('login.microsoftonline.com')
      ? jsonResponse({ access_token: 'microsoft-access', refresh_token: 'microsoft-refresh' })
      : jsonResponse(
          {
            Errors: [{ ...IDENTITY_TYPE_MISMATCH.Errors[0], Detail: 'GoogleAccountIsRequired' }],
          },
          400
        )
  );

  await assert.rejects(
    source.exchangeOauthCredentials(
      { code: 'code' },
      { ...GOOGLE_VARS, GoogleClientId: undefined, GoogleClientSecret: undefined }
    ),
    /signs in with Google\. Use Sign in with Google once your administrator sets it up for Microsoft Ads on this server\./
  );
});

test('Sign in with Microsoft still saves the Credential when GetUser cannot be reached', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), headers: options?.headers ?? {} });
    if (String(url).includes('login.microsoftonline.com')) {
      return jsonResponse({ access_token: 'microsoft-access', refresh_token: 'microsoft-refresh' });
    }
    throw new Error('network down');
  };

  const result = await source.exchangeOauthCredentials({ code: 'code' }, GOOGLE_VARS);

  assert.equal(result.secret.client_id, MICROSOFT_CLIENT_ID);
  assert.deepEqual(result.user, { id: 'unknown', name: 'Microsoft Ads User' });
});

test('Sign in with Google is refused when the server has no Google client', async () => {
  const { source } = makeSource(MICROSOFT_CLIENT_ID);
  stubFetch(() => assert.fail('no request expected'));

  await assert.rejects(
    source.exchangeOauthCredentials(
      { code: 'code', identityProvider: 'google' },
      { ...GOOGLE_VARS, GoogleClientId: undefined, GoogleClientSecret: undefined }
    ),
    /Sign in with Google is not configured/
  );
  assert.deepEqual(requests, []);
});
