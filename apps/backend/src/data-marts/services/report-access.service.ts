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

export interface ReportCapabilities {
  canRun: boolean;
  canManageTriggers: boolean;
  canEditConfig: boolean;
  canViewSql: boolean;
  canCopyAsDataMart: boolean;
}

export const EMPTY_CAPABILITIES: ReportCapabilities = Object.freeze({
  canRun: false,
  canManageTriggers: false,
  canEditConfig: false,
  canViewSql: false,
  canCopyAsDataMart: false,
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
      relations: ['dataMart', 'dataMart.storage', 'dataDestination'],
    });
  }

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

  private async evaluateMutateAccessForReport(
    userId: string,
    roles: string[],
    report: Report,
    projectId: string
  ): Promise<MutateResult> {
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

  async canMutate(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<boolean> {
    const result = await this.evaluateMutateAccess(userId, roles, reportId, projectId);
    return result.allowed;
  }

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

  // Caller must supply an already-loaded `Report` with `dataMart`, `dataMart.storage`,
  // and `dataDestination` relations populated.
  async computeCapabilitiesForReport(
    userId: string | undefined,
    roles: string[],
    report: Report,
    projectId: string
  ): Promise<ReportCapabilities> {
    if (!userId) {
      return EMPTY_CAPABILITIES;
    }

    const [operateResult, mutateResult, canEditDm, canUseStorage] = await Promise.all([
      this.evaluateOperateAccessForReport(userId, roles, report, projectId),
      this.evaluateMutateAccessForReport(userId, roles, report, projectId),
      this.accessDecisionService.canAccess(
        userId,
        roles,
        EntityType.DATA_MART,
        report.dataMart.id,
        Action.EDIT,
        projectId
      ),
      this.accessDecisionService.canAccess(
        userId,
        roles,
        EntityType.STORAGE,
        report.dataMart.storage.id,
        Action.USE,
        projectId
      ),
    ]);

    return {
      canRun: operateResult.allowed,
      canManageTriggers: operateResult.allowed,
      canEditConfig: mutateResult.allowed,
      canViewSql: canEditDm,
      canCopyAsDataMart: canEditDm && canUseStorage,
    };
  }

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

  async canBeOwner(userId: string, report: Report, projectId: string): Promise<boolean> {
    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
    const member = members.find(
      (m: { userId: string; isOutbound: boolean }) => m.userId === userId
    );

    if (!member || member.isOutbound) {
      return false;
    }

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
