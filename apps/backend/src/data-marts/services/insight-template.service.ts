import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightTemplate } from '../entities/insight-template.entity';
import { RoleScope } from '../enums/role-scope.enum';
import { applyDataMartVisibilityFilter } from '../utils/apply-data-mart-visibility-filter';
import { DEFAULT_INSIGHT_TITLE } from '../use-cases/utils/generate-ai-assistant-session-title-from-message.util';

export interface ListVisibleProjectInsightTemplatesOptions {
  projectId: string;
  userId: string;
  roles: string[];
  roleScope: RoleScope;
  limit?: number;
  offset?: number;
}

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

  async listVisibleByProject(
    options: ListVisibleProjectInsightTemplatesOptions
  ): Promise<InsightTemplate[]> {
    const qb = this.repository
      .createQueryBuilder('insightTemplate')
      .innerJoinAndSelect('insightTemplate.dataMart', 'dataMart')
      .leftJoinAndSelect('insightTemplate.sourceEntities', 'sourceEntities')
      .where('dataMart.projectId = :projectId', { projectId: options.projectId })
      .andWhere('dataMart.deletedAt IS NULL')
      .orderBy('insightTemplate.modifiedAt', 'DESC')
      .addOrderBy('insightTemplate.id', 'DESC')
      .take(options.limit ?? 100)
      .skip(options.offset ?? 0);

    applyDataMartVisibilityFilter(qb, {
      dataMartAlias: 'dataMart',
      projectId: options.projectId,
      userId: options.userId,
      roles: options.roles,
      roleScope: options.roleScope,
    });

    return qb.getMany();
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
