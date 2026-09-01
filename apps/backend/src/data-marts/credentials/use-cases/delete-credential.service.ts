import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import type { AuthorizationContext } from '../../../idp';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { CredentialService } from '../services/credential.service';

@Injectable()
export class DeleteCredentialService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService
  ) {}

  @Transactional()
  async run(id: string, context: AuthorizationContext): Promise<void> {
    await this.credentials.getByIdAndProjectId(id, context.projectId);
    if (
      !(await this.access.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.CREDENTIAL,
        id,
        Action.DELETE,
        context.projectId
      ))
    ) {
      throw new ForbiddenException('You do not have permission to delete this Credential');
    }

    const credential = await this.credentials.lockActiveByIdAndProjectId(id, context.projectId);
    if (!credential) {
      throw new NotFoundException(`Credential ${id} was not found`);
    }

    const references = await this.credentials.countActiveBindings(id);
    if (references > 0) {
      throw new BusinessViolationException(
        `Cannot delete the Credential because it is used by ${references} active consumer(s).`
      );
    }
    await this.credentials.softDelete(id, context.projectId);
  }
}
