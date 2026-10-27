import { Injectable } from '@nestjs/common';
import type { AcceptedCredentialRequirement } from '../credentials/credential.types';
import { CredentialBindingService } from '../credentials/services/credential-binding.service';
import {
  ConsumerCredentialBindingService,
  type ConsumerBindingCheck,
  type PublicOfConsumer,
  type ResolvedConsumerCredential,
} from '../credentials/services/consumer-credential-binding.service';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialGoogleOAuthService } from '../credentials/services/credential-google-oauth.service';
import { CredentialService } from '../credentials/services/credential.service';
import type { DataDestination } from '../entities/data-destination.entity';
import { DestinationCredentialUnavailableException } from '../exceptions/destination-credential-unavailable.exception';
import { AccessDecisionService } from '../services/access-decision';
import { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import {
  DESTINATION_BINDING,
  destinationCredentialRequirement,
  type DestinationCredentialSummary,
} from './destination-credential-state';
import type { DataDestinationType } from './enums/data-destination-type.enum';

export type ResolvedDestinationCredential = ResolvedConsumerCredential;

export type DestinationBindingCheck = ConsumerBindingCheck<DataDestinationType>;

/** How Destinations bind, resolve and summarize their Credential: one `destination` binding each. */
@Injectable()
export class DestinationCredentialBindingService extends ConsumerCredentialBindingService<DataDestinationType> {
  protected readonly binding = DESTINATION_BINDING;
  protected readonly consumerName = 'Destination';

  constructor(
    binder: CredentialBindingService,
    definitions: CredentialDefinitionService,
    access: AccessDecisionService,
    credentialService: CredentialService,
    googleOAuth: CredentialGoogleOAuthService,
    googleOAuthConfig: GoogleOAuthConfigService
  ) {
    super(binder, definitions, access, credentialService, googleOAuth, googleOAuthConfig);
  }

  bindDestination(input: DestinationBindingCheck & { destinationId: string }): Promise<void> {
    return this.bindConsumer({ ...input, consumerId: input.destinationId });
  }

  checkDestinationBinding(input: DestinationBindingCheck): Promise<ResolvedDestinationCredential> {
    return this.checkConsumerBinding(input);
  }

  deactivateDestination(destinationId: string): Promise<void> {
    return this.deactivateConsumer(destinationId);
  }

  findBoundDestinationIds(
    projectId: string,
    destinationIds: readonly string[]
  ): Promise<ReadonlySet<string>> {
    return this.findBoundIds(projectId, destinationIds);
  }

  resolveForDestination(
    destination: Pick<DataDestination, 'id' | 'projectId' | 'type'>
  ): Promise<ResolvedDestinationCredential | null> {
    return this.resolveForConsumer(destination);
  }

  summarizeForDestinations(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    destinations: readonly Pick<DataDestination, 'id' | 'type'>[];
  }): Promise<ReadonlyMap<string, DestinationCredentialSummary>> {
    return this.summarizeConsumers({ ...input, consumers: input.destinations });
  }

  identitiesForDestinations(
    projectId: string,
    destinationIds: readonly string[],
    withGone = false
  ): Promise<ReadonlyMap<string, string | null>> {
    return this.identitiesOf(projectId, destinationIds, withGone);
  }

  /** The bound Credential's definition, read without its secret; null when unbound, throws once gone. */
  async boundDefinitionIdOfDestination(
    destination: Pick<DataDestination, 'id' | 'projectId'>
  ): Promise<string | null> {
    const bound = (await this.publicOf(destination.projectId, [destination.id])).get(
      destination.id
    );
    if (bound === null) throw this.boundCredentialGone();
    return bound?.definitionId ?? null;
  }

  publicOfDestinations(
    projectId: string,
    destinationIds: readonly string[]
  ): Promise<ReadonlyMap<string, PublicOfConsumer | null>> {
    return this.publicOf(projectId, destinationIds);
  }

  lockedPublicOfDestination(
    projectId: string,
    destinationId: string
  ): Promise<PublicOfConsumer | null | undefined> {
    return this.lockedPublicOf(projectId, destinationId);
  }

  /** The bound Credential's id without a lock; null when unbound or the Credential is gone. */
  async boundCredentialIdOfDestination(
    projectId: string,
    destinationId: string
  ): Promise<string | null> {
    const [bound] = await this.binder.listBound({
      ...DESTINATION_BINDING,
      projectId,
      consumerIds: [destinationId],
    });
    return bound?.credential?.id ?? null;
  }

  markDestinationUsed(destinationId: string, credentialId: string): Promise<void> {
    return this.markConsumerUsed(destinationId, credentialId);
  }

  // A typed run error: a NotFound would read as a Google 404 in the report writers.
  protected boundCredentialGone(): Error {
    return new DestinationCredentialUnavailableException(
      "This Destination's Credential was deleted. Select another Credential for this Destination.",
      false
    );
  }

  protected requirement(type: DataDestinationType): AcceptedCredentialRequirement {
    return destinationCredentialRequirement(type, this.googleOAuthConfig);
  }
}
