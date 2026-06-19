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
    const pageQb = this.triggerRepository
      .createQueryBuilder('scheduledTrigger')
      .innerJoin('scheduledTrigger.dataMart', 'dataMart')
      .where('dataMart.projectId = :projectId', { projectId: options.projectId })
      .andWhere('dataMart.deletedAt IS NULL');

    applyDataMartVisibilityFilter(pageQb, {
      dataMartAlias: 'dataMart',
      projectId: options.projectId,
      userId: options.userId,
      roles: options.roles,
      roleScope: options.roleScope,
    });

    const page = await pageQb
      .select('scheduledTrigger.id', 'id')
      .orderBy('scheduledTrigger.createdAt', 'DESC')
      .addOrderBy('scheduledTrigger.id', 'DESC')
      .limit(options.limit ?? 20)
      .offset(options.offset ?? 0)
      .getRawMany<{ id: string }>();
    const triggerIds = page.map(({ id }) => id);
    if (triggerIds.length === 0) {
      return [];
    }

    const triggers = await this.triggerRepository
      .createQueryBuilder('scheduledTrigger')
      .innerJoin('scheduledTrigger.dataMart', 'dataMart')
      .select(['scheduledTrigger', 'dataMart.id', 'dataMart.title', 'dataMart.definition'])
      .where('scheduledTrigger.id IN (:...triggerIds)', { triggerIds })
      .getMany();
    const triggersById = new Map(triggers.map(trigger => [trigger.id, trigger]));

    return triggerIds.flatMap(id => {
      const trigger = triggersById.get(id);
      return trigger ? [trigger] : [];
    });
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
