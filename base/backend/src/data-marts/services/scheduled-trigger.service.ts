import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

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
