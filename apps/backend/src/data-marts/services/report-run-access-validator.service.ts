import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { Report } from '../entities/report.entity';
import { AccessDecisionService, EntityType, Action } from './access-decision';
import { BlendableSchemaService } from './blendable-schema.service';
import { createDataMartUseAccessFilter } from '../utils/create-dm-access-filter';

export type RunContext = 'Scheduled run' | 'Looker Studio request' | 'Manual run';

const ACTOR_BY_CONTEXT: Record<RunContext, string> = {
  'Scheduled run': 'schedule creator',
  'Looker Studio request': 'report creator',
  'Manual run': 'you',
};

const HAS_ACCESS_VERB_BY_CONTEXT: Record<RunContext, string> = {
  'Scheduled run': 'no longer has access',
  'Looker Studio request': 'no longer has access',
  'Manual run': 'no longer have access',
};

const MEMBERSHIP_ERROR_BY_CONTEXT: Record<RunContext, string> = {
  'Scheduled run':
    'schedule creator is no longer a member of this project. Reassign the schedule to continue.',
  'Looker Studio request':
    'report creator is no longer a member of this project. Recreate the report with an active owner.',
  'Manual run':
    'you are no longer a member of this project. Sign in with an account that has access.',
};

@Injectable()
export class ReportRunAccessValidatorService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  async validate(
    report: Report,
    userId: string,
    projectId: string,
    context: RunContext,
    preResolvedRoles?: string[]
  ): Promise<void> {
    const actor = ACTOR_BY_CONTEXT[context];
    const hasAccessVerb = HAS_ACCESS_VERB_BY_CONTEXT[context];

    let roles: string[];

    if (preResolvedRoles) {
      roles = preResolvedRoles;
    } else {
      const member = await this.idpProjectionsFacade.getProjectMember(projectId, userId);
      if (!member || member.isOutbound) {
        throw new BusinessViolationException(
          `${context} blocked: ${MEMBERSHIP_ERROR_BY_CONTEXT[context]}`
        );
      }
      roles = [member.role ?? 'viewer'];
    }

    const canSeeDm = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      report.dataMart.id,
      Action.SEE,
      projectId
    );
    if (!canSeeDm) {
      throw new BusinessViolationException(
        `${context} blocked: ${actor} ${hasAccessVerb} to DataMart "${report.dataMart.title}".`
      );
    }

    if (report.dataDestination) {
      const canUseDest = await this.accessDecisionService.canAccess(
        userId,
        roles,
        EntityType.DESTINATION,
        report.dataDestination.id,
        Action.USE,
        projectId
      );
      if (!canUseDest) {
        throw new BusinessViolationException(
          `${context} blocked: ${actor} ${hasAccessVerb} to the destination configured for this report.`
        );
      }
    }

    if (report.columnConfig?.length || report.filterConfig?.length || report.sortConfig?.length) {
      const accessFilter = createDataMartUseAccessFilter(
        this.accessDecisionService,
        userId,
        roles,
        projectId
      );
      const { columns, filters, sorts } =
        await this.blendableSchemaService.findInaccessibleReportRefs(
          report,
          report.dataMart.id,
          projectId,
          accessFilter
        );
      const parts: string[] = [];
      if (columns.length) parts.push(`columns ${columns.sort().join(', ')}`);
      if (filters.length) parts.push(`filters ${filters.sort().join(', ')}`);
      if (sorts.length) parts.push(`sorts ${sorts.sort().join(', ')}`);
      if (parts.length) {
        throw new BusinessViolationException(
          `${context} blocked: ${parts.join('; ')} reference DataMarts no longer accessible to ${actor}.`
        );
      }
    }
  }
}
