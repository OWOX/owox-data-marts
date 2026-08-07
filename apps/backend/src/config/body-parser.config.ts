import type { NestExpressApplication } from '@nestjs/platform-express';

// Keep the transport ceiling above endpoint-level DTO limits so validation can
// return the endpoint's documented client error instead of failing in middleware.
export const MAX_JSON_BODY_SIZE_BYTES = 2 * 1024 * 1024;

export function setupBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: MAX_JSON_BODY_SIZE_BYTES });
  app.useBodyParser('urlencoded', {
    limit: MAX_JSON_BODY_SIZE_BYTES,
    extended: true,
  });
}
