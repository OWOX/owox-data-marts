import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialSetupDto, StartCredentialSetupInput } from '../dto/credential-setup.dto';
import { CredentialSetupMapper } from '../mappers/credential-setup.mapper';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialSetupService } from '../services/credential-setup.service';
import { GetCredentialService } from './get-credential.service';
import { CREDENTIAL_SETUP_TTL_MS } from '../credential-setup.constants';

@Injectable()
export class StartCredentialSetupService {
  constructor(
    private readonly setups: CredentialSetupService,
    private readonly definitions: CredentialDefinitionService,
    private readonly getCredential: GetCredentialService,
    private readonly access: AccessDecisionService,
    private readonly mapper: CredentialSetupMapper,
    private readonly time: SystemTimeService
  ) {}

  async run(
    context: AuthorizationContext,
    input: StartCredentialSetupInput
  ): Promise<CredentialSetupDto> {
    if (input.definitionId !== undefined && input.credentialId !== undefined) {
      throw new BadRequestException(
        'Select either a provider for a new Credential or an existing Credential to update.'
      );
    }
    if (input.credentialId && input.title != null) {
      throw new BadRequestException('Use title only when creating a Credential.');
    }
    let definitionId = input.definitionId ?? null;
    if (input.credentialId) {
      const credential = await this.getCredential.run(input.credentialId, context);
      if (
        !(await this.access.canAccess(
          context.userId,
          context.roles ?? [],
          EntityType.CREDENTIAL,
          input.credentialId,
          Action.EDIT,
          context.projectId
        ))
      ) {
        throw new ForbiddenException('You do not have permission to maintain this Credential');
      }
      definitionId = credential.definition.id;
    } else if (definitionId) {
      await this.definitions.get(definitionId);
    }
    const createdAt = this.time.now();
    return this.mapper.toDto(
      await this.setups.create({
        projectId: context.projectId,
        userId: context.userId,
        mode: input.credentialId ? 'update' : 'create',
        definitionId,
        credentialId: input.credentialId ?? null,
        title: input.title?.trim() ?? null,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + CREDENTIAL_SETUP_TTL_MS),
      })
    );
  }
}
