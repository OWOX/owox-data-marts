import { Injectable, Logger } from '@nestjs/common';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { RunDataMartService } from '../../../use-cases/run-data-mart.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import { ScheduledTriggerProcessor } from '../../interfaces/scheduled-trigger-processor.interface';
import { RunDataMartCommand } from '../../../dto/domain/run-data-mart.command';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../../../entities/data-mart.entity';

@Injectable()
export class ScheduledConnectorRunProcessor implements ScheduledTriggerProcessor {
  private readonly logger = new Logger(ScheduledConnectorRunProcessor.name);
  readonly type = ScheduledTriggerType.CONNECTOR_RUN;

  constructor(
    private readonly runDataMartService: RunDataMartService,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>
  ) {}

  async process(trigger: DataMartScheduledTrigger): Promise<void> {
    this.logger.log(`Processing trigger ${trigger.id}`);

    if (trigger.type !== this.type) {
      throw new Error(`Incompatible trigger type ${trigger.type}`);
    }

    const dataMart = await this.dataMartRepository
      .createQueryBuilder('dm')
      .select(['dm.id', 'dm.projectId'])
      .where('dm.id = :id', { id: trigger.dataMartId })
      .getOne();
    if (!dataMart) throw new Error(`DataMart ${trigger.dataMartId} not found`);

    await this.runDataMartService.run(
      new RunDataMartCommand(dataMart.id, dataMart.projectId, trigger.createdById, undefined)
    );
    this.logger.log(`Trigger ${trigger.id} processed`);
  }
}
