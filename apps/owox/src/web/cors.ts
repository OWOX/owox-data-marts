import type { CorsOptions } from 'cors';

const DEFAULT_CORS_ALLOWED_HEADERS = ['content-type', 'authorization', 'x-owox-authorization'];
const CORS_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/i;

export function parseCorsAllowedHeaders(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const headers = value
    .split(',')
    .map(header => header.trim().toLowerCase())
    .filter(header => header.length > 0 && CORS_HEADER_NAME_PATTERN.test(header));

  return [...new Set(headers)];
}

export function buildCorsAllowedHeaders(
  extraHeadersValue = process.env.CORS_ALLOWED_HEADERS
): string[] {
  return [
    ...new Set([...DEFAULT_CORS_ALLOWED_HEADERS, ...parseCorsAllowedHeaders(extraHeadersValue)]),
  ];
}

export function buildCorsConfig(): CorsOptions {
  const googleSheetsExtensionOrigin = process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
  const allowedOrigins = googleSheetsExtensionOrigin
    ? googleSheetsExtensionOrigin
        .split(',')
        .map(origin => origin.trim())
        .filter(origin => origin.length > 0)
    : [];

  return {
    allowedHeaders: buildCorsAllowedHeaders(),
    credentials: true,
    maxAge: 86_400,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204,
    origin: allowedOrigins,
  };
}
