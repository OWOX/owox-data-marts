import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccessValidationException } from '../../common/exceptions/access-validation.exception';
import type { AuthorizationContext } from '../../idp';
import {
  CREDENTIAL_CONSUMER_TYPE_DESTINATION,
  type CandidateCredentialValues,
  type CredentialConsumerRef,
} from '../credentials/credential.types';
import { builtinFieldRule } from '../credentials/services/credential-fields';
import { CredentialConsumerTitlesService } from '../credentials/services/credential-consumer-titles.service';
import { DataDestination } from '../entities/data-destination.entity';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { toDestinationAdapterCredentials } from './destination-credential-definitions';
import { GoogleSheetsApiAdapter } from './google-sheets/adapters/google-sheets-api.adapter';

/** The Destinations among a Credential's consumers, as the Credentials page needs them. */
@Injectable()
export class CredentialDestinationConsumersService implements OnModuleInit {
  constructor(
    @InjectRepository(DataDestination)
    private readonly destinations: Repository<DataDestination>,
    private readonly access: AccessDecisionService,
    private readonly consumerTitles: CredentialConsumerTitlesService
  ) {}

  onModuleInit(): void {
    this.consumerTitles.register(CREDENTIAL_CONSUMER_TYPE_DESTINATION, (context, destinationIds) =>
      this.visibleTitles(
        context,
        destinationIds.map(consumerId => ({
          consumerType: CREDENTIAL_CONSUMER_TYPE_DESTINATION,
          consumerId,
        }))
      )
    );
  }

  /** Titles of the Destinations the member can see, by Destination id; hidden ones are absent. */
  async visibleTitles(
    context: AuthorizationContext,
    consumers: readonly CredentialConsumerRef[]
  ): Promise<ReadonlyMap<string, string>> {
    return this.titlesOf(context, await this.load(context.projectId, consumers));
  }

  /** Throws when the candidate fails where the current values pass; returns how many a provider accepted it for. */
  async verifyCandidate(
    context: AuthorizationContext,
    consumers: readonly CredentialConsumerRef[],
    candidate: CandidateCredentialValues,
    current: CandidateCredentialValues
  ): Promise<number> {
    const destinations = await this.load(context.projectId, consumers);
    if (destinations.length === 0) return 0;
    // The check reads the candidate alone, so one run covers every Destination.
    const { problem, contacted } = await candidateCheck(candidate);
    if (!problem) return contacted ? destinations.length : 0;
    // A provider that fails the current values too was not reached; that must not block a rotation.
    if (contacted && (await candidateCheck(current)).problem) return 0;
    const titles = await this.titlesOf(context, destinations);
    const title = destinations.map(({ id }) => titles.get(id)).find(name => name !== undefined);
    const destinationName =
      title === undefined ? 'a Destination that uses this Credential' : `Destination "${title}"`;
    // Fixed texts only: neither check passes provider output or the values through.
    throw new AccessValidationException(
      `The new values do not work for ${destinationName}: ${problem}`
    );
  }

  private async titlesOf(
    context: AuthorizationContext,
    destinations: readonly DataDestination[]
  ): Promise<ReadonlyMap<string, string>> {
    if (destinations.length === 0) return new Map();
    const canSee = await this.access.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.DESTINATION,
      destinations.map(destination => destination.id),
      Action.SEE,
      context.projectId
    );
    return new Map(
      destinations
        .filter(destination => canSee.get(destination.id) === true)
        .map(destination => [destination.id, destination.title] as const)
    );
  }

  private async load(
    projectId: string,
    consumers: readonly CredentialConsumerRef[]
  ): Promise<DataDestination[]> {
    const ids = consumers
      .filter(consumer => consumer.consumerType === CREDENTIAL_CONSUMER_TYPE_DESTINATION)
      .map(consumer => consumer.consumerId);
    if (ids.length === 0) return [];
    return this.destinations.find({
      where: { id: In([...new Set(ids)]), projectId },
      loadEagerRelations: false,
    });
  }
}

/** `contacted` is false for a format-only check: it proves nothing about the provider. */
async function candidateCheck(
  candidate: CandidateCredentialValues
): Promise<{ problem: string | null; contacted: boolean }> {
  const credentials = toDestinationAdapterCredentials(
    candidate.definitionId,
    candidate.secret,
    candidate.publicMetadata
  );
  if (credentials.type === 'google-chat-credentials') {
    return {
      problem: builtinFieldRule(candidate.definitionId, 'webhookUrl', credentials.webhookUrl),
      contacted: false,
    };
  }
  if (credentials.type === 'google-sheets-credentials') {
    // No Destination holds a spreadsheet (its reports do), so the key's Sheets token is the check.
    return (await GoogleSheetsApiAdapter.validateCredentials(credentials))
      ? { problem: null, contacted: true }
      : { problem: 'Google Sheets did not accept the key.', contacted: true };
  }
  return { problem: null, contacted: false };
}
