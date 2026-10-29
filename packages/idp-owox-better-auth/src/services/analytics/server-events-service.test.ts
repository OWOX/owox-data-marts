import { describe, expect, it, jest } from '@jest/globals';
import type { Request } from 'express';
import { ServerEventsService, type ServerEventsConfig } from './server-events-service.js';

const config: ServerEventsConfig = {
  collectUrl: 'https://collector.example.com/g/collect',
  measurementId: 'G-TEST',
  visitorCookieName: 'vid',
};

function createRequest(overrides: Partial<Request> = {}, headers: Record<string, string> = {}) {
  return {
    protocol: 'https',
    originalUrl: '/auth/sign-up?utm_source=newsletter&state=secret&error=x',
    get: (name: string) => (name === 'host' ? 'app.example.com' : undefined),
    ip: '203.0.113.7',
    cookies: { vid: '123_456', _ga: 'GA1.1.111.222', other: 'x' },
    headers: {
      referer: 'https://www.example.com/pricing?ref=1',
      'accept-language': 'uk-UA,uk;q=0.9',
      'user-agent': 'UA',
      'sec-ch-ua-platform': '"macOS"',
      ...headers,
    },
    ...overrides,
  } as unknown as Request;
}

function createSend() {
  const calls: { url: URL; init: RequestInit }[] = [];
  const send = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: new URL(url), init });
    return new Response(null, { status: 204 });
  });
  return { calls, send };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('ServerEventsService', () => {
  it('sends a page_view keyed on the visitor cookie, without auth flow state', async () => {
    const { calls, send } = createSend();
    new ServerEventsService(config, send).pageView(createRequest(), 'Sign Up');
    await flush();

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url.origin + url.pathname).toBe('https://collector.example.com/g/collect');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      v: '2',
      tid: 'G-TEST',
      cid: '111.222',
      en: 'page_view',
      dl: 'https://app.example.com/auth/sign-up?utm_source=newsletter',
      dr: 'https://www.example.com/pricing',
      ul: 'uk-ua',
      dt: 'Sign Up',
      'ep.event_source': 'server',
    });
    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBe('vid=123_456');
    expect(headers.get('user-agent')).toBe('UA');
    expect(headers.get('sec-ch-ua-platform')).toBe('"macOS"');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(init.redirect).toBe('manual');
  });

  it('sends a login with the user id', async () => {
    const { calls, send } = createSend();
    new ServerEventsService(config, send).login(createRequest(), 'user-42');
    await flush();

    expect(calls[0].url.searchParams.get('en')).toBe('login');
    expect(calls[0].url.searchParams.get('uid')).toBe('user-42');
  });

  it('sends nothing when off, without a user id, or without a valid visitor cookie', async () => {
    const { send } = createSend();
    new ServerEventsService(undefined, send).pageView(createRequest(), 'Sign In');
    new ServerEventsService(config, send).login(createRequest(), undefined);
    new ServerEventsService(config, send).pageView(createRequest({ cookies: {} }), 'Sign In');
    new ServerEventsService(config, send).pageView(
      createRequest({ cookies: { vid: 'bad value;x=1' } }),
      'Sign In'
    );
    await flush();

    expect(send).not.toHaveBeenCalled();
  });

  it('reads the cookies from the header when they are not parsed', async () => {
    const { calls, send } = createSend();
    new ServerEventsService(config, send).pageView(
      createRequest({ cookies: undefined }, { cookie: 'a=1; vid=7_8; _ga=GA1.2.333.444' }),
      'Sign In'
    );
    await flush();

    expect(calls[0].url.searchParams.get('cid')).toBe('333.444');
    expect(new Headers(calls[0].init.headers).get('cookie')).toBe('vid=7_8');
  });

  it('leaves cid out without a valid Google Analytics cookie', async () => {
    const { calls, send } = createSend();
    const service = new ServerEventsService(config, send);
    service.pageView(createRequest({ cookies: { vid: '123_456' } }), 'Sign In');
    service.pageView(createRequest({ cookies: { vid: '123_456', _ga: 'bad' } }), 'Sign In');
    await flush();

    expect(calls).toHaveLength(2);
    for (const { url } of calls) expect(url.searchParams.has('cid')).toBe(false);
  });

  it('keeps a query already in the collect URL', async () => {
    const { calls, send } = createSend();
    new ServerEventsService(
      { ...config, collectUrl: 'https://collector.example.com/g/collect?env=prod#x' },
      send
    ).pageView(createRequest(), 'Sign In');
    await flush();

    expect(calls[0].url.hash).toBe('');
    expect(calls[0].url.searchParams.get('env')).toBe('prod');
    expect(calls[0].url.searchParams.get('en')).toBe('page_view');
  });

  it('never throws when sending fails', async () => {
    const send = jest.fn(async () => {
      throw new Error('network down');
    });
    expect(() =>
      new ServerEventsService(config, send).pageView(createRequest(), 'Sign In')
    ).not.toThrow();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
