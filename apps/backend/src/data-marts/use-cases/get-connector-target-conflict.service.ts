import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { ConnectorTargetConflictDto } from '../dto/domain/connector-target-conflict.dto';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { Action, AccessDecisionService, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';

export function normalizeTargetName(name: string): string {
  return name
    .replace(/[`"[\]]/g, '')
    .trim()
    .toLowerCase();
}

/** Tells whether another Data Mart's connector already writes the same target table. */
@Injectable()
export class GetConnectorTargetConflictService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(
    context: AuthorizationContext,
    dataMartId: string,
    fullyQualifiedName: string
  ): Promise<ConnectorTargetConflictDto> {
    const { projectId, userId } = context;
    const roles = context.roles ?? [];
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

    const canEdit = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      dataMartId,
      Action.EDIT,
      projectId
    );
    if (!canEdit) {
      throw new ForbiddenException('You do not have permission to edit this Data Mart');
    }

    const target = normalizeTargetName(fullyQualifiedName);
    const candidates = await this.dataMartService.findConnectorTargetsByStorage(
      projectId,
      dataMart.storage.id
    );
    // Drafts may hold a partial definition, so read the target defensively instead of validating.
    const matches = candidates.filter(candidate => {
      const name = (candidate.definition as Partial<ConnectorDefinition> | null | undefined)
        ?.connector?.storage?.fullyQualifiedName;
      return candidate.id !== dataMartId && !!name && normalizeTargetName(name) === target;
    });
    if (matches.length === 0) return new ConnectorTargetConflictDto(false, null);

    const canSee = await this.accessDecisionService.canAccessMany(
      userId,
      roles,
      EntityType.DATA_MART,
      matches.map(match => match.id),
      Action.SEE,
      projectId
    );
    const visible = matches.find(match => canSee.get(match.id) === true);
    return new ConnectorTargetConflictDto(
      true,
      visible ? { id: visible.id, title: visible.title } : null
    );
  }
}
