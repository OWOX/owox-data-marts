import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightTemplate } from '../entities/insight-template.entity';
import { DEFAULT_INSIGHT_TITLE } from '../use-cases/utils/generate-ai-assistant-session-title-from-message.util';

@Injectable()
export class InsightTemplateService {
  constructor(
    @InjectRepository(InsightTemplate)
    private readonly repository: Repository<InsightTemplate>
  ) {}

  async getByIdAndDataMartIdWithSourceEntities(
    id: string,
    dataMartId: string
  ): Promise<InsightTemplate> {
    const insightTemplate = await this.repository.findOne({
      where: {
        id,
        dataMart: {
          id: dataMartId,
        },
      },
      relations: ['sourceEntities'],
    });

    if (!insightTemplate) {
      throw new NotFoundException(`InsightTemplate with id ${id} not found`);
    }

    return insightTemplate;
  }

  async getByIdAndDataMartIdAndProjectId(
    id: string,
    dataMartId: string,
    projectId: string
  ): Promise<InsightTemplate> {
    const insightTemplate = await this.repository.findOne({
      where: {
        id,
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart'],
    });

    if (!insightTemplate) {
      throw new NotFoundException(`InsightTemplate with id ${id} not found`);
    }

    return insightTemplate;
  }

  async listByDataMartIdAndProjectId(
    dataMartId: string,
    projectId: string
  ): Promise<InsightTemplate[]> {
    return this.repository.find({
      where: {
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateTitleOnlyIfHasDefaultTitle(
    id: string,
    dataMartId: string,
    projectId: string,
    title: string
  ): Promise<InsightTemplate> {
    const insightTemplate = await this.getByIdAndDataMartIdAndProjectId(id, dataMartId, projectId);
    if (insightTemplate.title === DEFAULT_INSIGHT_TITLE || !insightTemplate.title) {
      insightTemplate.title = title;
      return this.repository.save(insightTemplate);
    }

    return insightTemplate;
  }

  async softDelete(insightTemplateId: string): Promise<void> {
    await this.repository.softDelete(insightTemplateId);
  }
}
