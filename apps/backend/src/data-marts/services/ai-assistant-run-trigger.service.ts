import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { AiRunTriggerResponseApiDto } from '../dto/presentation/ai-run-trigger-response-api.dto';
import { AiAssistantRunTrigger } from '../entities/ai-assistant-run-trigger.entity';

@Injectable()
export class AiAssistantRunTriggerService extends UiTriggerService<AiRunTriggerResponseApiDto> {
  constructor(
    @InjectRepository(AiAssistantRunTrigger)
    triggerRepository: Repository<AiAssistantRunTrigger>
  ) {
    super(triggerRepository);
  }

  async createTrigger(params: {
    userId: string;
    projectId: string;
    dataMartId: string;
    sessionId: string;
    userMessageId: string;
  }): Promise<string> {
    const trigger = new AiAssistantRunTrigger();
    trigger.userId = params.userId;
    trigger.projectId = params.projectId;
    trigger.dataMartId = params.dataMartId;
    trigger.sessionId = params.sessionId;
    trigger.userMessageId = params.userMessageId;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
