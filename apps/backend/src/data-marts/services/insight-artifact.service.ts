import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';

@Injectable()
export class InsightArtifactService {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly repository: Repository<InsightArtifact>
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

  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete(id);
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
