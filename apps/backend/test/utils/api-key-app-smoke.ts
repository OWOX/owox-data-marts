import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertCliManifestsPrepared } from './cli-manifest-setup';

type JsonRecord = Record<string, unknown>;

type CreatedApiKey = {
  apiKeyId: string;
  apiKey: string;
};

export type ParsedApiKey = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
};

export type StartedApp = {
  origin: string;
  tempDir: string;
  logs: () => string;
  stop: () => Promise<void>;
  waitForLog: (pattern: RegExp) => Promise<RegExpMatchArray>;
};

const backendTestRoot = __dirname;
const backendRoot = resolve(backendTestRoot, '../..');
const repoRoot = resolve(backendRoot, '../..');
const owoxRoot = resolve(repoRoot, 'apps/owox');
const ctlRoot = resolve(repoRoot, 'apps/ctl');
const maxLogChars = 120_000;
const appSecret = 'test-secret-for-better-auth-e2e-32-characters';

export async function startOwoxApp(
  idpProvider: 'none' | 'better-auth',
  envOverrides: NodeJS.ProcessEnv = {}
): Promise<StartedApp> {
  assertCliManifestsPrepared();

  const port = await getAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  const tempDir = mkdtempSync(join(tmpdir(), `owox-api-key-smoke-${idpProvider}-`));
  const appDbPath = join(tempDir, 'app.sqlite');
  const authDbPath = join(tempDir, 'auth.sqlite');
  let bufferedLogs = '';
  let exited: { code: number | null; signal: NodeJS.Signals | null } | null = null;

  const child = spawn(process.execPath, ['./bin/run.js', 'serve', '--no-web-enabled'], {
    cwd: owoxRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OWOX_TELEMETRY_DISABLED: '1',
      DB_TYPE: 'sqlite',
      SQLITE_DB_PATH: appDbPath,
      IDP_PROVIDER: idpProvider,
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      LOG_FORMAT: 'json',
      IDP_BETTER_AUTH_SECRET: appSecret,
      IDP_BETTER_AUTH_DATABASE_TYPE: 'sqlite',
      IDP_BETTER_AUTH_SQLITE_DB_PATH: authDbPath,
      IDP_BETTER_AUTH_BASE_URL: origin,
      IDP_BETTER_AUTH_TRUSTED_ORIGINS: origin,
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendLogs = (chunk: Buffer) => {
    bufferedLogs = `${bufferedLogs}${chunk.toString('utf8')}`;
    if (bufferedLogs.length > maxLogChars) {
      bufferedLogs = bufferedLogs.slice(-maxLogChars);
    }
  };

  child.stdout.on('data', appendLogs);
  child.stderr.on('data', appendLogs);
  child.once('exit', (code, signal) => {
    exited = { code, signal };
  });

  const logs = () => bufferedLogs;

  const stop = async () => {
    if (exited) {
      return;
    }

    const exitPromise = new Promise<void>(resolveExit => {
      child.once('exit', () => resolveExit());
    });

    child.kill('SIGTERM');
    const stoppedGracefully = await Promise.race([
      exitPromise.then(() => true),
      delay(10_000).then(() => false),
    ]);

    if (!stoppedGracefully && !exited) {
      child.kill('SIGKILL');
      await Promise.race([exitPromise, delay(2_000)]);
    }
  };

  const waitForLog = async (pattern: RegExp) => {
    const match = await waitUntil(`log pattern ${pattern}`, () => {
      if (exited) {
        throw new Error(
          `owox serve exited before ${pattern} appeared: ${formatExit(exited)}\n${logs()}`
        );
      }
      return logs().match(pattern);
    });
    return match;
  };

  try {
    await waitUntil('owox serve readiness', async () => {
      if (exited) {
        throw new Error(`owox serve exited before readiness: ${formatExit(exited)}\n${logs()}`);
      }

      try {
        const response = await fetch(`${origin}/health/ready`);
        return response.status === 200;
      } catch {
        return false;
      }
    });
  } catch (error) {
    await stop();
    rmSync(tempDir, { force: true, recursive: true });
    throw error;
  }

  return { origin, tempDir, logs, stop, waitForLog };
}

export async function cleanupApp(app: StartedApp): Promise<void> {
  await app.stop();
  rmSync(app.tempDir, { force: true, recursive: true });
}

export async function signInNullIdp(origin: string): Promise<CookieJar> {
  const jar = new CookieJar();
  const response = await jar.fetch(`${origin}/auth/sign-in`, { redirect: 'manual' });
  expect(response.status).toBe(302);
  expect(jar.header()).toContain('refreshToken=');
  return jar;
}

export async function completeBetterAuthMagicLink(
  app: StartedApp,
  primaryAdminEmail: string
): Promise<CookieJar> {
  const magicLinkMatch = await app.waitForLog(/Magic link: (https?:\/\/[^\s"]+)/);
  const magicLink = magicLinkMatch[1];
  expect(typeof magicLink).toBe('string');
  expect(magicLink.length).toBeGreaterThan(0);

  const preConfirmResponse = await fetch(magicLink);
  expect(preConfirmResponse.status).toBe(200);

  const preConfirmHtml = await preConfirmResponse.text();
  const verifyUrl = extractMagicLinkVerifyUrl(preConfirmHtml);
  const session = new CookieJar();
  const setupPasswordResponse = await followRedirects(app.origin, session, verifyUrl);
  expect(setupPasswordResponse.status).toBe(200);
  expect(new URL(setupPasswordResponse.url).pathname).toBe('/auth/setup-password');

  const userResponse = await fetchJson<JsonRecord>(`${app.origin}/auth/api/user`, {
    headers: session.headers(),
  });
  expect(userResponse.status).toBe(200);
  expect(userResponse.body.email).toBe(primaryAdminEmail);

  return session;
}

export async function readBrowserAccessToken(origin: string, session: CookieJar): Promise<string> {
  const response = await fetchJson<JsonRecord>(`${origin}/auth/access-token`, {
    headers: session.headers(),
  });

  expect(response.status).toBe(200);
  expect(typeof response.body.accessToken).toBe('string');
  expect((response.body.accessToken as string).length).toBeGreaterThan(0);
  return response.body.accessToken as string;
}

export async function createProjectMemberApiKey(
  origin: string,
  memberAccessToken: string
): Promise<CreatedApiKey> {
  const response = await fetchJson<JsonRecord>(`${origin}/api/project-member-api-keys`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-owox-authorization': `Bearer ${memberAccessToken}`,
    },
    body: JSON.stringify({ name: `e2e-${randomUUID()}` }),
  });

  expect(response.status).toBe(201);
  expect(typeof response.body.apiKeyId).toBe('string');
  expect(typeof response.body.apiKey).toBe('string');
  expect((response.body.apiKeyId as string).length).toBeGreaterThan(0);
  expect((response.body.apiKey as string).length).toBeGreaterThan(0);

  return response.body as CreatedApiKey;
}

export async function exchangeApiKey(origin: string, apiKey: ParsedApiKey): Promise<string> {
  const response = await fetchJson<JsonRecord>(`${origin}/api/auth/api-keys/exchange`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-owox-api-key-id': apiKey.apiKeyId,
    },
    body: JSON.stringify({ apiKeySecret: apiKey.apiKeySecret }),
  });

  expect(response.status).toBe(200);
  expect(typeof response.body.accessToken).toBe('string');
  expect((response.body.accessToken as string).length).toBeGreaterThan(0);
  return response.body.accessToken as string;
}

export async function expectApiKeyAuthContext(
  origin: string,
  accessToken: string,
  apiKeyId: string
): Promise<void> {
  const response = await fetchJson<JsonRecord>(`${origin}/api/auth/context`, {
    headers: apiKeyAuthHeaders(accessToken, apiKeyId),
  });

  expect(response.status).toBe(200);
  expect(response.body.authFlow).toBe('api_key');
  expect(response.body.apiKeyId).toBe(apiKeyId);
  expect(typeof response.body.projectId).toBe('string');
  expect(typeof response.body.userId).toBe('string');
}

export async function expectApiKeyAuthContextStatus(
  origin: string,
  accessToken: string | undefined,
  apiKeyId: string | undefined,
  expectedStatus: number
): Promise<void> {
  const response = await fetch(`${origin}/api/auth/context`, {
    headers: apiKeyAuthHeaders(accessToken, apiKeyId),
  });
  expect(response.status).toBe(expectedStatus);
}

export async function expectApiKeyManagementRejected(
  origin: string,
  accessToken: string,
  apiKeyId: string
): Promise<void> {
  const headers = apiKeyAuthHeaders(accessToken, apiKeyId);

  await expectStatus(`${origin}/api/project-member-api-keys`, { headers }, 403);
  await expectStatus(
    `${origin}/api/project-member-api-keys`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'must-not-create' }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/project-member-api-keys/${apiKeyId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'must-not-update' }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/project-member-api-keys/${apiKeyId}`,
    { method: 'DELETE', headers },
    403
  );
}

export async function expectProjectMemberAdministrationRejected(
  origin: string,
  accessToken: string,
  apiKeyId: string
): Promise<void> {
  const headers = apiKeyAuthHeaders(accessToken, apiKeyId);
  const jsonHeaders = { ...headers, 'content-type': 'application/json' };

  await expectStatus(`${origin}/api/members`, { headers }, 403);
  await expectStatus(`${origin}/api/members/user-provisioning-settings`, { headers }, 403);
  await expectStatus(
    `${origin}/api/members/invite`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'new-member@example.test', role: 'viewer' }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/members/user-provisioning-settings`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ defaultRole: 'viewer' }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/members/user-2`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'viewer' }),
    },
    403
  );
  await expectStatus(`${origin}/api/members/user-2`, { method: 'DELETE', headers }, 403);
  await expectStatus(`${origin}/api/members/requests`, { headers }, 403);
  await expectStatus(
    `${origin}/api/members/requests/request-1/approve`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'viewer' }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/members/requests/request-1/decline`,
    { method: 'POST', headers },
    403
  );
}

