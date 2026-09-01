import { Injectable } from '@nestjs/common';
import type { CredentialSecret, CredentialValidationResult } from '../credential.types';
import type { ResolvedCredentialDefinition } from '../dto/credential-api.dto';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { CredentialFetchService } from './credential-fetch.service';

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_RESPONSE_BODY_BYTES = 64 * 1024;
const DEFAULT_REJECTED_STATUSES = new Set([400, 401, 403]);

@Injectable()
export class CredentialValidationProbeService {
  constructor(private readonly credentialFetch: CredentialFetchService) {}

  async run(
    definition: ResolvedCredentialDefinition,
    secret: CredentialSecret
  ): Promise<CredentialValidationResult> {
    const validatedAt = new Date();
    const probe = definition.contract.validation;
    if (!probe) {
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
      },
      secret,
      definition: definition.contract,
      aiModelMappings: null,
    };

    try {
      const response = await this.credentialFetch.run(
        binding,
        {
          url: new URL(probe.path, definition.contract.origins[0]).toString(),
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

    return {
      state: 'unknown',
      message: 'The validation request could not establish whether the secret is valid',
      validatedAt,
    };
  }
}

function isSuccessful(status: number): boolean {
  return status >= 200 && status < 300;
}
