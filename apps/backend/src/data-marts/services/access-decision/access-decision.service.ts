import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataDestination } from '../../entities/data-destination.entity';
import { DataMartTechnicalOwner } from '../../entities/data-mart-technical-owner.entity';
import { DataMartBusinessOwner } from '../../entities/data-mart-business-owner.entity';
import { StorageOwner } from '../../entities/storage-owner.entity';
import { DestinationOwner } from '../../entities/destination-owner.entity';
import { ReportOwner } from '../../entities/report-owner.entity';
import { Report } from '../../entities/report.entity';
import { ACCESS_MATRIX } from './access-matrix.config';
import { EntityType, Action, Role, OwnerStatus, SharingState } from './access-decision.types';

@Injectable()
export class AccessDecisionService {
  private readonly logger = new Logger(AccessDecisionService.name);

  // Pre-indexed lookup map for O(1) access decisions
  private readonly matrixMap: Map<string, boolean>;

  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    @InjectRepository(DataMartTechnicalOwner)
    private readonly dataMartTechnicalOwnerRepository: Repository<DataMartTechnicalOwner>,
    @InjectRepository(DataMartBusinessOwner)
    private readonly dataMartBusinessOwnerRepository: Repository<DataMartBusinessOwner>,
    @InjectRepository(StorageOwner)
    private readonly storageOwnerRepository: Repository<StorageOwner>,
    @InjectRepository(DestinationOwner)
    private readonly destinationOwnerRepository: Repository<DestinationOwner>,
    @InjectRepository(ReportOwner)
    private readonly reportOwnerRepository: Repository<ReportOwner>,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>
  ) {
    this.matrixMap = new Map();
    for (const rule of ACCESS_MATRIX) {
      const key = this.buildKey(
        rule.entityType,
        rule.action,
        rule.role,
        rule.ownershipStatus,
        rule.sharingState
      );
      this.matrixMap.set(key, rule.result);
    }
  }

  private buildKey(
    entityType: EntityType,
    action: Action,
    role: Role,
    ownerStatus: OwnerStatus,
    sharingState: SharingState
  ): string {
    return `${entityType}|${action}|${role}|${ownerStatus}|${sharingState}`;
  }

  /**
   * Core access decision method. Returns whether the user can perform the action on the entity.
   */
  async canAccess(
    userId: string,
    roles: string[],
    entityType: EntityType,
    entityId: string,
    action: Action,
    projectId: string
  ): Promise<boolean> {
    const role = this.resolveRole(roles);

    // Admin shortcut
    if (role === Role.ADMIN) {
      return this.lookupMatrix(
        entityType,
        action,
        Role.ADMIN,
        OwnerStatus.ADMIN,
        SharingState.NOT_SHARED
      );
    }

    const ownerStatus = await this.getOwnerStatus(userId, entityType, entityId);
    const sharingState = await this.getSharingState(entityType, entityId, projectId);

    const result = this.lookupMatrix(entityType, action, role, ownerStatus, sharingState);

    if (!result) {
      this.logger.debug(
        `Access denied: user=${userId} entity=${entityType}/${entityId} action=${action} role=${role} owner=${ownerStatus} sharing=${sharingState}`
      );
    }

    return result;
  }

  private lookupMatrix(
    entityType: EntityType,
    action: Action,
    role: Role,
    ownerStatus: OwnerStatus,
    sharingState: SharingState
  ): boolean {
    const key = this.buildKey(entityType, action, role, ownerStatus, sharingState);
    const result = this.matrixMap.get(key);
    if (result === undefined) {
      this.logger.warn(`No access rule found for: ${key}. Denying by default.`);
      return false;
    }
    return result;
  }

  private resolveRole(roles: string[]): Role {
    if (roles.includes('admin')) return Role.ADMIN;
    if (roles.includes('editor')) return Role.EDITOR;
    return Role.VIEWER;
  }

  async getOwnerStatus(
    userId: string,
    entityType: EntityType,
    entityId: string
  ): Promise<OwnerStatus> {
    switch (entityType) {
      case EntityType.STORAGE: {
        const count = await this.storageOwnerRepository.count({
          where: { storageId: entityId, userId },
        });
        return count > 0 ? OwnerStatus.OWNER : OwnerStatus.NON_OWNER;
      }
      case EntityType.DATA_MART: {
        const techCount = await this.dataMartTechnicalOwnerRepository.count({
          where: { dataMartId: entityId, userId },
        });
        if (techCount > 0) return OwnerStatus.TECH_OWNER;

        const bizCount = await this.dataMartBusinessOwnerRepository.count({
          where: { dataMartId: entityId, userId },
        });
        if (bizCount > 0) return OwnerStatus.BIZ_OWNER;

        return OwnerStatus.NON_OWNER;
      }
      case EntityType.DESTINATION: {
        const count = await this.destinationOwnerRepository.count({
          where: { destinationId: entityId, userId },
        });
        return count > 0 ? OwnerStatus.OWNER : OwnerStatus.NON_OWNER;
      }
      case EntityType.REPORT: {
        const count = await this.reportOwnerRepository.count({
          where: { reportId: entityId, userId },
        });
        return count > 0 ? OwnerStatus.OWNER : OwnerStatus.NON_OWNER;
      }
      default:
        return OwnerStatus.NON_OWNER;
    }
  }

  async getSharingState(
    entityType: EntityType,
    entityId: string,
    _projectId: string
  ): Promise<SharingState> {
    switch (entityType) {
      case EntityType.STORAGE: {
        const storage = await this.dataStorageRepository.findOne({
          where: { id: entityId },
          select: ['id', 'sharedForUse', 'sharedForMaintenance'],
        });
        if (!storage) return SharingState.NOT_SHARED;
        return this.resolveUseMaintenanceSharing(
          storage.sharedForUse,
          storage.sharedForMaintenance
        );
      }
      case EntityType.DATA_MART: {
        const dm = await this.dataMartRepository.findOne({
          where: { id: entityId },
          select: ['id', 'sharedForReporting', 'sharedForMaintenance'],
        });
        if (!dm) return SharingState.NOT_SHARED;
        return this.resolveReportingMaintenanceSharing(
          dm.sharedForReporting,
          dm.sharedForMaintenance
        );
      }
      case EntityType.DESTINATION: {
        const dest = await this.dataDestinationRepository.findOne({
          where: { id: entityId },
          select: ['id', 'sharedForUse', 'sharedForMaintenance'],
        });
        if (!dest) return SharingState.NOT_SHARED;
        return this.resolveUseMaintenanceSharing(dest.sharedForUse, dest.sharedForMaintenance);
      }
      default:
        return SharingState.NOT_SHARED;
    }
  }

  /**
   * DM Trigger access — inherited from parent DataMart.
   * SEE trigger = SEE parent DM.
   * MANAGE_TRIGGERS = DM maintenance access (EDIT on DM).
   */
  async canAccessDmTrigger(
    userId: string,
    roles: string[],
    _triggerId: string,
    dataMartId: string,
    action: Action,
    projectId: string
  ): Promise<boolean> {
    const role = this.resolveRole(roles);
    if (role === Role.ADMIN) return true;

    if (action === Action.SEE) {
      return this.canAccess(userId, roles, EntityType.DATA_MART, dataMartId, Action.SEE, projectId);
    }
    // MANAGE_TRIGGERS, EDIT, DELETE → requires DM maintenance (mapped to MANAGE_TRIGGERS on DM)
    return this.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      dataMartId,
      Action.MANAGE_TRIGGERS,
      projectId
    );
  }

  /**
   * Report access — DM visibility boundary + ownership.
   * SEE report = SEE parent DM.
   * EDIT/DELETE/RUN = DM maintenance (EDIT on DM) OR Report ownership.
   */
  async canAccessReport(
    userId: string,
    roles: string[],
    reportId: string,
    dataMartId: string,
    action: Action,
    projectId: string
  ): Promise<boolean> {
    const role = this.resolveRole(roles);
    if (role === Role.ADMIN) return true;

    // DM must be visible
    const canSeeDm = await this.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      dataMartId,
      Action.SEE,
      projectId
    );
    if (!canSeeDm) return false;

    if (action === Action.SEE) return true;

    // EDIT/DELETE/RUN: DM maintenance access = full report mutation
    const hasDmMaintenance = await this.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      dataMartId,
      Action.EDIT,
      projectId
    );
    if (hasDmMaintenance) return true;

    // Or: report ownership
    const ownerCount = await this.reportOwnerRepository.count({
      where: { reportId, userId },
    });
    return ownerCount > 0;
  }

  private resolveUseMaintenanceSharing(
    sharedForUse: boolean,
    sharedForMaintenance: boolean
  ): SharingState {
    if (sharedForUse && sharedForMaintenance) return SharingState.SHARED_FOR_BOTH;
    if (sharedForUse) return SharingState.SHARED_FOR_USE;
    if (sharedForMaintenance) return SharingState.SHARED_FOR_MAINTENANCE;
    return SharingState.NOT_SHARED;
  }

  private resolveReportingMaintenanceSharing(
    sharedForReporting: boolean,
    sharedForMaintenance: boolean
  ): SharingState {
    if (sharedForReporting && sharedForMaintenance) return SharingState.SHARED_FOR_BOTH;
    if (sharedForReporting) return SharingState.SHARED_FOR_REPORTING;
    if (sharedForMaintenance) return SharingState.SHARED_FOR_MAINTENANCE;
    return SharingState.NOT_SHARED;
  }
}
