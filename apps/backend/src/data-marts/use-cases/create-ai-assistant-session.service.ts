import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateAiAssistantSessionCommand } from '../dto/domain/create-ai-assistant-session.command';
import { AiAssistantSessionDto } from '../dto/domain/ai-assistant-session.dto';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';
import { DataMartService } from '../services/data-mart.service';
import { InsightTemplateService } from '../services/insight-template.service';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';

@Injectable()
export class CreateAiAssistantSessionService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly mapper: AiAssistantMapper
  ) {}

  async run(command: CreateAiAssistantSessionCommand): Promise<AiAssistantSessionDto> {
    await this.dataMartService.getByIdAndProjectId(command.dataMartId, command.projectId);

    if (!command.templateId) {
      throw new BusinessViolationException('`templateId` is required for template scope');
    }

    await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.templateId,
      command.dataMartId,
      command.projectId
    );

    const created = await this.aiAssistantSessionService.createSession({
      dataMartId: command.dataMartId,
      createdById: command.userId,
      scope: AiAssistantScope.TEMPLATE,
      templateId: command.templateId,
    });

    return this.mapper.toDomainSessionDto(created, []);
  }
}
