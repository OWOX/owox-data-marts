import { JWT } from 'google-auth-library';
import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import {
  GoogleServiceAccountTokenService,
  GoogleTokenError,
} from './google-service-account-token.service';

const DOCS = 'https://www.googleapis.com/auth/documents';
const SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
const MINTED = { data: { access_token: 'access-1', expires_in: 3599 } };

type Answer = { status?: number; data: Record<string, unknown> } | Error;

/** Stands in for gaxios; JWT also registers interceptors on it. */
function transporter(...answers: Answer[]) {
  const request = jest.fn(async (_options: { url: string; data: URLSearchParams }) => {
    const answer = answers.length > 1 ? answers.shift()! : answers[0];
    if (answer instanceof Error) throw answer;
    if ((answer.status ?? 200) >= 400) {
      throw Object.assign(new Error('Request failed'), { response: answer });
    }
    return { status: 200, data: answer.data };
  });
  return { request, interceptors: { request: { add: jest.fn() }, response: { add: jest.fn() } } };
}

const secret = { value: serviceAccountKey() };
const tokenRequest = (overrides: Record<string, unknown> = {}) => ({
  credentialId: 'credential-1',
  secret,
  scopes: [DOCS],
  signal: new AbortController().signal,
  ...overrides,
});

function claims(fake: ReturnType<typeof transporter>, call = 0): Record<string, unknown> {
  const assertion = String(fake.request.mock.calls[call][0].data.get('assertion'));
  return JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
}

