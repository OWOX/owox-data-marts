import { Injectable } from '@nestjs/common';
import { CredentialsExpiredException } from '../../exceptions/google-oauth.exceptions';
import type { CredentialSecret, CredentialValidationResult } from '../credential.types';
import type { ResolvedCredentialDefinition } from '../dto/credential-api.dto';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { CredentialFetchService } from './credential-fetch.service';
import { CredentialGoogleOAuthService } from './credential-google-oauth.service';
import { GoogleServiceAccountTokenService } from './google-service-account-token.service';

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_RESPONSE_BODY_BYTES = 64 * 1024;
const DEFAULT_REJECTED_STATUSES = new Set([400, 401, 403]);
const INDETERMINATE = 'The validation request could not establish whether the secret is valid';

@Injectable()
export class CredentialValidationProbeService {
  constructor(
    private readonly credentialFetch: CredentialFetchService,
    private readonly googleTokens: GoogleServiceAccountTokenService,
    private readonly googleOAuth: CredentialGoogleOAuthService
  ) {}

  /** A stored Google account is checked by id: its grant is refreshed from the database. */
  async run(
    definition: ResolvedCredentialDefinition,
    secret: CredentialSecret,
    credentialId?: string
  ): Promise<CredentialValidationResult> {
    if (definition.contract.auth.type === 'google-service-account') {
      return this.googleTokens.verify(secret);
    }
    const validatedAt = new Date();
    if (definition.contract.auth.type === 'oauth' && credentialId) {
      try {
        await this.googleOAuth.getOAuth2Client(credentialId, { forceRefresh: true });
        return { state: 'verified', message: 'Google refreshed the authorization', validatedAt };
      } catch (error) {
        return error instanceof CredentialsExpiredException
          ? { state: 'rejected', message: error.message, validatedAt }
          : { state: 'unknown', message: INDETERMINATE, validatedAt };
      }
    }
    const probe = definition.contract.validation;
    const origin = definition.contract.origins?.[0];
    if (!probe || !origin) {
      return {
        state: 'unknown',
        message: 'This definition does not declare a validation probe',
        validatedAt,
      };
    }

    const binding: ResolvedCredentialBinding = {
      credentialId: 'validation-probe',
      requirement: {
        key: 'validation',
        definitionId: definition.contract.id,
        optional: false,
        models: [],
        scopes: [],
      },
      secret,
      definition: definition.contract,
      aiModelMappings: null,
    };

    try {
      const response = await this.credentialFetch.run(
        binding,
        {
          url: new URL(probe.path, origin).toString(),
          method: probe.method,
          headers: probe.headers,
        },
        {
          timeoutMs: PROBE_TIMEOUT_MS,
          maxResponseBodyBytes: PROBE_MAX_RESPONSE_BODY_BYTES,
        }
      );
      if (probe.successStatuses?.includes(response.status) ?? isSuccessful(response.status)) {
        return {
          state: 'verified',
          message: 'Credential was accepted by the provider',
          validatedAt,
        };
      }
      const rejectedStatuses = probe.rejectedStatuses
        ? new Set(probe.rejectedStatuses)
        : DEFAULT_REJECTED_STATUSES;
      if (rejectedStatuses.has(response.status)) {
        return {
          state: 'rejected',
          message: `Provider rejected the validation request with status ${response.status}`,
          validatedAt,
        };
      }
    } catch {
      // Network, timeout and policy errors are intentionally indeterminate for save flows.
    }

    return { state: 'unknown', message: INDETERMINATE, validatedAt };
  }
}

function isSuccessful(status: number): boolean {
  return status >= 200 && status < 300;
}
