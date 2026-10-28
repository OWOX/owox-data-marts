import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ContextService } from '../../services/context/context.service';
import type { DeleteContextCommand } from '../../dto/domain/delete-context.command';
import { getNonAdminMemberIds } from './util/non-admin-member-ids.util';

@Injectable()
export class DeleteContextService {
  constructor(
    private readonly contexts: ContextService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  async run(command: DeleteContextCommand): Promise<void> {
    const nonAdminMemberIds = await getNonAdminMemberIds(
      this.idpProjectionsFacade,
      command.projectId
    );
    return this.contexts.delete(command.contextId, command.projectId, nonAdminMemberIds);
  }
}
