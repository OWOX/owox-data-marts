import { Injectable } from '@nestjs/common';
import { ApplyAiAssistantSessionCommand } from '../dto/domain/apply-ai-assistant-session.command';
import { AiAssistantApplyResultDto } from '../dto/domain/ai-assistant-apply-result.dto';
import { AiSourceApplyService } from '../services/ai-source-apply.service';

@Injectable()
export class ApplyAiAssistantSessionService {
  constructor(private readonly aiSourceApplyService: AiSourceApplyService) {}

  async run(command: ApplyAiAssistantSessionCommand): Promise<AiAssistantApplyResultDto> {
    return this.aiSourceApplyService.apply(command);
  }
}
