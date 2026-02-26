import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightTemplateSourceEntity } from '../entities/insight-template-source.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { InsightArtifactRepository } from '../repositories/insight-artifact.repository';

@Injectable()
export class InsightArtifactService {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly repository: Repository<InsightArtifact>,
    @InjectRepository(InsightTemplateSourceEntity)
    private readonly insightTemplateSourceRepository: Repository<InsightTemplateSourceEntity>,
    private readonly insightArtifactRepository: InsightArtifactRepository
  ) {}

  async getByIdAndDataMartIdAndProjectId(
    id: string,
    dataMartId: string,
    projectId: string
  ): Promise<InsightArtifact> {
    const artifact = await this.repository.findOne({
      where: {
        id,
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart'],
    });

    if (!artifact) {
      throw new NotFoundException(`InsightArtifact with id ${id} not found`);
    }

    return artifact;
  }

  async getByIdAndDataMartIdAndProjectIdSafe(
    id: string,
    dataMartId: string,
    projectId: string
  ): Promise<InsightArtifact | null> {
    try {
      return await this.getByIdAndDataMartIdAndProjectId(id, dataMartId, projectId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }

      throw error;
    }
  }

  async listByDataMartIdAndProjectId(
    dataMartId: string,
    projectId: string
  ): Promise<InsightArtifact[]> {
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

  async listByIdsAndDataMartIdAndProjectId(params: {
    artifactIds: string[];
    dataMartId: string;
    projectId: string;
  }): Promise<InsightArtifact[]> {
    if (params.artifactIds.length === 0) {
      return [];
    }

    return this.repository.find({
      where: {
        id: In(params.artifactIds),
        dataMart: {
          id: params.dataMartId,
          projectId: params.projectId,
        },
      },
      relations: ['dataMart'],
    });
  }

  async listByDataMartIdAndProjectIdExcludingArtifactIds(params: {
    dataMartId: string;
    projectId: string;
    excludedArtifactIds?: string[];
  }): Promise<InsightArtifact[]> {
    return this.insightArtifactRepository.listByDataMartIdAndProjectIdExcludingArtifactIds(params);
  }

  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete(id);
  }

  async ensureNotUsedInTemplateSources(
    artifactId: string,
    dataMartId: string,
    projectId: string
  ): Promise<void> {
    const usage = await this.insightTemplateSourceRepository.findOne({
      where: {
        artifactId,
        insightTemplate: {
          dataMart: {
            id: dataMartId,
            projectId,
          },
        },
      },
      relations: ['insightTemplate', 'insightTemplate.dataMart'],
    });

    if (!usage) {
      return;
    }

    throw new BusinessViolationException(
      `InsightArtifact is used in template source "${usage.key}" and cannot be deleted`
    );
  }

  async markValidationStatus(
    id: string,
    validationStatus: InsightArtifactValidationStatus,
    validationError?: string | null
  ): Promise<void> {
    await this.repository.update(id, {
      validationStatus,
      validationError: validationError ?? null,
    });
  }
}
