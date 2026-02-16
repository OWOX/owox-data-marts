import type { Request } from 'express';

/**
 * Converts Express request headers into a Fetch API Headers object.
 */
export function convertExpressHeaders(req: Request): Headers {
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
