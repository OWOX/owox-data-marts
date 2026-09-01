import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialService } from '../services/credential.service';
import { CredentialViewService } from '../services/credential-view.service';

@Injectable()
export class ConsentCredentialDefinitionService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService,
    private readonly view: CredentialViewService
  ) {}

  async run(id: string, context: AuthorizationContext): Promise<CredentialDto> {
    const credential = await this.credentials.getByIdAndProjectId(id, context.projectId);
    const canEdit = await this.access.canAccess(
      context.userId,
      context.roles ?? [],
      EntityType.CREDENTIAL,
      id,
      Action.EDIT,
      context.projectId
    );
    if (!canEdit) {
      throw new ForbiddenException('You do not have permission to consent to this update');
    }
    const definition = await this.definitions.getForView(credential);
    if (definition.source === 'external') {
      credential.acceptedCompatibilityLine = definition.compatibilityLine;
      await this.credentials.save(credential);
    }
    return this.view.build(credential);
  }
}
