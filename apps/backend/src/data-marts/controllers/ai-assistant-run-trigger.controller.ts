import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { AiRunTriggerResponseApiDto } from '../dto/presentation/ai-run-trigger-response-api.dto';
import { AiAssistantRunTriggerService } from '../services/ai-assistant-run-trigger.service';

@Controller('data-marts/:dataMartId/ai-assistant/run-triggers')
@ApiTags('Insights')
export class AiAssistantRunTriggerController extends UiTriggerController<AiRunTriggerResponseApiDto> {
  constructor(triggerService: AiAssistantRunTriggerService) {
    super(triggerService);
  }
}
