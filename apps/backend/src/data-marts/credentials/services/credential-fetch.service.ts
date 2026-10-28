import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { assertPublicHttpUrl } from '../../../common/helpers/safe-url.helper';
import { withGuardedDispatcher } from '../../../common/helpers/guarded-dispatcher';
import { readBoundedBody } from '../../../common/helpers/read-bounded-body.helper';
import type {
  CredentialFetchRequestApiDto,
  CredentialFetchResponseApiDto,
} from '../dto/credential-fetch-api.dto';
import { secretValue, type CredentialDefinitionContract } from '../credential.types';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { CredentialService } from './credential.service';
import {
  GoogleServiceAccountTokenService,
  GoogleTokenError,
} from './google-service-account-token.service';

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
  private readonly logger = new Logger(CredentialFetchService.name);

  constructor(
    private readonly googleTokens: GoogleServiceAccountTokenService,
    private readonly credentials: CredentialService
  ) {}

  async run(
    binding: ResolvedCredentialBinding,
    input: CredentialFetchRequestApiDto,
    limits: CredentialFetchLimits = {}
  ): Promise<CredentialFetchResponseApiDto> {
    const response = await this.runRaw(binding, input, limits);
    const body = await readBoundedBody(
      response,
      limits.maxResponseBodyBytes ?? MAX_RESPONSE_BODY_BYTES
    );
    if (body === null) {
      throw new BadRequestException('Credential response body is too large');
    }
    return {
      status: response.status,
      headers: pickResponseHeaders(response.headers),
      bodyBase64: body.toString('base64'),
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
    const url = await this.assertAllowedUrl(input.url, binding.definition);
    const method = input.method.toUpperCase();
    if (
      method.length === 0 ||
      method.length > 32 ||
      !HTTP_TOKEN_PATTERN.test(method) ||
      FORBIDDEN_FETCH_METHODS.has(method)
    ) {
      throw new BadRequestException('Credential request method is not Fetch-compatible');
    }
    const body = decodeBody(input.bodyBase64);
    if (body.byteLength > MAX_REQUEST_BODY_BYTES) {
      throw new BadRequestException('Credential request body is too large');
    }
    if ((method === 'GET' || method === 'HEAD') && body.byteLength > 0) {
      throw new BadRequestException(`${method} requests cannot carry a body`);
    }

    const timeoutSignal = AbortSignal.timeout(limits.timeoutMs ?? TIMEOUT_MS);
    const signal = limits.signal ? AbortSignal.any([timeoutSignal, limits.signal]) : timeoutSignal;
    let googleToken: string | undefined;
    const send = async () => {
      const { header, token } = await this.authorization(binding, signal);
      googleToken = token;
      return this.send(binding, input.headers, url, method, body, header, signal, limits);
    };

    const response = await send();
    if (binding.definition.auth.type !== 'google-service-account' || response.status !== 401) {
      return response;
    }
    // Google can revoke a token before it expires; the cached client would keep sending it.
    void response.body?.cancel().catch(() => undefined);
    if (googleToken) this.googleTokens.drop(googleTokenRequest(binding), googleToken);
    return send();
  }

  private async send(
    binding: ResolvedCredentialBinding,
    supplied: Readonly<Record<string, string>> | undefined,
    startUrl: string,
    startMethod: string,
    startBody: Buffer,
    authorization: readonly [string, string],
    signal: AbortSignal,
    limits: CredentialFetchLimits
  ): Promise<Response> {
    let currentUrl = startUrl;
    let currentMethod = startMethod;
    let body = startBody;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const headers = this.buildRequestHeaders(supplied, authorization);
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
          binding.definition
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

  private async authorization(
    binding: ResolvedCredentialBinding,
    signal: AbortSignal
  ): Promise<{ readonly header: readonly [string, string]; readonly token?: string }> {
    const { auth } = binding.definition;
    if (auth.type === 'header') {
      return { header: [auth.headerName, `${auth.prefix ?? ''}${secretValue(binding.secret)}`] };
    }
    if (binding.requirement.scopes.length === 0) {
      throw new BadRequestException({
        code: 'CREDENTIAL_SCOPE_INVALID',
        message: 'Google issued no access token for the scopes this plugin declares',
      });
    }
    try {
      const token = await this.googleTokens.getAccessToken({
        ...googleTokenRequest(binding),
        signal,
      });
      return { header: ['authorization', `Bearer ${token}`], token };
    } catch (error) {
      if (!(error instanceof GoogleTokenError)) throw error;
      if (error.failure === 'rejected') {
        // Informational state: a failed write must not replace the refusal the plugin gets.
        await this.credentials
          .markRejected(binding.credentialId, binding.secret, error.message)
          .catch(() =>
            this.logger.warn(
              `Could not record the rejected key of Credential ${binding.credentialId}`
            )
          );
        throw new ForbiddenException({
          code: 'CREDENTIAL_REJECTED',
          message: `Google rejected the service account key: ${error.message}`,
        });
      }
      if (error.failure === 'scope') {
        throw new BadRequestException({
          code: 'CREDENTIAL_SCOPE_INVALID',
          message: 'Google issued no access token for the scopes this plugin declares',
        });
      }
      throw new BadGatewayException('Credential request could not be completed');
    }
  }

  private async assertAllowedUrl(
    rawUrl: string,
    definition: CredentialDefinitionContract
  ): Promise<string> {
    const { origins } = definition;
    if (!origins) {
      throw new BadRequestException('This Credential definition does not allow HTTP requests');
    }
    let url: URL;
    try {
      url = await assertPublicHttpUrl(rawUrl, { allowedProtocols: ['https:'] });
    } catch {
      throw new ForbiddenException('Credential request URL is not allowed');
    }
    if (!origins.some(origin => originAllows(origin, url, definition.auth.type))) {
      throw new ForbiddenException('Credential request origin is not declared by the definition');
    }
    return url.toString();
  }

  private buildRequestHeaders(
    supplied: Readonly<Record<string, string>> | undefined,
    [authName, authValue]: readonly [string, string]
  ): Headers {
    const headers = new Headers();
    const secretHeader = authName.toLowerCase();
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
    headers.set(authName, authValue);
    return headers;
  }
}

function googleTokenRequest(binding: ResolvedCredentialBinding) {
  return {
    credentialId: binding.credentialId,
    secret: binding.secret,
    scopes: binding.requirement.scopes,
  };
}

/** `https://*.<domain>` is a host-suffix wildcard only for `google-service-account`; otherwise a literal origin. */
function originAllows(
  origin: string,
  url: URL,
  authType: CredentialDefinitionContract['auth']['type']
): boolean {
  const declared = new URL(origin);
  if (authType === 'google-service-account' && declared.hostname.startsWith('*.')) {
    // slice(1) keeps the leading dot, so neither the bare domain nor evilgoogleapis.com matches.
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      url.hostname.endsWith(declared.hostname.slice(1))
    );
  }
  return declared.origin === url.origin;
}

function boundResponseBody(response: Response, maxBytes: number): Response {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
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
