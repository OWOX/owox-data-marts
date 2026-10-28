import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isDeepStrictEqual } from 'node:util';
import { Transactional } from 'typeorm-transactional';
import { Repository } from 'typeorm';
import type { AuthorizationContext } from '../../../idp';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { CredentialStorageConsumersService } from '../../data-storage-types/credential-storage-consumers.service';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { ContextAccessService } from '../../services/context/context-access.service';
import { syncOwners } from '../../utils/sync-owners';
import type {
  ResolvedCredentialDefinition,
  UpdateCredentialApiDto,
} from '../dto/credential-api.dto';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialOwner } from '../entities/credential-owner.entity';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialService } from '../services/credential.service';
import { parseGoogleServiceAccountKey } from '../services/google-service-account-key';
import { CredentialViewService } from '../services/credential-view.service';
import { CredentialValidationProbeService } from '../services/credential-validation-probe.service';
import type { Credential } from '../entities/credential.entity';
import type { CredentialPublicMetadata, CredentialValidationResult } from '../credential.types';
import { applyFieldsUpdate } from '../services/credential-fields';
import { assertCredentialInputKind, normalizeAiConfiguration } from './create-credential.service';

@Injectable()
export class UpdateCredentialService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService,
    private readonly contextAccess: ContextAccessService,
    private readonly view: CredentialViewService,
    private readonly validationProbe: CredentialValidationProbeService,
    private readonly idpProjections: IdpProjectionsFacade,
    @InjectRepository(CredentialOwner)
    private readonly owners: Repository<CredentialOwner>,
    private readonly storageConsumers: CredentialStorageConsumersService
  ) {}

  async run(
    id: string,
    context: AuthorizationContext,
    input: UpdateCredentialApiDto
  ): Promise<CredentialDto> {
    await this.assertAccess(id, context, Action.EDIT);
    if (input.ownerIds !== undefined) {
      await this.assertAccess(id, context, Action.MANAGE_OWNERS);
      if (new Set(input.ownerIds).size === 0) {
        throw new BadRequestException('A Credential must have at least one owner');
      }
    }
    if (input.availableForUse !== undefined || input.availableForMaintenance !== undefined) {
      await this.assertAccess(id, context, Action.CONFIGURE_SHARING);
    }

    const credential = await this.credentials.getByIdAndProjectId(id, context.projectId);
    const changesRuntimeContract =
      input.secret != null ||
      input.fields != null ||
      input.aiModelMappings !== undefined ||
      input.aiModelMappingModes !== undefined;
    const definition = changesRuntimeContract
      ? await this.definitions.getForCredential(credential)
      : await this.definitions.getForView(credential);
    assertCredentialInputKind(definition.contract.auth, input);
    let validation: CredentialValidationResult | undefined;
    let publicMetadata = credential.publicMetadata;
    if (input.secret != null) {
      if (definition.contract.auth.type === 'google-service-account') {
        publicMetadata = parseGoogleServiceAccountKey(input.secret.value).metadata;
        const savedEmail = savedClientEmail(credential);
        if (savedEmail && publicMetadata.clientEmail.toLowerCase() !== savedEmail.toLowerCase()) {
          throw new BadRequestException(
            `The replacement key must belong to ${savedEmail}. Create another Credential for a different service account.`
          );
        }
      }
      // Outside the transaction: the provider check can take seconds and must not hold a connection.
      validation = await this.validationProbe.run(definition, { value: input.secret.value });
      if (validation.state === 'rejected') {
        throw new BadRequestException(validation.message);
      }
    }
    const { auth } = definition.contract;
    let checkedFields: CheckedFields | undefined;
    if (input.fields != null && auth.type === 'fields') {
      const next = applyFieldsUpdate(auth, credential, input.fields);
      if (next.secretChanged) {
        checkedFields = { secret: next.secret, publicMetadata: next.publicMetadata };
        validation = await this.checkBoundStorages(credential, context, checkedFields);
      }
    }
    return this.apply(id, context, input, definition, validation, publicMetadata, checkedFields);
  }

  /** New field values must work wherever the current ones do; none bound leaves no result. */
  private async checkBoundStorages(
    credential: Credential,
    context: AuthorizationContext,
    next: CheckedFields
  ): Promise<CredentialValidationResult | undefined> {
    // Outside the transaction, one Storage at a time: each check is a remote call.
    const checked = await this.storageConsumers.verifyCandidate(
      context,
      await this.credentials.listBindings(credential.id),
      {
        definitionId: credential.definitionId,
        secret: next.secret,
        publicMetadata: next.publicMetadata,
      },
      {
        definitionId: credential.definitionId,
        secret: credential.secret,
        publicMetadata: credential.publicMetadata,
      }
    );
    if (checked === 0) return undefined;
    return {
      state: 'verified',
      message: 'The Storages that use this Credential accepted the new values',
      validatedAt: new Date(),
    };
  }

  @Transactional()
  private async apply(
    id: string,
    context: AuthorizationContext,
    input: UpdateCredentialApiDto,
    definition: ResolvedCredentialDefinition,
    validation: CredentialValidationResult | undefined,
    publicMetadata: CredentialPublicMetadata | null,
    checkedFields: CheckedFields | undefined
  ): Promise<CredentialDto> {
    // Fresh read: the provider check took seconds and another request may have saved meanwhile.
    const credential = await this.credentials.getByIdAndProjectId(id, context.projectId);
    if (input.title !== undefined) credential.title = input.title.trim();
    if (input.secret != null && validation) {
      credential.secret = { value: input.secret.value };
      credential.publicMetadata = publicMetadata;
      credential.validationState = validation.state;
      credential.validationMessage = validation.message;
      credential.validatedAt = validation.validatedAt;
    }
    const { auth } = definition.contract;
    if (input.fields != null && auth.type === 'fields') {
      // Merged into the fresh read so a concurrent change to another field survives.
      const next = applyFieldsUpdate(auth, credential, input.fields);
      credential.secret = next.secret;
      credential.publicMetadata = next.publicMetadata;
      if (next.secretChanged) {
        // A concurrent edit changed what the Storages checked, so the saved values are unchecked.
        const merged = { secret: next.secret, publicMetadata: next.publicMetadata };
        const result = isDeepStrictEqual(merged, checkedFields) ? validation : undefined;
        credential.validationState = result?.state ?? 'unknown';
        credential.validationMessage = result?.message ?? null;
        credential.validatedAt = result?.validatedAt ?? null;
      }
    }
    if (input.enabled !== undefined) credential.enabled = input.enabled;
    if (input.availableForUse !== undefined) credential.availableForUse = input.availableForUse;
    if (input.availableForMaintenance !== undefined) {
      credential.availableForMaintenance = input.availableForMaintenance;
    }
    if (input.aiModelMappings !== undefined || input.aiModelMappingModes !== undefined) {
      const aiConfiguration = normalizeAiConfiguration(
        input.aiModelMappings,
        input.aiModelMappingModes,
        definition.contract.ai,
        {
          mappings: credential.aiModelMappings,
          modes: credential.aiModelMappingModes,
          sources: credential.aiModelMappingSources,
        }
      );
      credential.aiModelMappings = aiConfiguration.mappings;
      credential.aiModelMappingModes = aiConfiguration.modes;
      credential.aiModelMappingSources = aiConfiguration.sources;
    }
    await this.credentials.save(credential);

    if (input.ownerIds !== undefined) {
      await syncOwners(
        this.owners,
        'credentialId',
        credential.id,
        context.projectId,
        [...new Set(input.ownerIds)],
        this.idpProjections,
        userId => this.owners.create({ credentialId: credential.id, userId })
      );
    }

    if (input.contextIds !== undefined) {
      await this.contextAccess.updateCredentialContexts(
        id,
        context.projectId,
        [...new Set(input.contextIds)],
        context.userId,
        context.roles ?? []
      );
    }

    return this.view.build(
      await this.credentials.getByIdAndProjectId(id, context.projectId),
      context,
      validation
    );
  }

  private async assertAccess(
    id: string,
    context: AuthorizationContext,
    action: Action
  ): Promise<void> {
    if (
      !(await this.access.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.CREDENTIAL,
        id,
        action,
        context.projectId
      ))
    ) {
      throw new ForbiddenException(`You do not have ${action} access to this Credential`);
    }
  }
}

type CheckedFields = Pick<Credential, 'secret' | 'publicMetadata'>;

/** Rows saved without public metadata still carry the key, which names its account. */
function savedClientEmail(credential: Credential): string | undefined {
  const { publicMetadata, secret } = credential;
  if (publicMetadata && 'clientEmail' in publicMetadata) return publicMetadata.clientEmail;
  if (!('value' in secret)) return undefined;
  try {
    return parseGoogleServiceAccountKey(secret.value).metadata.clientEmail;
  } catch {
    return undefined;
  }
}
