import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccessValidationException } from '../../common/exceptions/access-validation.exception';
import type { AuthorizationContext } from '../../idp';
import {
  CREDENTIAL_CONSUMER_TYPE_STORAGE,
  type CredentialPublicMetadata,
  type CredentialSecret,
} from '../credentials/credential.types';
import { CredentialConsumerTitlesService } from '../credentials/services/credential-consumer-titles.service';
import { DataStorage } from '../entities/data-storage.entity';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import type { DataStorageConfig } from './data-storage-config.type';
import type { DataStorageCredentials } from './data-storage-credentials.type';
import { DataStorageAccessValidatorFacade } from './facades/data-storage-access-validator-facade.service';
import { toAdapterCredentials } from './storage-credential-definitions';

export interface CredentialConsumerRef {
  readonly consumerType: string;
  readonly consumerId: string;
}

export interface CandidateCredentialValues {
  readonly definitionId: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
}

/** The Storages among a Credential's consumers, as the Credentials page needs them. */
@Injectable()
export class CredentialStorageConsumersService implements OnModuleInit {
  constructor(
    @InjectRepository(DataStorage)
    private readonly storages: Repository<DataStorage>,
    private readonly access: AccessDecisionService,
    private readonly accessValidator: DataStorageAccessValidatorFacade,
    private readonly consumerTitles: CredentialConsumerTitlesService
  ) {}

  onModuleInit(): void {
    this.consumerTitles.register(CREDENTIAL_CONSUMER_TYPE_STORAGE, (context, storageIds) =>
      this.visibleTitles(
        context,
        storageIds.map(consumerId => ({
          consumerType: CREDENTIAL_CONSUMER_TYPE_STORAGE,
          consumerId,
        }))
      )
    );
  }

  /** Titles of the Storages the member can see, by Storage id; hidden ones are absent. */
  async visibleTitles(
    context: AuthorizationContext,
    consumers: readonly CredentialConsumerRef[]
  ): Promise<ReadonlyMap<string, string>> {
    return this.titlesOf(context, await this.load(context.projectId, consumers));
  }

  /**
   * Checks the candidate on each Storage in turn and throws when a Storage that works with the
   * current values rejects it; returns how many accepted it.
   */
  async verifyCandidate(
    context: AuthorizationContext,
    consumers: readonly CredentialConsumerRef[],
    candidate: CandidateCredentialValues,
    current: CandidateCredentialValues
  ): Promise<number> {
    const storages = await this.load(context.projectId, consumers);
    if (storages.length === 0) return 0;
    const titles = await this.titlesOf(context, storages);
    let accepted = 0;
    for (const storage of storages) {
      const result = await this.check(storage, candidate);
      if (result.valid) {
        accepted += 1;
        continue;
      }
      // A Storage already broken (a paused cluster, a dropped warehouse) must not block a rotation.
      if (!(await this.check(storage, current)).valid) continue;
      const title = titles.get(storage.id);
      const storageName =
        title === undefined ? 'a Storage that uses this Credential' : `Storage "${title}"`;
      const secrets = Object.values('fields' in candidate.secret ? candidate.secret.fields : {});
      throw new AccessValidationException(
        maskSecrets(
          `The new values do not work for ${storageName}: ${result.errorMessage ?? 'Access validation failed'}`,
          secrets
        ),
        // Provider details can name the hidden Storage's database or bucket.
        title === undefined ? undefined : maskedReason(result.reason, secrets)
      );
    }
    return accepted;
  }

  private check(storage: DataStorage, values: CandidateCredentialValues) {
    return this.accessValidator.validateAccess(
      storage.type,
      storage.config ?? ({} as DataStorageConfig),
      toAdapterCredentials(
        values.definitionId,
        values.secret,
        values.publicMetadata
      ) as DataStorageCredentials
    );
  }

  private async load(
    projectId: string,
    consumers: readonly CredentialConsumerRef[]
  ): Promise<DataStorage[]> {
    const ids = consumers
      .filter(consumer => consumer.consumerType === CREDENTIAL_CONSUMER_TYPE_STORAGE)
      .map(consumer => consumer.consumerId);
    if (ids.length === 0) return [];
    return this.storages.find({
      where: { id: In([...new Set(ids)]), projectId },
      loadEagerRelations: false,
    });
  }

  private async titlesOf(
    context: AuthorizationContext,
    storages: readonly DataStorage[]
  ): Promise<ReadonlyMap<string, string>> {
    if (storages.length === 0) return new Map();
    const canSee = await this.access.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.STORAGE,
      storages.map(storage => storage.id),
      Action.SEE,
      context.projectId
    );
    return new Map(
      storages
        .filter(storage => canSee.get(storage.id) === true)
        .map(storage => [storage.id, storage.title ?? ''] as const)
    );
  }
}

/** Validators should never echo a key, but a stored secret must not reach the requester if one does. */
function maskSecrets(text: string, secrets: readonly string[], escape = false): string {
  return (
    secrets
      // Every non-empty string, even a short one: over-masking garbles text, under-masking leaks.
      .filter(secret => typeof secret === 'string' && secret !== '')
      .reduce(
        (masked, secret) =>
          masked.split(escape ? JSON.stringify(secret).slice(1, -1) : secret).join('***'),
        text
      )
  );
}

function maskedReason(
  reason: Record<string, unknown> | undefined,
  secrets: readonly string[]
): Record<string, unknown> | undefined {
  if (!reason) return undefined;
  try {
    // Masked in the JSON text, where a secret appears in its escaped form.
    return JSON.parse(maskSecrets(JSON.stringify(reason), secrets, true)) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}
