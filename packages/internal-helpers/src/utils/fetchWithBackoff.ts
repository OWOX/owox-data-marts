import { LoggerFactory } from '../logging/logger-factory.js';
import { castError } from './castError.js';

export async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelay = 300,
  timeoutMs = 25_000
): Promise<Response> {
  const logger = LoggerFactory.createNamedLogger('fetchWithBackoff');
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);

      // Retry on 5xx or 429
      if (res.status >= 500 || res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
        const backoff =
          retryAfter > 0 ? retryAfter * 1000 : initialDelay * Math.pow(2, attempt - 1);
        logger.debug(`[fetchWithBackoff] ${res.status} retrying in ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      // Don't retry on 4xx other than 429
      if (res.status >= 400) return res;

      return res;
    } catch (err: unknown) {
      const msg = castError(err).message;
      const isTransient =
        msg.includes('EPIPE') ||
        msg.includes('ECONNRESET') ||
        msg.includes('fetch failed') ||
        msg.includes('timed out') ||
        msg.includes('Fetch timeout') ||
        msg.includes('socket hang up');

      if (!isTransient || attempt === maxRetries) throw err;

      const backoff = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
      logger.debug(
        `[fetchWithBackoff] attempt ${attempt} failed (${msg}); retrying in ${Math.round(backoff)}ms`
      );
      await new Promise(r => setTimeout(r, backoff));
    }
  }

  throw new Error('fetchWithBackoff: exceeded max retries');
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 25_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: unknown) {
    if (castError(err).name === 'AbortError') {
      throw new Error(`Fetch timeout: request did not complete within ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
