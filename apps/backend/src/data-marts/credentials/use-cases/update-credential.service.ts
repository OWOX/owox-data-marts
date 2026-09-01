import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transactional } from 'typeorm-transactional';
import { Repository } from 'typeorm';
import type { AuthorizationContext } from '../../../idp';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { ContextAccessService } from '../../services/context/context-access.service';
import { syncOwners } from '../../utils/sync-owners';
import type { UpdateCredentialApiDto } from '../dto/credential-api.dto';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialOwner } from '../entities/credential-owner.entity';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialService } from '../services/credential.service';
import { CredentialViewService } from '../services/credential-view.service';
import { CredentialValidationProbeService } from '../services/credential-validation-probe.service';
import type { CredentialValidationResult } from '../credential.types';
import { normalizeAiConfiguration } from './create-credential.service';

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
    private readonly owners: Repository<CredentialOwner>
  ) {}

  @Transactional()
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
      input.secret !== undefined ||
      input.aiModelMappings !== undefined ||
      input.aiModelMappingModes !== undefined;
    const definition = changesRuntimeContract
      ? await this.definitions.getForCredential(credential)
      : await this.definitions.getForView(credential);
    let validation: CredentialValidationResult | undefined;

    if (input.title !== undefined) credential.title = input.title.trim();
    if (input.secret !== undefined) {
      validation = await this.validationProbe.run(definition, { value: input.secret.value });
      if (validation.state === 'rejected') {
        throw new BadRequestException(validation.message);
      }
      credential.secret = { value: input.secret.value };
      credential.validationState = validation.state;
      credential.validationMessage = validation.message;
      credential.validatedAt = validation.validatedAt;
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
