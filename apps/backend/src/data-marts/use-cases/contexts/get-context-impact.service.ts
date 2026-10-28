import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ContextService } from '../../services/context/context.service';
import type { GetContextImpactCommand } from '../../dto/domain/get-context-impact.command';
import type { ContextImpactDto } from '../../dto/domain/context.dto';
import { getNonAdminMemberIds } from './util/non-admin-member-ids.util';

@Injectable()
export class GetContextImpactService {
  constructor(
    private readonly contexts: ContextService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  async run(command: GetContextImpactCommand): Promise<ContextImpactDto> {
    const nonAdminMemberIds = await getNonAdminMemberIds(
      this.idpProjectionsFacade,
      command.projectId
    );
    return this.contexts.getImpact(command.contextId, command.projectId, nonAdminMemberIds);
  }
}
