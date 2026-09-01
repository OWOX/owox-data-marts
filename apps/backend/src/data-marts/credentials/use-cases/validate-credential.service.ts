import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialService } from '../services/credential.service';
import { CredentialValidationProbeService } from '../services/credential-validation-probe.service';
import { CredentialViewService } from '../services/credential-view.service';

@Injectable()
export class ValidateCredentialService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService,
    private readonly view: CredentialViewService,
    private readonly validationProbe: CredentialValidationProbeService
  ) {}

  async run(id: string, context: AuthorizationContext): Promise<CredentialDto> {
    const credential = await this.credentials.getByIdAndProjectId(id, context.projectId);
    if (
      !(await this.access.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.CREDENTIAL,
        id,
        Action.EDIT,
        context.projectId
      ))
    ) {
      throw new ForbiddenException('You do not have permission to validate this Credential');
    }

    const definition = await this.definitions.getForCredential(credential);
    const validation = await this.validationProbe.run(definition, credential.secret);
    credential.validationState = validation.state;
    credential.validationMessage = validation.message;
    credential.validatedAt = validation.validatedAt;
    await this.credentials.save(credential);
    return this.view.build(credential);
  }
}