export async function expectUserProvisioningRejected(
  origin: string,
  accessToken: string,
  apiKeyId: string
): Promise<void> {
  const headers = apiKeyAuthHeaders(accessToken, apiKeyId);
  const jsonHeaders = { ...headers, 'content-type': 'application/json' };

  await expectStatus(`${origin}/api/user-provisioning/request-access-context`, { headers }, 403);
  await expectStatus(
    `${origin}/api/user-provisioning/request-access`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'viewer' }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/user-provisioning/create-new-project`,
    { method: 'POST', headers },
    403
  );
}

export async function expectIntercomJwtRejected(
  origin: string,
  accessToken: string,
  apiKeyId: string
): Promise<void> {
  await expectStatus(
    `${origin}/api/intercom/jwt`,
    { method: 'POST', headers: apiKeyAuthHeaders(accessToken, apiKeyId) },
    403
  );
}

export async function expectAccessControlMutationsRejected(
  origin: string,
  accessToken: string,
  apiKeyId: string
): Promise<void> {
  const headers = apiKeyAuthHeaders(accessToken, apiKeyId);
  const jsonHeaders = { ...headers, 'content-type': 'application/json' };

  await expectStatus(
    `${origin}/api/contexts`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'must-not-create' }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/contexts/context-1`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'must-not-update' }),
    },
    403
  );
  await expectStatus(`${origin}/api/contexts/context-1`, { method: 'DELETE', headers }, 403);
  await expectStatus(
    `${origin}/api/contexts/context-1/members`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ assignedUserIds: ['user-1'] }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/data-marts/data-mart-1/owners`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ businessOwnerIds: ['user-1'], technicalOwnerIds: ['user-1'] }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/data-marts/data-mart-1/contexts`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ contextIds: ['context-1'] }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/data-storages/storage-1`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        title: 'Storage',
        config: {},
        ownerIds: ['user-1'],
        contextIds: ['context-1'],
      }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/data-storages`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ type: 'GOOGLE_BIGQUERY', ownerIds: ['user-1'] }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/data-destinations/destination-1`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        title: 'Destination',
        ownerIds: ['user-1'],
        contextIds: ['context-1'],
      }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/data-destinations`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        title: 'Destination',
        type: 'GOOGLE_SHEETS',
        ownerIds: ['user-1'],
      }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/reports`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        title: 'Report',
        dataMartId: 'data-mart-1',
        dataDestinationId: 'destination-1',
        destinationConfig: {},
        ownerIds: ['user-1'],
      }),
    },
    403
  );
  await expectStatus(
    `${origin}/api/reports/report-1`,
    {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        title: 'Report',
        dataDestinationId: 'destination-1',
        destinationConfig: {},
        ownerIds: ['user-1'],
      }),
    },
    403
  );
}

export async function expectDataMartsAccessible(
  origin: string,
  accessToken: string,
  apiKeyId: string
): Promise<void> {
  await expectStatus(
    `${origin}/api/data-marts`,
    { headers: apiKeyAuthHeaders(accessToken, apiKeyId) },
    200
  );
}

export async function expectCtlStatus(
  fullApiKey: string,
  parsedApiKey: ParsedApiKey
): Promise<void> {
  const result = await runCtlStatus(fullApiKey);
  if (result.status !== 0) {
    throw new Error(
      `owox-ctl status failed with exit code ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const status = JSON.parse(result.stdout) as JsonRecord;
  expect(status.authenticated).toBe(true);
  expect(status.apiOrigin).toBe(parsedApiKey.apiOrigin);
  expect(status.apiKeyId).toBe(parsedApiKey.apiKeyId);
  expect(status.project).toEqual(expect.any(Object));
  expect(status.member).toEqual(expect.any(Object));
  expectJsonValueNotToHaveKey(status, 'authFlow');

  const renderedStatus = JSON.stringify(status);
  expect(renderedStatus.includes(fullApiKey)).toBe(false);
  expect(renderedStatus.includes(parsedApiKey.apiKeySecret)).toBe(false);
}

