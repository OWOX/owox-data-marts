import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import {
  DataMartAccessLevelDto,
  DataMartMemberAccessDto,
  DataMartMemberOwnership,
  MemberContextDto,
} from '../dto/domain/data-mart-member-access.dto';
import { GetDataMartMemberAccessCommand } from '../dto/domain/get-data-mart-member-access.command';
import {
  AccessDecisionService,
  Action,
  OwnerStatus,
  type DataMartAccessFacts,
} from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { ContextService } from '../services/context/context.service';
import { DataMartService } from '../services/data-mart.service';

/**
 * Lists what every project member can do with a Data Mart, and why — the answer an admin otherwise
 * assembles from the member's role and contexts, the Data Mart's owners, sharing and contexts.
 * Each action group is the decision the product enforces for those actions: See and Use; Edit,
 * Delete and Manage Triggers; Configure Sharing and Manage Owners.
 */
const OWNERSHIP_BY_STATUS: Partial<Record<OwnerStatus, DataMartMemberOwnership>> = {
  [OwnerStatus.TECH_OWNER]: DataMartMemberOwnership.DATA_OWNER,
  [OwnerStatus.BIZ_OWNER]: DataMartMemberOwnership.BUSINESS_OWNER,
};

@Injectable()
export class GetDataMartMemberAccessService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextService: ContextService,
    private readonly contextAccessService: ContextAccessService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetDataMartMemberAccessCommand): Promise<DataMartMemberAccessDto[]> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);
    // Strict read: a member list that silently came back empty would claim nobody can see it.
    const [members, projectContexts] = await Promise.all([
      this.idpProjectionsFacade.getProjectMembersOrThrow(command.projectId),
      this.contextService.list(command.projectId),
    ]);

    // `list` leaves out deleted contexts, which the context gate ignores too.
    const contextNames = new Map(projectContexts.map(context => [context.id, context.name]));
    const dataMartContextIds = dataMart.contextIds.filter(id => contextNames.has(id));
    const technicalOwnerIds = new Set(dataMart.technicalOwnerIds);
    const businessOwnerIds = new Set(dataMart.businessOwnerIds);

    const result: DataMartMemberAccessDto[] = [];
    // Sequential on purpose: getRoleScope() can write the project's default scope for a member
    // who has none yet, and SQLite does not take concurrent transactions.
    for (const member of members.filter(m => !m.isOutbound)) {
      const roleScope = await this.contextAccessService.getRoleScope(
        member.userId,
        command.projectId
      );
      const memberContextIds = await this.contextAccessService.getMemberContextIds(
        member.userId,
        command.projectId
      );

      // Technical ownership first, as AccessDecisionService.getOwnerStatus resolves it.
      let ownerStatus = OwnerStatus.NON_OWNER;
      if (technicalOwnerIds.has(member.userId)) {
        ownerStatus = OwnerStatus.TECH_OWNER;
      } else if (businessOwnerIds.has(member.userId)) {
        ownerStatus = OwnerStatus.BIZ_OWNER;
      }

      const facts: DataMartAccessFacts = {
        roles: [member.role],
        ownerStatus,
        availableForReporting: dataMart.availableForReporting,
        availableForMaintenance: dataMart.availableForMaintenance,
        roleScope,
        memberContextIds,
        dataMartContextIds,
      };
      // One representative action per group; the actions of a group are granted together.
      const level = (action: Action) => {
        const { granted, reason } = this.accessDecisionService.explainDataMartAccess(facts, action);
        return new DataMartAccessLevelDto(granted, reason);
      };

      result.push(
        new DataMartMemberAccessDto(
          member.userId,
          member.email,
          member.displayName,
          member.avatarUrl,
          member.role,
          roleScope,
          memberContextIds.flatMap(id => {
            const name = contextNames.get(id);
            return name === undefined ? [] : [new MemberContextDto(id, name)];
          }),
          OWNERSHIP_BY_STATUS[ownerStatus] ?? null,
          level(Action.SEE),
          level(Action.EDIT),
          level(Action.CONFIGURE_SHARING)
        )
      );
    }

    return result;
  }
}
