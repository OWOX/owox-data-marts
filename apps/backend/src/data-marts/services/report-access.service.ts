import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { ReportOwner } from '../entities/report-owner.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { AccessDecisionService, EntityType, Action } from './access-decision';

type MutateDeniedReason = 'not-owner' | 'ineffective' | 'not-found' | 'dm-invisible';

type MutateResult = { allowed: true } | { allowed: false; reason: MutateDeniedReason };

const MUTATE_DENIED_MESSAGES: Record<MutateDeniedReason, string> = {
  'not-owner': 'You are not an owner of this report. Only report owners can modify it.',
  'not-found': 'Report not found.',
  ineffective:
    'The destination for this report has been deleted. The report cannot be modified or run until a Technical User updates the destination or reassigns ownership.',
  'dm-invisible': 'You do not have access to the DataMart for this report.',
};

@Injectable()
export class ReportAccessService {
  private readonly logger = new Logger(ReportAccessService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(ReportOwner)
    private readonly reportOwnerRepository: Repository<ReportOwner>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  /**
   * Evaluate whether a user can mutate a Report. Single source of truth for access logic.
   *
   * Permissions Model: Editor no longer has project-wide bypass.
   * Access requires: DM visible + (DM maintenance access OR Report ownership with effective dest).
   */
  private async evaluateMutateAccess(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<MutateResult> {
    const report = await this.reportRepository.findOne({
      where: { id: reportId, dataMart: { projectId } },
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      return { allowed: false, reason: 'not-found' };
    }

    // Permissions Model: DM must be visible to the user
    const canSeeDm = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      report.dataMart.id,
      Action.SEE,
      projectId
    );
    if (!canSeeDm) {
      return { allowed: false, reason: 'dm-invisible' };
    }

    // DM maintenance access = can mutate any report on this DM
    const hasDmMaintenance = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      report.dataMart.id,
      Action.EDIT,
      projectId
    );
    if (hasDmMaintenance) {
      return { allowed: true };
    }

    // Otherwise: must be report owner + effective
    const ownerCount = await this.reportOwnerRepository.count({
      where: { reportId, userId },
    });

    if (ownerCount === 0) {
      return { allowed: false, reason: 'not-owner' };
    }

    const effective = await this.isEffective(userId, report, roles, projectId);
    return effective ? { allowed: true } : { allowed: false, reason: 'ineffective' };
  }

  /**
   * Check if a user can mutate (edit/delete/run) a Report. Returns boolean.
   */
  async canMutate(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<boolean> {
    const result = await this.evaluateMutateAccess(userId, roles, reportId, projectId);
    return result.allowed;
  }

  /**
   * Assert that a user can mutate a Report, throwing descriptive ForbiddenException if not.
   */
  async checkMutateAccess(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<void> {
    const result = await this.evaluateMutateAccess(userId, roles, reportId, projectId);
    if (!result.allowed) {
      this.logger.warn(`Access denied: ${result.reason}`, { userId, reportId, projectId });
      throw new ForbiddenException(MUTATE_DENIED_MESSAGES[result.reason]);
    }
  }

  /**
   * Check if an owner is effective — can actually mutate/run the Report.
   * Ineffective = Destination deleted or inaccessible.
   */
  async isEffective(
    _userId: string,
    report: Report,
    _roles?: string[],
    _projectId?: string
  ): Promise<boolean> {
    if (!report.dataDestination) {
      return false;
    }

    const destinationCount = await this.dataDestinationRepository.count({
      where: { id: report.dataDestination.id },
    });

    return destinationCount > 0;
  }

  isTechnicalUser(roles: string[]): boolean {
    return roles.includes('editor') || roles.includes('admin');
  }

  /**
   * Check if a user can be added as an owner of a Report.
   * Must be an active project member with access to the Report's DataMart.
   */
  async canBeOwner(userId: string, report: Report, projectId: string): Promise<boolean> {
    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
    const member = members.find(
      (m: { userId: string; isOutbound: boolean }) => m.userId === userId
    );

    if (!member || member.isOutbound) {
      return false;
    }

    // Permissions Model: check DataMart visibility for this user
    if (report.dataMart) {
      const canSeeDm = await this.accessDecisionService.canAccess(
        userId,
        [member.role ?? 'viewer'],
        EntityType.DATA_MART,
        report.dataMart.id,
        Action.SEE,
        projectId
      );
      if (!canSeeDm) {
        return false;
      }
    }

    // Permissions Model: check Destination USE access for this user
    if (report.dataDestination) {
      const canUseDest = await this.accessDecisionService.canAccess(
        userId,
        [member.role ?? 'viewer'],
        EntityType.DESTINATION,
        report.dataDestination.id,
        Action.USE,
        projectId
      );
      if (!canUseDest) {
        return false;
      }
    }

    return true;
  }
}