export function decodeApiKey(apiKey: string): ParsedApiKey {
  const prefix = 'owox_key_';
  expect(apiKey.startsWith(prefix)).toBe(true);

  const decoded = JSON.parse(
    Buffer.from(apiKey.slice(prefix.length), 'base64url').toString('utf8')
  );
  expect(decoded).toEqual(expect.any(Object));
  expect(typeof decoded.apiOrigin).toBe('string');
  expect(typeof decoded.apiKeyId).toBe('string');
  expect(typeof decoded.apiKeySecret).toBe('string');

  return decoded as ParsedApiKey;
}

async function runCtlStatus(apiKey: string): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  assertCliManifestsPrepared();

  return new Promise(resolveRun => {
    const child = spawn(process.execPath, ['./bin/run.js', 'status'], {
      cwd: ctlRoot,
      env: {
        ...process.env,
        OWOX_API_KEY: apiKey,
        OWOX_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.once('exit', status => resolveRun({ status, stdout, stderr }));
  });
}

function expectJsonValueNotToHaveKey(value: unknown, key: string): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      expectJsonValueNotToHaveKey(item, key);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [entryKey, entryValue] of Object.entries(value as JsonRecord)) {
    expect(entryKey).not.toBe(key);
    expectJsonValueNotToHaveKey(entryValue, key);
  }
}

