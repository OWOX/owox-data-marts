import { castError } from '@owox/internal-helpers';
import type { Request } from 'express';
import { createServiceLogger } from '../../core/logger.js';
import { getCookie } from '../../utils/request-utils.js';

/**
 * Where server-side events go: a GA4-compatible `g/collect` endpoint, the
 * measurement id sent as `tid`, and the name of the first-party cookie that
 * identifies the visitor.
 */
export interface ServerEventsConfig {
  collectUrl: string;
  measurementId: string;
  visitorCookieName: string;
}

type Send = (url: string, init: RequestInit) => Promise<Response>;

// A visitor id as a cookie may hold it; anything else is not sent.
const VISITOR_ID = /^[A-Za-z0-9._-]{1,128}$/;

// The Google Analytics client id cookie, `GA1.<n>.<random>.<timestamp>`; its
// last two parts are the client id gtag sends as `cid`.
const GA_COOKIE = '_ga';
const GA_CLIENT_ID = /^GA\d\.\d+\.(\d+\.\d+)$/;

// Query parameters kept in the page URL: campaign and click identifiers. Auth
// pages also carry flow state (state, error, tokens), which must not leave.
const KEPT_QUERY = /^(utm_[a-z_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|ttclid|li_fat_id)$/i;

const FORWARDED_HEADERS = [
  'user-agent',
  'accept-language',
  'sec-gpc',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
];

const SEND_TIMEOUT_MS = 3000;

/**
 * Sends `page_view` and `login` events for the auth pages from the server,
 * in GA4 `g/collect` format, keyed on the visitor's first-party cookie.
 *
 * Off unless configured. Nothing is sent for a visitor without that cookie,
 * and the product never sets it. `cid` is the Google Analytics client id from
 * `_ga`, the same as the page's own tag sends, and is left out without it. Sending never blocks or fails the request
 * that triggered it: errors are only logged.
 */
export class ServerEventsService {
  private readonly logger = createServiceLogger(ServerEventsService.name);

  constructor(
    private readonly config: ServerEventsConfig | undefined,
    private readonly send: Send = (url, init) => fetch(url, init)
  ) {}

  /** A view of an auth page, with its title. */
  pageView(req: Request, title: string): void {
    this.dispatch(req, 'page_view', { dt: title });
  }

  /** A completed sign-in of user `userId`. */
  login(req: Request, userId: string | undefined): void {
    if (!userId) return;
    this.dispatch(req, 'login', { uid: userId });
  }

  private dispatch(req: Request, name: string, params: Record<string, string>): void {
    if (!this.config) return;
    try {
      this.post(req, this.config, name, params);
    } catch (error) {
      this.logger.warn('Server event not sent', { event: name, error: castError(error).message });
    }
  }

  private post(
    req: Request,
    config: ServerEventsConfig,
    name: string,
    params: Record<string, string>
  ): void {
    const visitorId = getCookie(req, config.visitorCookieName);
    if (!visitorId || !VISITOR_ID.test(visitorId)) return;

    const url = new URL(config.collectUrl);
    url.hash = '';
    const query = url.searchParams;
    query.set('v', '2');
    query.set('tid', config.measurementId);
    const clientId = GA_CLIENT_ID.exec(getCookie(req, GA_COOKIE) ?? '')?.[1];
    if (clientId) query.set('cid', clientId);
    query.set('en', name);
    query.set('dl', pageUrl(req));
    const referrer = withoutQuery(req.headers.referer);
    if (referrer) query.set('dr', referrer);
    const language = firstHeader(req, 'accept-language')?.split(',')[0]?.trim().toLowerCase();
    if (language) query.set('ul', language);
    for (const [key, value] of Object.entries(params)) query.set(key, value);
    query.set('ep.event_source', 'server');

    const headers = new Headers({ cookie: `${config.visitorCookieName}=${visitorId}` });
    for (const name of FORWARDED_HEADERS) {
      const value = firstHeader(req, name);
      if (value) headers.set(name, value);
    }
    if (req.ip) headers.set('x-forwarded-for', req.ip);

    void this.send(url.toString(), {
      method: 'POST',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
      .then(async response => {
        await response.body?.cancel();
        if (!response.ok) {
          this.logger.warn('Server event rejected', { event: name, status: response.status });
        }
      })
      .catch(error => {
        this.logger.warn('Server event failed', { event: name, error: castError(error).message });
      });
  }
}

function firstHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function pageUrl(req: Request): string {
  const url = new URL(req.originalUrl ?? req.url, `${req.protocol}://${req.get('host')}`);
  for (const key of [...url.searchParams.keys()]) {
    if (!KEPT_QUERY.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function withoutQuery(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}
