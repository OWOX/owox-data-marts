import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { Report } from '../entities/report.entity';
import { AccessDecisionService } from '../services/access-decision';
import { Action, EntityType } from '../services/access-decision/access-decision.types';
import {
  PluginEntityAuthorizationFacade,
  PluginEntityAuthorizationRequest,
} from './plugin-entity-authorization.facade';

@Injectable()
export class PluginEntityAuthorizationFacadeImpl implements PluginEntityAuthorizationFacade {
  constructor(
    @InjectRepository(DataMart) private readonly dataMarts: Repository<DataMart>,
    @InjectRepository(DataStorage) private readonly storages: Repository<DataStorage>,
    @InjectRepository(DataDestination)
    private readonly destinations: Repository<DataDestination>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    private readonly accessDecision: AccessDecisionService
  ) {}

  async canAccess(request: PluginEntityAuthorizationRequest): Promise<boolean> {
    const roles = [...request.roles];
    const action = request.action as Action;

    if (request.entityType === 'report') {
      const report = await this.reports.findOne({
        where: { id: request.entityId, dataMart: { projectId: request.projectId } },
        relations: { dataMart: true },
      });
      return report
        ? this.accessDecision.canAccessReport(
            request.userId,
            roles,
            report.id,
            report.dataMart.id,
            action,
            request.projectId
          )
        : false;
    }

    const entityType = this.toEntityType(request.entityType);
    const exists = await this.existsInProject(request);
    if (!exists) return false;

    return this.accessDecision.canAccess(
      request.userId,
      roles,
      entityType,
      request.entityId,
      action,
      request.projectId
    );
  }

  async canAccessMany(
    requests: readonly PluginEntityAuthorizationRequest[]
  ): Promise<Map<string, boolean>> {
    // AccessDecisionService does not yet expose bulk owner/sharing/context reads. Keep this
    // sequential so one plugin list cannot fan hundreds of SQL promises into the pool at once;
    // the collections scan budget independently caps this loop at ten entities.
    const results = new Map<string, boolean>();
    for (const request of requests) {
      results.set(request.entityId, await this.canAccess(request));
    }
    return results;
  }

  private existsInProject(request: PluginEntityAuthorizationRequest): Promise<boolean> {
    switch (request.entityType) {
      case 'data-mart':
        return this.dataMarts.exist({
          where: { id: request.entityId, projectId: request.projectId },
        });
      case 'storage':
        return this.storages.exist({
          where: { id: request.entityId, projectId: request.projectId },
        });
      case 'destination':
        return this.destinations.exist({
          where: { id: request.entityId, projectId: request.projectId },
        });
      case 'report':
        return Promise.resolve(false);
    }
  }

  private toEntityType(type: Exclude<PluginEntityAuthorizationRequest['entityType'], 'report'>) {
    const mapping = {
      'data-mart': EntityType.DATA_MART,
      storage: EntityType.STORAGE,
      destination: EntityType.DESTINATION,
    } as const;
    return mapping[type];
  }
}
