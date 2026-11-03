import { jest } from '@jest/globals';
import { SendgridMailingProvider } from './sendgrid-provider.js';

describe('SendgridMailingProvider', () => {
  const originalFetch = globalThis.fetch;
  const provider = new SendgridMailingProvider({
    apiKey: 'SG.test',
    verifiedSenderEmail: 'noreply@owox.test',
    verifiedSenderName: 'OWOX',
  });

  let fetchMock: jest.Mock<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sentRequest = () => {
    const [url, init] = fetchMock.mock.calls[0]!;
    return { url, init: init as RequestInit, body: JSON.parse(String(init?.body)) };
  };

  it('sends each recipient a separate email by default', async () => {
    await provider.sendEmail(['a@owox.test', 'b@owox.test'], 'Report', '<p>hi</p>');

    const { url, init, body } = sentRequest();
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer SG.test' });
    expect(body).toEqual({
      personalizations: [{ to: [{ email: 'a@owox.test' }] }, { to: [{ email: 'b@owox.test' }] }],
      from: { email: 'noreply@owox.test', name: 'OWOX' },
      subject: 'Report',
      content: [{ type: 'text/html', value: '<p>hi</p>' }],
    });
  });

  it('puts plain text before HTML and keeps categories', async () => {
    await provider.sendEmail('a@owox.test', 'Sign in', '<p>link</p>', {
      bodyText: 'link',
      categories: ['transactional', 'auth'],
      isMultiple: false,
    });

    expect(sentRequest().body).toMatchObject({
      personalizations: [{ to: [{ email: 'a@owox.test' }] }],
      content: [
        { type: 'text/plain', value: 'link' },
        { type: 'text/html', value: '<p>link</p>' },
      ],
      categories: ['transactional', 'auth'],
    });
  });

  it('drops line breaks from the API key and an empty sender name', async () => {
    const misconfigured = new SendgridMailingProvider({
      apiKey: 'SG.te\nst\r\n',
      verifiedSenderEmail: 'noreply@owox.test',
      verifiedSenderName: '',
    });

    await misconfigured.sendEmail('a@owox.test', 's', 'h');

    const { init, body } = sentRequest();
    expect(init.headers).toMatchObject({ Authorization: 'Bearer SG.test' });
    expect(body.from).toEqual({ email: 'noreply@owox.test' });
  });

  it('rejects with the status and SendGrid error messages on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"errors":[{"message":"Try later","field":null},{"message":"Busy"}]}', {
        status: 503,
        statusText: 'Service Unavailable',
      })
    );

    await expect(provider.sendEmail('a@owox.test', 's', 'h')).rejects.toThrow(
      'SendGrid responded 503 Service Unavailable: Try later; Busy'
    );
  });

  it('cuts a non-JSON error body', async () => {
    fetchMock.mockResolvedValue(
      new Response(`<html>${'x'.repeat(1000)}</html>`, { status: 502, statusText: 'Bad Gateway' })
    );

    const error = await provider.sendEmail('a@owox.test', 's', 'h').catch((e: Error) => e);

    expect((error as Error).message).toBe(
      `SendGrid responded 502 Bad Gateway: <html>${'x'.repeat(494)}`
    );
  });

  it('names the network failure and its code', async () => {
    const socketClosed = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' });
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: socketClosed }));

    await expect(provider.sendEmail('a@owox.test', 's', 'h')).rejects.toThrow(
      'SendGrid network error: UND_ERR_SOCKET other side closed'
    );
  });

  it('lists every address of a failed connect', async () => {
    const refused = Object.assign(
      new AggregateError(
        [new Error('connect ECONNREFUSED 1.2.3.4:443'), new Error('connect ECONNREFUSED ::1:443')],
        ''
      ),
      { code: 'ECONNREFUSED' }
    );
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: refused }));

    await expect(provider.sendEmail('a@owox.test', 's', 'h')).rejects.toThrow(
      'SendGrid network error: ECONNREFUSED connect ECONNREFUSED 1.2.3.4:443 connect ECONNREFUSED ::1:443'
    );
  });
});
