import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { Insight } from '../entities/insight.entity';
import { CreateInsightWithAiCommand } from '../dto/domain/create-insight-with-ai.command';
import { InsightDto } from '../dto/domain/insight.dto';
import { DataMartService } from '../services/data-mart.service';
import { InsightMapper } from '../mappers/insight.mapper';
import { AiInsightsFacade } from '../ai-insights/facades/ai-insights.facade';
import { AI_INSIGHTS_FACADE } from '../ai-insights/ai-insights-types';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { type OwoxProducer } from '@owox/internal-helpers';
import { InsightGeneratedSuccessfullyEvent } from '../events/insight-generated-successfully.event';
import { PromptProcessedEventsService } from '../ai-insights/prompt-processed-events.service';

@Injectable()
export class CreateInsightWithAiService {
  private readonly logger = new Logger(CreateInsightWithAiService.name);

  constructor(
    @InjectRepository(Insight)
    private readonly repository: Repository<Insight>,
    private readonly dataMartService: DataMartService,
    private readonly mapper: InsightMapper,
    @Inject(AI_INSIGHTS_FACADE)
    private readonly aiInsightsFacade: AiInsightsFacade,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly promptProcessedEvents: PromptProcessedEventsService
  ) {}

  async run(command: CreateInsightWithAiCommand): Promise<InsightDto> {
    this.logger.log(`Creating insight with AI for data mart ${command.dataMartId}`);

    // Get data mart with metadata
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    if (!dataMart.schema) {
      throw new BusinessViolationException(
        'AI Insight generation works only for data marts with a known schema.'
      );
    }

    // Call the AI facade to generate insight title and template
    const aiResult = await this.aiInsightsFacade.generateInsight({
      projectId: command.projectId,
      dataMartId: command.dataMartId,
      dataMartTitle: dataMart.title,
      dataMartDescription: dataMart.description ?? null,
      schema: dataMart.schema,
    });

    // Create insight with AI-generated title and template
    const insight = this.repository.create({
      title: aiResult.title,
      template: aiResult.template,
      dataMart,
      createdById: command.userId,
    });

    const saved = await this.repository.save(insight);

    this.promptProcessedEvents.produce(aiResult.prompts, {
      entityName: 'INSIGHT',
      entityId: saved.id,
      userId: command.userId,
      projectId: command.projectId,
    });

    try {
      await this.producer.produceEvent(
        new InsightGeneratedSuccessfullyEvent(
          dataMart.id,
          saved.id,
          command.projectId,
          command.userId
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to produce InsightGeneratedSuccessfullyEvent: ${message}`, {
        dataMartId: dataMart.id,
        insightId: saved.id,
        projectId: command.projectId,
        userId: command.userId,
      });
    }

    return this.mapper.toDomainDto(saved);
  }
}
