import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInsightTemplateCommand } from '../dto/domain/create-insight-template.command';
import { InsightTemplateDto } from '../dto/domain/insight-template.dto';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { DataMartService } from '../services/data-mart.service';
import { InsightTemplateValidationService } from '../services/insight-template-validation.service';
import { DEFAULT_INSIGHT_TEMPLATE } from '../template/default-insight-template';

@Injectable()
export class CreateInsightTemplateService {
  private readonly logger = new Logger(CreateInsightTemplateService.name);

  constructor(
    @InjectRepository(InsightTemplate)
    private readonly repository: Repository<InsightTemplate>,
    private readonly dataMartService: DataMartService,
    private readonly mapper: InsightTemplateMapper,
    private readonly validationService: InsightTemplateValidationService
  ) {}

  async run(command: CreateInsightTemplateCommand): Promise<InsightTemplateDto> {
    this.logger.log(`Creating insight template for data mart ${command.dataMartId}`);

    const template = this.resolveTemplate(command.template);

    await this.validationService.validateSources(command.sources, {
      dataMartId: command.dataMartId,
      projectId: command.projectId,
    });
    this.validationService.validateTemplateText(template);

    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const insightTemplate = this.repository.create({
      title: command.title,
      template,
      sources: command.sources,
      dataMart,
      createdById: command.userId,
    });

    const saved = await this.repository.save(insightTemplate);
    return this.mapper.toDomainDto(saved);
  }

  private resolveTemplate(template?: string): string {
    const normalized = template?.trim();
    if (!normalized) {
      return DEFAULT_INSIGHT_TEMPLATE;
    }

    return normalized;
  }
}