describe('GoogleServiceAccountTokenService', () => {
  it('mints once per Credential, key and scopes', async () => {
    const fake = transporter(MINTED);
    const service = new GoogleServiceAccountTokenService(fake as never);

    await expect(service.getAccessToken(tokenRequest())).resolves.toBe('access-1');
    await service.getAccessToken(tokenRequest());
    expect(fake.request).toHaveBeenCalledTimes(1);
    expect(claims(fake).scope).toBe(DOCS);

    await service.getAccessToken(tokenRequest({ credentialId: 'credential-2' }));
    await service.getAccessToken(tokenRequest({ secret: { value: serviceAccountKey() } }));
    await service.getAccessToken(tokenRequest({ scopes: [DOCS, SHEETS] }));
    expect(fake.request).toHaveBeenCalledTimes(4);
  });

  it('makes one request for two concurrent first calls', async () => {
    const fake = transporter(MINTED);
    const service = new GoogleServiceAccountTokenService(fake as never);

    await Promise.all([
      service.getAccessToken(tokenRequest()),
      service.getAccessToken(tokenRequest()),
    ]);

    expect(fake.request).toHaveBeenCalledTimes(1);
  });

  it.each<[Answer, string, string | undefined]>([
    [
      {
        status: 400,
        data: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' },
      },
      'rejected',
      'invalid_grant: Invalid JWT Signature.',
    ],
    [
      {
        status: 401,
        data: { error: 'deleted_client', error_description: 'The OAuth client was deleted.' },
      },
      'rejected',
      'deleted_client: The OAuth client was deleted.',
    ],
    [
      { status: 400, data: { error: 'invalid_scope', error_description: 'Bad scope' } },
      'scope',
      undefined,
    ],
    [{ data: { id_token: 'id-only' } }, 'scope', undefined],
    [{ status: 429, data: { error: 'rate_limit_exceeded' } }, 'unavailable', undefined],
    [{ status: 503, data: {} }, 'unavailable', undefined],
    [new Error('socket hang up'), 'unavailable', undefined],
  ])('classifies %j as %s', async (answer, failure, message) => {
    const service = new GoogleServiceAccountTokenService(transporter(answer) as never);

    const error = await service.getAccessToken(tokenRequest()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GoogleTokenError);
    expect((error as GoogleTokenError).failure).toBe(failure);
    if (message) expect((error as GoogleTokenError).message).toBe(message);
  });

  it('does not keep a client whose mint failed', async () => {
    const fake = transporter({ status: 503, data: {} }, MINTED);
    const service = new GoogleServiceAccountTokenService(fake as never);
    const spy = jest.spyOn(JWT.prototype, 'getAccessToken');
    try {
      await expect(service.getAccessToken(tokenRequest())).rejects.toBeInstanceOf(GoogleTokenError);
      await expect(service.getAccessToken(tokenRequest())).resolves.toBe('access-1');
      expect(spy.mock.contexts[0]).not.toBe(spy.mock.contexts[1]);
    } finally {
      spy.mockRestore();
    }
  });

  it('gives up when the caller aborts and lets a later call reuse the mint in flight', async () => {
    const fake = transporter(MINTED);
    let release: (() => void) | undefined;
    fake.request.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ status: 200, data: MINTED.data });
        })
    );
    const service = new GoogleServiceAccountTokenService(fake as never);
    const controller = new AbortController();

    const first = service.getAccessToken(tokenRequest({ signal: controller.signal }));
    controller.abort();
    await expect(first).rejects.toMatchObject({ failure: 'unavailable' });

    const second = service.getAccessToken(tokenRequest());
    await new Promise(resolve => setImmediate(resolve));
    release?.();
    await expect(second).resolves.toBe('access-1');
    expect(fake.request).toHaveBeenCalledTimes(1);
  });

  it('rebuilds a client unused for more than an hour', async () => {
    const fake = transporter({ data: { access_token: 'access-1', expires_in: 86_400 } });
    const service = new GoogleServiceAccountTokenService(fake as never);
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start);
    try {
      await service.getAccessToken(tokenRequest());
      clock.mockReturnValue(start + 59 * 60_000);
      await service.getAccessToken(tokenRequest());
      expect(fake.request).toHaveBeenCalledTimes(1);

      clock.mockReturnValue(start + 59 * 60_000 + 61 * 60_000);
      await service.getAccessToken(tokenRequest());
      expect(fake.request).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('mints again after drop', async () => {
    const fake = transporter(MINTED);
    const service = new GoogleServiceAccountTokenService(fake as never);

    await service.getAccessToken(tokenRequest());
    service.drop({ credentialId: 'credential-1', secret, scopes: [DOCS] }, 'access-1');
    await service.getAccessToken(tokenRequest());

    expect(fake.request).toHaveBeenCalledTimes(2);
  });

  it('keeps a client that already holds a newer token than the refused one', async () => {
    const fake = transporter(MINTED);
    const service = new GoogleServiceAccountTokenService(fake as never);

    await service.getAccessToken(tokenRequest());
    service.drop({ credentialId: 'credential-1', secret, scopes: [DOCS] }, 'refused-token');
    await service.getAccessToken(tokenRequest());

    expect(fake.request).toHaveBeenCalledTimes(1);
  });

  it('adds no logging interceptors that could print token responses', async () => {
    const fake = transporter(MINTED);
    const service = new GoogleServiceAccountTokenService(fake as never);

    await service.getAccessToken(tokenRequest());

    expect(fake.interceptors.request.add).not.toHaveBeenCalled();
    expect(fake.interceptors.response.add).not.toHaveBeenCalled();
  });

  it("posts to Google's token endpoint whatever token_uri the key names", async () => {
    const fake = transporter(MINTED);
    const service = new GoogleServiceAccountTokenService(fake as never);

    await service.getAccessToken(
      tokenRequest({
        secret: { value: serviceAccountKey({ token_uri: 'https://attacker.example/token' }) },
      })
    );

    expect(fake.request.mock.calls[0][0]).toMatchObject({
      url: 'https://oauth2.googleapis.com/token',
    });
  });

  describe('verify', () => {
    it('asks for userinfo.email with a fresh client every time', async () => {
      const fake = transporter(MINTED);
      const service = new GoogleServiceAccountTokenService(fake as never);

      await expect(service.verify(secret)).resolves.toMatchObject({
        state: 'verified',
        message: 'Google issued a token for this key',
      });
      await service.verify(secret);

      expect(fake.request).toHaveBeenCalledTimes(2);
      expect(claims(fake).scope).toBe('https://www.googleapis.com/auth/userinfo.email');
    });

    it.each<[Answer, string, string]>([
      [
        {
          status: 400,
          data: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' },
        },
        'rejected',
        'invalid_grant: Invalid JWT Signature. A key created in the last minute may not work yet.',
      ],
      [{ status: 503, data: {} }, 'unknown', 'Google could not be reached to check the key'],
      [
        { data: { id_token: 'id-only' } },
        'unknown',
        'Google could not be reached to check the key',
      ],
    ])('maps %j to %s', async (answer, state, message) => {
      const service = new GoogleServiceAccountTokenService(transporter(answer) as never);

      await expect(service.verify(secret)).resolves.toMatchObject({ state, message });
    });

    it('rejects a value that is not a key without calling Google', async () => {
      const fake = transporter(MINTED);
      const service = new GoogleServiceAccountTokenService(fake as never);

      await expect(service.verify({ value: 'not json' })).resolves.toMatchObject({
        state: 'rejected',
        message: 'The key is not valid JSON',
      });
      expect(fake.request).not.toHaveBeenCalled();
    });
  });
});
