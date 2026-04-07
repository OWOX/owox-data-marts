import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

export interface MemberOwnershipWarning {
  userId: string;
  warning: string;
}

@Injectable()
export class MemberOwnershipWarningsService {
  constructor(
    @InjectRepository(DataMartTechnicalOwner)
    private readonly technicalOwnerRepository: Repository<DataMartTechnicalOwner>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  /**
   * Find project members who are Technical Owners of DataMarts but have Business User (viewer) role.
   * These owners have stored but ineffective ownership — their TU-level permissions don't activate.
   */
  async getWarnings(projectId: string): Promise<MemberOwnershipWarning[]> {
    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
    const viewers = members.filter(
      (m: { role: string; isOutbound: boolean }) => m.role === 'viewer' && !m.isOutbound
    );

    if (viewers.length === 0) return [];

    const viewerIds = viewers.map((m: { userId: string }) => m.userId);

    // Find which of these viewers are tech owners of any DM
    const techOwners = await this.technicalOwnerRepository
      .createQueryBuilder('to')
      .innerJoin('to.dataMart', 'dm')
      .where('dm.projectId = :projectId', { projectId })
      .andWhere('to.userId IN (:...viewerIds)', { viewerIds })
      .select('DISTINCT to.userId', 'userId')
      .getRawMany<{ userId: string }>();

    return techOwners.map(({ userId }) => ({
      userId,
      warning: 'Technical Owner — requires Technical User role to be effective',
    }));
  }
}
