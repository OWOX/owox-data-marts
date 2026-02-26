import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightArtifact } from '../entities/insight-artifact.entity';

@Injectable()
export class InsightArtifactRepository {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly repository: Repository<InsightArtifact>
  ) {}

  async listByDataMartIdAndProjectIdExcludingArtifactIds(params: {
    dataMartId: string;
    projectId: string;
    excludedArtifactIds?: string[];
  }): Promise<InsightArtifact[]> {
    const excludedArtifactIds = [...new Set(params.excludedArtifactIds ?? [])].filter(Boolean);

    const query = this.repository
      .createQueryBuilder('artifact')
      .innerJoin('artifact.dataMart', 'dataMart')
      .where('dataMart.id = :dataMartId', { dataMartId: params.dataMartId })
      .andWhere('dataMart.projectId = :projectId', { projectId: params.projectId })
      .orderBy('artifact.createdAt', 'DESC');

    if (excludedArtifactIds.length > 0) {
      query.andWhere('artifact.id NOT IN (:...excludedArtifactIds)', {
        excludedArtifactIds,
      });
    }

    return query.getMany();
  }
}
