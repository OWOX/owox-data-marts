import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialDto } from '../dto/credential.dto';
import type { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import type { Credential } from '../entities/credential.entity';
import { CredentialMapper } from '../mappers/credential.mapper';
import {
  CredentialConsumerTitlesService,
  type CredentialConsumerTitles,
} from './credential-consumer-titles.service';
import { CredentialDefinitionService } from './credential-definition.service';
import { CredentialService } from './credential.service';
import { sourceFilePicking, type CredentialValidationResult } from '../credential.types';
import { opensPicker } from '../../connector-types/source-credential-definitions';

/** What a list decides for all its rows at once. */
export interface CredentialViewBatch {
  readonly canUse: boolean;
  /** EDIT, decided only for Picker Credentials. */
  readonly canEdit: boolean;
  readonly bindings: readonly CredentialConsumerBinding[];
  readonly titles: CredentialConsumerTitles;
}

@Injectable()
export class CredentialViewService {
  constructor(
    private readonly definitions: CredentialDefinitionService,
    private readonly credentials: CredentialService,
    private readonly mapper: CredentialMapper,
    private readonly access: AccessDecisionService,
    private readonly consumerTitles: CredentialConsumerTitlesService
  ) {}

  async build(
    credential: Credential,
    context: AuthorizationContext,
    validation?: CredentialValidationResult,
    batch?: CredentialViewBatch
  ): Promise<CredentialDto> {
    const [definition, bindings, lastUsedAt, usable] = await Promise.all([
      this.definitions.getForView(credential),
      batch?.bindings ?? this.credentials.listBindings(credential.id),
      this.credentials.getLastUsedAt(credential.id),
      batch?.canUse ?? this.can(Action.USE, credential.id, context),
    ]);
    const titles = batch?.titles ?? (await this.consumerTitles.visibleTitles(context, bindings));
    const filePicking = opensPicker(credential.definitionId)
      ? sourceFilePicking(
          credential.publicMetadata ?? null,
          context.userId,
          batch?.canEdit ?? (await this.can(Action.EDIT, credential.id, context))
        )
      : null;
    return this.mapper.toDto(
      credential,
      definition,
      bindings,
      lastUsedAt,
      usable,
      titles,
      validation,
      filePicking
    );
  }

  private async can(
    action: Action,
    credentialId: string,
    context: AuthorizationContext
  ): Promise<boolean> {
    const decisions = await this.access.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.CREDENTIAL,
      [credentialId],
      action,
      context.projectId
    );
    return decisions.get(credentialId) === true;
  }
}
