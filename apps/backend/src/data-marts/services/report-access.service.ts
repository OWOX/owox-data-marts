import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { ReportOwner } from '../entities/report-owner.entity';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { AccessDecisionService, EntityType, Action } from './access-decision';

type MutateDeniedReason = 'not-owner' | 'ineffective' | 'not-found' | 'dm-invisible';
type OperateDeniedReason = 'not-found' | 'dm-invisible' | 'destination-unusable';

type MutateResult = { allowed: true } | { allowed: false; reason: MutateDeniedReason };
type OperateResult = { allowed: true } | { allowed: false; reason: OperateDeniedReason };

/**
 * Capability flags exposed on Report API responses. `canRun` and `canManageTriggers`
 * are derived from the same `canOperate` predicate today; they are kept as separate
 * fields so the contract can diverge later without breaking clients.
 */
export interface ReportCapabilities {
  canRun: boolean;
  canManageTriggers: boolean;
  canEditConfig: boolean;
}

const EMPTY_CAPABILITIES: ReportCapabilities = Object.freeze({
  canRun: false,
  canManageTriggers: false,
  canEditConfig: false,
});

const MUTATE_DENIED_MESSAGES: Record<MutateDeniedReason, string> = {
  'not-owner': 'You are not an owner of this report. Only report owners can modify it.',
  'not-found': 'Report not found.',
  ineffective:
    'The destination for this report is not accessible to you. Ask a Technical User to share the destination or replace it.',
  'dm-invisible': 'You do not have access to the DataMart for this report.',
};

const OPERATE_DENIED_MESSAGES: Record<OperateDeniedReason, string> = {
  'not-found': 'Report not found.',
  'dm-invisible': 'You do not have access to the DataMart for this report.',
  'destination-unusable': 'You do not have access to the destination configured for this report.',
};

@Injectable()
export class ReportAccessService {
  private readonly logger = new Logger(ReportAccessService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(ReportOwner)
    private readonly reportOwnerRepository: Repository<ReportOwner>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  private async loadReportForAccess(reportId: string, projectId: string): Promise<Report | null> {
    return this.reportRepository.findOne({
      where: { id: reportId, dataMart: { projectId } },
      relations: ['dataMart', 'dataDestination'],
    });
  }

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
    const report = await this.loadReportForAccess(reportId, projectId);
    if (!report) {
      return { allowed: false, reason: 'not-found' };
    }
    return this.evaluateMutateAccessForReport(userId, roles, report, projectId);
  }

  /**
   * Same as `evaluateMutateAccess`, but operates on an already-loaded `Report`
   * to avoid an extra `findOne` round-trip (used by list endpoints to defeat N+1).
   * Caller MUST ensure `report.dataMart` and `report.dataDestination` relations are loaded.
   */
  private async evaluateMutateAccessForReport(
    userId: string,
    roles: string[],
    report: Report,
    projectId: string
  ): Promise<MutateResult> {
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
    const isOwner = await this.reportOwnerRepository.exist({
      where: { reportId: report.id, userId },
    });

    if (!isOwner) {
      return { allowed: false, reason: 'not-owner' };
    }

    if (!report.dataDestination) {
      return { allowed: false, reason: 'ineffective' };
    }

    const canUseDest = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DESTINATION,
      report.dataDestination.id,
      Action.USE,
      projectId
    );
    return canUseDest ? { allowed: true } : { allowed: false, reason: 'ineffective' };
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
   * Evaluate whether a user can OPERATE a Report — manual run + CRUD report triggers.
   * Decoupled from `canMutate` (which controls report config edits / owner changes).
   *
   * Operate = canSee(DataMart) AND canUse(Destination).
   * No Report ownership requirement.
   */
  private async evaluateOperateAccess(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<OperateResult> {
    const report = await this.loadReportForAccess(reportId, projectId);
    if (!report) {
      return { allowed: false, reason: 'not-found' };
    }
    return this.evaluateOperateAccessForReport(userId, roles, report, projectId);
  }

  /**
   * Same as `evaluateOperateAccess`, but operates on an already-loaded `Report`
   * to avoid an extra `findOne` round-trip. Caller MUST ensure relations
   * `dataMart` and `dataDestination` are loaded.
   */
  private async evaluateOperateAccessForReport(
    userId: string,
    roles: string[],
    report: Report,
    projectId: string
  ): Promise<OperateResult> {
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

    if (!report.dataDestination) {
      return { allowed: false, reason: 'destination-unusable' };
    }

    const canUseDest = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DESTINATION,
      report.dataDestination.id,
      Action.USE,
      projectId
    );
    if (!canUseDest) {
      return { allowed: false, reason: 'destination-unusable' };
    }

    return { allowed: true };
  }

  async canOperate(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<boolean> {
    const result = await this.evaluateOperateAccess(userId, roles, reportId, projectId);
    return result.allowed;
  }

  async checkOperateAccess(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<void> {
    const result = await this.evaluateOperateAccess(userId, roles, reportId, projectId);
    if (!result.allowed) {
      this.logger.warn(`Operate access denied: ${result.reason}`, {
        userId,
        reportId,
        projectId,
      });
      throw new ForbiddenException(OPERATE_DENIED_MESSAGES[result.reason]);
    }
  }

  /**
   * Capability flags exposed on Report responses. `canRun` and `canManageTriggers`
   * are tied to `canOperate` today; `canEditConfig` is tied to `canMutate`.
   * Computing both with `Promise.all` halves the latency on hot paths.
   *
   * Caller must supply an already-loaded `Report` with `dataMart` and `dataDestination`
   * relations populated. This is the one method use cases should call when assembling
   * `ReportDto` — do not duplicate the Promise.all + capability assembly elsewhere.
   */
  async computeCapabilitiesForReport(
    userId: string | undefined,
    roles: string[],
    report: Report,
    projectId: string
  ): Promise<ReportCapabilities> {
    if (!userId) {
      return EMPTY_CAPABILITIES;
    }

    const [operateResult, mutateResult] = await Promise.all([
      this.evaluateOperateAccessForReport(userId, roles, report, projectId),
      this.evaluateMutateAccessForReport(userId, roles, report, projectId),
    ]);

    const canOperate = operateResult.allowed;
    return {
      canRun: canOperate,
      canManageTriggers: canOperate,
      canEditConfig: mutateResult.allowed,
    };
  }

  /**
   * Check if a user is "effective" for this report — has USE access to its Destination.
   * Per Stage 2 §76 of the permissions spec, an Owner who loses Destination accessibility
   * becomes ineffective for mutation and running.
   */
  async isEffective(
    userId: string,
    report: Report,
    roles: string[],
    projectId: string
  ): Promise<boolean> {
    if (!report.dataDestination) {
      return false;
    }

    return this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DESTINATION,
      report.dataDestination.id,
      Action.USE,
      projectId
    );
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
