import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { assertPublicHttpUrl } from '../../../common/helpers/safe-url.helper';
import { withGuardedDispatcher } from '../../../common/helpers/guarded-dispatcher';
import type {
  CredentialFetchRequestApiDto,
  CredentialFetchResponseApiDto,
} from '../dto/credential-fetch-api.dto';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_RESPONSE_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;
const HTTP_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_FETCH_METHODS = new Set(['CONNECT', 'TRACE', 'TRACK']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_REQUEST_HEADERS = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'forwarded',
  'host',
  'proxy-authorization',
  'set-cookie',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);
const FORWARDED_RESPONSE_HEADERS = new Set([
  'content-language',
  'content-type',
  'retry-after',
  'x-request-id',
]);

export interface CredentialFetchLimits {
  readonly timeoutMs?: number;
  readonly maxResponseBodyBytes?: number;
  readonly signal?: AbortSignal;
}

@Injectable()
export class CredentialFetchService {
  async run(
    binding: ResolvedCredentialBinding,
    input: CredentialFetchRequestApiDto,
    limits: CredentialFetchLimits = {}
  ): Promise<CredentialFetchResponseApiDto> {
    const response = await this.runRaw(binding, input, limits);
    return {
      status: response.status,
      headers: pickResponseHeaders(response.headers),
      bodyBase64: (
        await readBoundedBody(response, limits.maxResponseBodyBytes ?? MAX_RESPONSE_BODY_BYTES)
      ).toString('base64'),
    };
  }

  /**
   * Trusted internal fetch used by provider adapters that need a real response stream.
   * It applies the same origin, DNS, redirect, header and body controls as `asFetch()`.
   */
  async runRaw(
    binding: ResolvedCredentialBinding,
    input: CredentialFetchRequestApiDto,
    limits: CredentialFetchLimits = {}
  ): Promise<Response> {
    let currentUrl = await this.assertAllowedUrl(input.url, binding.definition.origins);
    let currentMethod = input.method.toUpperCase();
    if (
      currentMethod.length === 0 ||
      currentMethod.length > 32 ||
      !HTTP_TOKEN_PATTERN.test(currentMethod) ||
      FORBIDDEN_FETCH_METHODS.has(currentMethod)
    ) {
      throw new BadRequestException('Credential request method is not Fetch-compatible');
    }
    let body = decodeBody(input.bodyBase64);
    if (body.byteLength > MAX_REQUEST_BODY_BYTES) {
      throw new BadRequestException('Credential request body is too large');
    }
    if ((currentMethod === 'GET' || currentMethod === 'HEAD') && body.byteLength > 0) {
      throw new BadRequestException(`${currentMethod} requests cannot carry a body`);
    }

    const timeoutSignal = AbortSignal.timeout(limits.timeoutMs ?? TIMEOUT_MS);
    const signal = limits.signal ? AbortSignal.any([timeoutSignal, limits.signal]) : timeoutSignal;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const headers = this.buildRequestHeaders(binding, input.headers);
      let response: Response;
      try {
        response = await fetch(
          currentUrl,
          withGuardedDispatcher({
            method: currentMethod,
            headers,
            body:
              body.byteLength > 0
                ? (body.buffer.slice(
                    body.byteOffset,
                    body.byteOffset + body.byteLength
                  ) as ArrayBuffer)
                : undefined,
            redirect: 'manual',
            signal,
          })
        );
      } catch (error) {
        if (error instanceof HttpException) throw error;
        throw new BadGatewayException('Credential request could not be completed');
      }

      const location = response.headers.get('location');
      if (REDIRECT_STATUSES.has(response.status) && location) {
        if (hop === MAX_REDIRECTS) {
          throw new ForbiddenException('Credential request exceeded the redirect limit');
        }
        currentUrl = await this.assertAllowedUrl(
          new URL(location, currentUrl).toString(),
          binding.definition.origins
        );
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) && currentMethod === 'POST')
        ) {
          currentMethod = currentMethod === 'HEAD' ? 'HEAD' : 'GET';
          body = Buffer.alloc(0);
        }
        continue;
      }

      return boundResponseBody(response, limits.maxResponseBodyBytes ?? MAX_RESPONSE_BODY_BYTES);
    }

    throw new ForbiddenException('Credential request exceeded the redirect limit');
  }

  private async assertAllowedUrl(rawUrl: string, origins: readonly string[]): Promise<string> {
    let url: URL;
    try {
      url = await assertPublicHttpUrl(rawUrl, { allowedProtocols: ['https:'] });
    } catch {
      throw new ForbiddenException('Credential request URL is not allowed');
    }
    const allowedOrigins = new Set(origins.map(origin => new URL(origin).origin));
    if (!allowedOrigins.has(url.origin)) {
      throw new ForbiddenException('Credential request origin is not declared by the definition');
    }
    return url.toString();
  }

  private buildRequestHeaders(
    binding: ResolvedCredentialBinding,
    supplied: Readonly<Record<string, string>> | undefined
  ): Headers {
    const headers = new Headers();
    const secretHeader = binding.definition.auth.headerName.toLowerCase();
    const entries = Object.entries(supplied ?? {});
    if (entries.length > 100) {
      throw new BadRequestException('Credential request contains too many headers');
    }
    for (const [name, value] of entries) {
      const normalized = name.toLowerCase();
      if (BLOCKED_REQUEST_HEADERS.has(normalized) || normalized === secretHeader) continue;
      if (
        name.length === 0 ||
        name.length > 255 ||
        !HTTP_TOKEN_PATTERN.test(name) ||
        typeof value !== 'string' ||
        value.length > 8192 ||
        /[\0\r\n]/.test(value)
      ) {
        throw new BadRequestException('Credential request contains an invalid header');
      }
      headers.set(name, value);
    }
    headers.set(
      binding.definition.auth.headerName,
      `${binding.definition.auth.prefix ?? ''}${binding.secret.value}`
    );
    return headers;
  }
}

function boundResponseBody(response: Response, maxBytes: number): Response {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    void response.body?.cancel();
    throw new BadRequestException('Credential response body is too large');
  }
  if (!response.body) return response;

  const reader = response.body.getReader();
  let total = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          controller.error(new BadRequestException('Credential response body is too large'));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function decodeBody(encoded: string | null | undefined): Buffer {
  if (!encoded) return Buffer.alloc(0);
  const body = Buffer.from(encoded, 'base64');
  if (body.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new BadRequestException('Credential request body is not valid base64');
  }
  return body;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new BadRequestException('Credential response body is too large');
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BadRequestException('Credential response body is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(
    chunks.map(chunk => Buffer.from(chunk)),
    total
  );
}

function pickResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, name) => {
    const normalized = name.toLowerCase();
    if (
      FORWARDED_RESPONSE_HEADERS.has(normalized) ||
      normalized.startsWith('x-ratelimit-') ||
      normalized.startsWith('ratelimit-')
    ) {
      result[normalized] = value;
    }
  });
  return result;
}