function extractMagicLinkVerifyUrl(html: string): string {
  const match = html.match(/id="continue-link"[^>]+href="([^"]+)"/);
  if (!match) {
    throw new Error('Magic link preconfirm page did not include a continue link');
  }
  return match[1].replaceAll('&amp;', '&');
}

async function followRedirects(
  origin: string,
  jar: CookieJar,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  let nextUrl = new URL(url, origin).toString();
  let nextInit = { ...init };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await jar.fetch(nextUrl, {
      ...nextInit,
      redirect: 'manual',
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    nextUrl = new URL(location, nextUrl).toString();
    if (response.status === 303) {
      nextInit = { method: 'GET' };
    }
  }

  throw new Error(`Too many redirects while following ${url}`);
}

async function expectStatus(url: string, init: RequestInit, expectedStatus: number): Promise<void> {
  const response = await fetch(url, init);
  expect(response.status).toBe(expectedStatus);
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {}
): Promise<{ status: number; body: T }> {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : (undefined as T);
  return { status: response.status, body };
}

function apiKeyAuthHeaders(
  accessToken: string | undefined,
  apiKeyId: string | undefined
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['x-owox-authorization'] = `Bearer ${accessToken}`;
  }
  if (apiKeyId) {
    headers['x-owox-api-key-id'] = apiKeyId;
  }
  return headers;
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Failed to allocate a local port'));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitUntil<T>(
  description: string,
  predicate: () => T | false | Promise<T | false>,
  timeoutMs = 60_000
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await predicate();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolveDelay => {
    setTimeout(resolveDelay, ms);
  });
}

function formatExit(exit: { code: number | null; signal: NodeJS.Signals | null }): string {
  return `code=${exit.code ?? 'null'} signal=${exit.signal ?? 'null'}`;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  headers(init: HeadersInit = {}): Headers {
    const headers = new Headers(init);
    const cookieHeader = this.header();
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }
    return headers;
  }

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: this.headers(init.headers),
    });
    this.store(response);
    return response;
  }

  private store(response: Response): void {
    for (const cookie of getSetCookies(response)) {
      const [pair, ...attributes] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator === -1) {
        continue;
      }

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const serializedAttributes = attributes.join(';').toLowerCase();
      if (serializedAttributes.includes('max-age=0')) {
        this.cookies.delete(name);
        continue;
      }

      this.cookies.set(name, value);
    }
  }
}

function getSetCookies(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = headersWithSetCookie.getSetCookie?.();
  if (cookies) {
    return cookies;
  }

  const singleCookie = response.headers.get('set-cookie');
  return singleCookie ? [singleCookie] : [];
}
