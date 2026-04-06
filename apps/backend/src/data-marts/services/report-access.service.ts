import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { ReportOwner } from '../entities/report-owner.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

type MutateDeniedReason = 'not-owner' | 'ineffective' | 'not-found';

type MutateResult = { allowed: true } | { allowed: false; reason: MutateDeniedReason };

const MUTATE_DENIED_MESSAGES: Record<MutateDeniedReason, string> = {
  'not-owner': 'You are not an owner of this report. Only report owners can modify it.',
  'not-found': 'Report not found.',
  ineffective:
    'The destination for this report has been deleted. The report cannot be modified or run until a Technical User updates the destination or reassigns ownership.',
};

@Injectable()
export class ReportAccessService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(ReportOwner)
    private readonly reportOwnerRepository: Repository<ReportOwner>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  /**
   * Evaluate whether a user can mutate a Report. Single source of truth for access logic.
   */
  private async evaluateMutateAccess(
    userId: string,
    roles: string[],
    reportId: string,
    projectId: string
  ): Promise<MutateResult> {
    // TODO Stage 3: narrow editor to owned + shared only
    if (roles.includes('editor') || roles.includes('admin')) {
      return { allowed: true };
    }

    const ownerCount = await this.reportOwnerRepository.count({
      where: { reportId, userId },
    });

    if (ownerCount === 0) {
      return { allowed: false, reason: 'not-owner' };
    }

    const report = await this.reportRepository.findOne({
      where: { id: reportId, dataMart: { projectId } },
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      return { allowed: false, reason: 'not-found' };
    }

    const effective = await this.isEffective(userId, report);
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
      throw new ForbiddenException(MUTATE_DENIED_MESSAGES[result.reason]);
    }
  }

  /**
   * Check if an owner is effective — can actually mutate/run the Report.
   * Ineffective = lost access to DataMart or Destination.
   */
  async isEffective(_userId: string, report: Report): Promise<boolean> {
    // Stage 2: DM access = always true for project members
    // TODO Stage 3: check DataMart access via sharing/ownership for _userId
    const dmAccessible = true;

    if (!report.dataDestination) {
      return false;
    }

    const destinationCount = await this.dataDestinationRepository.count({
      where: { id: report.dataDestination.id },
    });

    return dmAccessible && destinationCount > 0;
  }

  /**
   * Check if a user can be added as an owner of a Report.
   * Must be an active project member with access to the Report's DataMart and Destination.
   */
  async canBeOwner(userId: string, report: Report, projectId: string): Promise<boolean> {
    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
    const member = members.find(
      (m: { userId: string; isOutbound: boolean }) => m.userId === userId
    );

    if (!member || member.isOutbound) {
      return false;
    }

    // Stage 2: member with any role has access to all DataMarts and Destinations
    // TODO Stage 3: check DataMart and Destination access specifically
    return true;
  }
}
