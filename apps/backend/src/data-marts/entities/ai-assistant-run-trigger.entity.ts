import { Column, Entity } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import { AiRunTriggerResponseApiDto } from '../dto/presentation/ai-run-trigger-response-api.dto';

@Entity('ai_assistant_run_triggers')
export class AiAssistantRunTrigger extends UiTrigger<AiRunTriggerResponseApiDto> {
  @Column()
  dataMartId: string;

  @Column()
  projectId: string;

  @Column()
  sessionId: string;

  @Column()
  userMessageId: string;
}
