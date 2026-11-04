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
import type { CredentialValidationResult } from '../credential.types';

/** What a list decides for all its rows at once. */
export interface CredentialViewBatch {
  readonly canUse: boolean;
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
      batch?.canUse ?? this.canUse(credential.id, context),
    ]);
    const titles = batch?.titles ?? (await this.consumerTitles.visibleTitles(context, bindings));
    return this.mapper.toDto(
      credential,
      definition,
      bindings,
      lastUsedAt,
      usable,
      titles,
      validation
    );
  }

  private async canUse(credentialId: string, context: AuthorizationContext): Promise<boolean> {
    const decisions = await this.access.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.CREDENTIAL,
      [credentialId],
      Action.USE,
      context.projectId
    );
    return decisions.get(credentialId) === true;
  }
}
