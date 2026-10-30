import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type AcceptedCredentialRequirement,
  type CredentialPublicMetadata,
  type CredentialSecret,
} from '../credentials/credential.types';
import { CredentialBindingService } from '../credentials/services/credential-binding.service';
import {
  ConsumerCredentialBindingService,
  type ResolvedConsumerCredential,
} from '../credentials/services/consumer-credential-binding.service';
import type { CredentialConsumerSummary } from '../credentials/services/credential-consumer-state';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialGoogleOAuthService } from '../credentials/services/credential-google-oauth.service';
import { CredentialService } from '../credentials/services/credential.service';
import { SourceCredentialUnavailableException } from '../exceptions/source-credential-unavailable.exception';
import { AccessDecisionService } from '../services/access-decision';
import { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import {
  customConnectorConfigRefusal,
  type CustomConnectorKeyModel,
} from './custom-connector-credential-fit';
import { sourceBindingFor } from './source-credential-definitions';
import {
  SOURCE_BINDING_CONSUMER_TYPE,
  sourceCredentialRequirement,
} from './source-credential-state';

const UNSUITABLE = 'This Credential cannot be used with this connector.';

export const CREDENTIAL_NO_LONGER_FITS =
  "This Data Mart's Credential no longer fits its connector. Select a fitting Credential.";

export interface ResolvedSourceCredential {
  readonly credentialId: string;
  readonly definitionId: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
  /** Set once a leased run ended without a rotated token; a run then takes the lease only for one. */
  readonly refreshTokenStaticAt?: Date | null;
}

/** How Data Mart configurations bind, resolve and summarize their Credentials: one row per configuration. */
@Injectable()
export class SourceCredentialBindingService extends ConsumerCredentialBindingService<
  typeof SOURCE_BINDING_CONSUMER_TYPE
> {
  // Each configuration binds under its own `_id`, which every call passes.
  protected readonly binding = { consumerType: SOURCE_BINDING_CONSUMER_TYPE, requirementKey: '' };
  protected readonly consumerName = 'Data Mart';

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

  /** Checks USE, the accepted definition and enabled under the Credential's lock. */
  bindConfig(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    dataMartId: string;
    configId: string;
    credentialId: string;
  }): Promise<void> {
    return this.bindConsumer({
      projectId: input.projectId,
      userId: input.userId,
      roles: input.roles,
      credentialId: input.credentialId,
      type: SOURCE_BINDING_CONSUMER_TYPE,
      consumerId: input.dataMartId,
      requirementKey: input.configId,
    });
  }

  unbindConfig(dataMartId: string, configId: string): Promise<void> {
    return this.deactivateConsumer(dataMartId, configId);
  }

  deactivateDataMart(dataMartId: string): Promise<void> {
    return this.deactivateConsumer(dataMartId);
  }

  /** Null when the configuration is unbound; throws when its Credential is disabled or gone. */
  async resolveForConfig(
    projectId: string,
    dataMartId: string,
    configId: string
  ): Promise<ResolvedSourceCredential | null> {
    const resolved = await this.resolveForConsumer(
      { id: dataMartId, projectId, type: SOURCE_BINDING_CONSUMER_TYPE },
      configId
    );
    return resolved && this.available(resolved);
  }

  /** A Credential by id for a preview; throws as a run does when it is disabled or gone. */
  async resolveCredential(
    projectId: string,
    credentialId: string
  ): Promise<ResolvedSourceCredential> {
    const resolved = await this.resolveCredentialById(
      projectId,
      credentialId,
      SOURCE_BINDING_CONSUMER_TYPE
    );
    if (!resolved) throw this.boundCredentialGone();
    return this.available(resolved);
  }

  /** Whether the project has this Credential, enabled or not. */
  async hasCredential(projectId: string, credentialId: string): Promise<boolean> {
    return (
      (await this.resolveCredentialById(projectId, credentialId, SOURCE_BINDING_CONSUMER_TYPE)) !==
      null
    );
  }

  private available(resolved: ResolvedConsumerCredential): ResolvedSourceCredential {
    if (resolved.state === 'disabled') {
      throw new SourceCredentialUnavailableException(
        "This Data Mart's Credential is disabled. Select another Credential, or ask a Credential maintainer to enable it."
      );
    }
    const { credentialId, definitionId, secret, publicMetadata, refreshTokenStaticAt } = resolved;
    return { credentialId, definitionId, secret, publicMetadata, refreshTokenStaticAt };
  }

  /** Records that a configuration's run used its Credential; never fails the run. */
  markConfigUsed(dataMartId: string, configId: string, credentialId: string): Promise<void> {
    return this.markConsumerUsed(dataMartId, credentialId, configId);
  }

  /** Every active binding of the given Data Marts' configurations, with the Credential it names. */
  boundConfigs(projectId: string, dataMartIds: readonly string[]) {
    return this.binder.listBound({
      consumerType: SOURCE_BINDING_CONSUMER_TYPE,
      projectId,
      consumerIds: dataMartIds,
    });
  }

  /** Configuration id to its Credential id; null once that Credential was deleted. */
  async boundCredentialIds(
    projectId: string,
    dataMartId: string
  ): Promise<ReadonlyMap<string, string | null>> {
    const bound = await this.configBindings(projectId, dataMartId);
    return new Map(
      bound.map(({ requirementKey, credential }) => [requirementKey, credential?.id ?? null])
    );
  }

  /** USE first, then that the Credential suits the connector and the configuration's auth variant. */
  async checkConfigCredential(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    credentialId: string;
    connectorName: string;
    config: Record<string, unknown>;
    /** A custom connector's manifest, for the version the Data Mart runs; null for a bundled one. */
    model: CustomConnectorKeyModel | null;
  }): Promise<void> {
    const credential = await this.checkConsumerBinding({
      ...input,
      type: SOURCE_BINDING_CONSUMER_TYPE,
    });
    const refusal = configRefusal(credential, input.connectorName, input.config, input.model);
    if (refusal) throw new BadRequestException(refusal);
  }

  /** That a kept Credential still suits a configuration whose version, branch or variant changed; no USE check. */
  async checkKeptConfigCredential(input: {
    projectId: string;
    credentialId: string;
    connectorName: string;
    config: Record<string, unknown>;
    model: CustomConnectorKeyModel | null;
  }): Promise<void> {
    const credential = await this.resolveCredentialById(
      input.projectId,
      input.credentialId,
      SOURCE_BINDING_CONSUMER_TYPE
    );
    // A deleted Credential stays bound, and its runs say so.
    if (!credential) return;
    const refusal = configRefusal(credential, input.connectorName, input.config, input.model);
    if (refusal) {
      throw new BadRequestException(refusal === UNSUITABLE ? CREDENTIAL_NO_LONGER_FITS : refusal);
    }
  }

  /** Each bound configuration's Credential as the member sees it, by configuration id. */
  async summarizeForDataMart(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    dataMartId: string;
  }): Promise<ReadonlyMap<string, CredentialConsumerSummary>> {
    const bound = await this.configBindings(input.projectId, input.dataMartId);
    return this.summarizeBound(
      input,
      bound.map(({ requirementKey, credential }) => ({
        key: requirementKey,
        credential,
        type: SOURCE_BINDING_CONSUMER_TYPE,
      }))
    );
  }

  boundCredentialGone(): Error {
    return new SourceCredentialUnavailableException(
      "This Data Mart's Credential was deleted. Select another Credential for this Data Mart."
    );
  }

  protected requirement(): AcceptedCredentialRequirement {
    return sourceCredentialRequirement();
  }

  private configBindings(projectId: string, dataMartId: string) {
    return this.binder.listBound({
      consumerType: SOURCE_BINDING_CONSUMER_TYPE,
      projectId,
      consumerIds: [dataMartId],
    });
  }
}

/** Why the Credential cannot serve the configuration; null when it can. */
function configRefusal(
  { definitionId, publicMetadata }: ResolvedConsumerCredential,
  connectorName: string,
  config: Record<string, unknown>,
  model: CustomConnectorKeyModel | null
): string | null {
  if (model) {
    const refusal = customConnectorConfigRefusal(model, { definitionId, publicMetadata }, config);
    if (!refusal) return null;
    return refusal.kind === 'misuse' ? refusal.message : UNSUITABLE;
  }
  const binding = sourceBindingFor(connectorName, definitionId);
  if (!binding) return UNSUITABLE;
  // A variant path like ['AuthType', 'oauth2']; the configuration may select only that variant.
  const [parameter, variant] = binding.path;
  const selected = parameter === undefined ? undefined : config[parameter];
  const otherVariant =
    typeof selected === 'object' &&
    selected !== null &&
    Object.keys(selected).some(key => key !== variant);
  return otherVariant ? UNSUITABLE : null;
}
