import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { InsightTemplateDto } from '../dto/domain/insight-template.dto';
import { UpdateInsightTemplateCommand } from '../dto/domain/update-insight-template.command';
import { InsightTemplateValidationService } from '../services/insight-template-validation.service';

@Injectable()
export class UpdateInsightTemplateService {
  constructor(
    @InjectRepository(InsightTemplate)
    private readonly repository: Repository<InsightTemplate>,
    private readonly mapper: InsightTemplateMapper,
    private readonly validationService: InsightTemplateValidationService
  ) {}

  async run(command: UpdateInsightTemplateCommand): Promise<InsightTemplateDto> {
    const insightTemplate = await this.repository.findOne({
      where: {
        id: command.insightTemplateId,
        dataMart: {
          id: command.dataMartId,
          projectId: command.projectId,
        },
      },
      relations: ['dataMart'],
    });

    if (!insightTemplate) {
      throw new NotFoundException(`InsightTemplate with ID ${command.insightTemplateId} not found`);
    }

    if (command.sources !== undefined) {
      await this.validationService.validateSources(command.sources, {
        dataMartId: command.dataMartId,
        projectId: command.projectId,
      });
      insightTemplate.sources = command.sources;
    }

    if (command.title !== undefined) {
      insightTemplate.title = command.title;
    }

    if (command.template !== undefined) {
      this.validationService.validateTemplateText(command.template);
      insightTemplate.template = command.template;
    }

    const saved = await this.repository.save(insightTemplate);
    return this.mapper.toDomainDto(saved);
  }
}
