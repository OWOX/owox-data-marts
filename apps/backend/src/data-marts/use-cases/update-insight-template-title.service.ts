import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightTemplateDto } from '../dto/domain/insight-template.dto';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { UpdateInsightTemplateTitleCommand } from '../dto/domain/update-insight-template-title.command';

@Injectable()
export class UpdateInsightTemplateTitleService {
  constructor(
    @InjectRepository(InsightTemplate)
    private readonly repository: Repository<InsightTemplate>,
    private readonly mapper: InsightTemplateMapper
  ) {}

  async run(command: UpdateInsightTemplateTitleCommand): Promise<InsightTemplateDto> {
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

    insightTemplate.title = command.title;

    const saved = await this.repository.save(insightTemplate);
    return this.mapper.toDomainDto(saved);
  }
}
