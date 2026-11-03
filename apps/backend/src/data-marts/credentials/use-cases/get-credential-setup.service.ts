import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import { CredentialSetupMapper } from '../mappers/credential-setup.mapper';
import { CredentialSetupService } from '../services/credential-setup.service';
import { GetCredentialService } from './get-credential.service';

@Injectable()
export class GetCredentialSetupService {
  constructor(
    private readonly setups: CredentialSetupService,
    private readonly getCredential: GetCredentialService,
    private readonly access: AccessDecisionService,
    private readonly mapper: CredentialSetupMapper
  ) {}

  async run(id: string, context: AuthorizationContext): Promise<CredentialSetupDto> {
    const setup = this.mapper.toDto(await this.setups.getOwned(id, context));
    // A completed setup records a past result, even if the Credential is no longer available.
    if (setup.credentialId && setup.status === 'pending') {
      await this.getCredential.run(setup.credentialId, context);
      if (
        !(await this.access.canAccess(
          context.userId,
          context.roles ?? [],
          EntityType.CREDENTIAL,
          setup.credentialId,
          Action.EDIT,
          context.projectId
        ))
      ) {
        throw new ForbiddenException('You do not have permission to maintain this Credential');
      }
    }
    return setup;
  }
}
