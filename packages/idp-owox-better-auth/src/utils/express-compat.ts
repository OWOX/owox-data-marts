import type { Logger } from '@owox/internal-helpers';
import type { Request as ExpressRequest } from 'express';

/**
 * Converts Express request headers into a Fetch API Headers object.
 */
export function convertExpressHeaders(req: ExpressRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

/**
 * Converts an Express request into a Fetch API Request.
 */
export function convertExpressToFetchRequest(
  req: ExpressRequest,
  logger?: Logger
): globalThis.Request {
  try {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const method = req.method.toUpperCase();
    const headers = convertExpressHeaders(req);

    let body: string | Buffer | null = null;
    if (method !== 'GET' && method !== 'HEAD') {
      const rawBody = req.body;
      if (rawBody !== undefined && rawBody !== null) {
        if (Buffer.isBuffer(rawBody)) {
          body = rawBody;
        } else if (typeof rawBody === 'string') {
          body = rawBody;
        } else {
          body = JSON.stringify(rawBody);
          if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
          }
        }

        // Ensure content-length matches the rebuilt payload (or let fetch set it)
        headers.delete('content-length');
        if (typeof body === 'string') {
          headers.set('content-length', Buffer.byteLength(body).toString());
        } else if (Buffer.isBuffer(body)) {
          headers.set('content-length', body.byteLength.toString());
        }
      }
    }

    const fetchBody: BodyInit | null =
      body === null ? null : typeof body === 'string' ? body : new Uint8Array(body);

    return new globalThis.Request(url, {
      method,
      headers,
      body: fetchBody ?? undefined,
    });
  } catch (error) {
    logger?.error('Failed to convert Express request to Fetch request', {}, error as Error);
    throw new Error('Failed to convert request format');
  }
}
