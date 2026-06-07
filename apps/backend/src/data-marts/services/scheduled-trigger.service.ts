import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { RoleScope } from '../enums/role-scope.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { applyDataMartVisibilityFilter } from '../utils/apply-data-mart-visibility-filter';

export interface ListVisibleProjectScheduledTriggersOptions {
  projectId: string;
  userId: string;
  roles: string[];
  roleScope: RoleScope;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>
  ) {}

  async getByIdAndDataMartIdAndProjectId(
    id: string,
    dataMartId: string,
    projectId: string
  ): Promise<DataMartScheduledTrigger> {
    const trigger = await this.triggerRepository.findOne({
      where: {
        id,
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart'],
    });

    if (!trigger) {
      throw new NotFoundException(`Scheduled trigger with id ${id} not found`);
    }

    return trigger;
  }

  async getAllByDataMartIdAndProjectId(
    dataMartId: string,
    projectId: string
  ): Promise<DataMartScheduledTrigger[]> {
    return this.triggerRepository.find({
      where: {
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart'],
    });
  }

  async listVisibleByProject(
    options: ListVisibleProjectScheduledTriggersOptions
  ): Promise<DataMartScheduledTrigger[]> {
    const qb = this.triggerRepository
      .createQueryBuilder('scheduledTrigger')
      .innerJoinAndSelect('scheduledTrigger.dataMart', 'dataMart')
      .where('dataMart.projectId = :projectId', { projectId: options.projectId })
      .andWhere('dataMart.deletedAt IS NULL')
      .orderBy('scheduledTrigger.createdAt', 'DESC')
      .addOrderBy('scheduledTrigger.id', 'DESC')
      .take(options.limit ?? 20)
      .skip(options.offset ?? 0);

    applyDataMartVisibilityFilter(qb, {
      dataMartAlias: 'dataMart',
      projectId: options.projectId,
      userId: options.userId,
      roles: options.roles,
      roleScope: options.roleScope,
    });

    return qb.getMany();
  }

  async deleteAllByDataMartIdAndProjectId(dataMartId: string, projectId: string): Promise<void> {
    await this.triggerRepository.delete({
      dataMart: {
        id: dataMartId,
        projectId,
      },
    });
  }

  async deleteAllByReportIdAndDataMartIdAndProjectId(
    reportId: string,
    dataMartId: string,
    projectId: string
  ): Promise<void> {
    const triggers = await this.getAllByDataMartIdAndProjectId(dataMartId, projectId);

    const triggersToDelete = triggers.filter(
      trigger =>
        trigger.type === ScheduledTriggerType.REPORT_RUN &&
        trigger.triggerConfig?.reportId === reportId
    );

    if (triggersToDelete.length > 0) {
      await this.triggerRepository.remove(triggersToDelete);
    }
  }
}
