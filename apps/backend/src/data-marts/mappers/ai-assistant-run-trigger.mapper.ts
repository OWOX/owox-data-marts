import { Injectable } from '@nestjs/common';
import { AiAssistantRunTriggerListItemResponseApiDto } from '../dto/presentation/ai-assistant-run-trigger-list-item-response-api.dto';
import { AiAssistantRunTrigger } from '../entities/ai-assistant-run-trigger.entity';

@Injectable()
export class AiAssistantRunTriggerMapper {
  toListItemResponse(trigger: AiAssistantRunTrigger): AiAssistantRunTriggerListItemResponseApiDto {
    return {
      id: trigger.id,
      sessionId: trigger.sessionId,
      status: trigger.status,
      uiResponse: trigger.uiResponse ?? null,
      createdAt: trigger.createdAt,
      modifiedAt: trigger.modifiedAt,
    };
  }

  toListItemResponseList(
    triggers: AiAssistantRunTrigger[]
  ): AiAssistantRunTriggerListItemResponseApiDto[] {
    return triggers.map(trigger => this.toListItemResponse(trigger));
  }
}
