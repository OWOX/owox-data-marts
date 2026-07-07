import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';

export interface DataMartRelationshipGraphEdgeRow {
  id: string;
  sourceDataMartId: string;
  targetDataMartId: string;
  joinConditions: unknown;
}

@Injectable()
export class DataMartRelationshipRepository {
  constructor(
    @InjectRepository(DataMartRelationship)
    private readonly repository: Repository<DataMartRelationship>
  ) {}

  async listGraphEdgeRowsByProjectIdAndSourceDataMartIds(
    projectId: string,
    sourceDataMartIds: string[]
  ): Promise<DataMartRelationshipGraphEdgeRow[]> {
    if (sourceDataMartIds.length === 0) return [];

    return this.repository
      .createQueryBuilder('relationship')
      .select('relationship.id', 'id')
      .addSelect('source.id', 'sourceDataMartId')
      .addSelect('target.id', 'targetDataMartId')
      .addSelect('relationship.joinConditions', 'joinConditions')
      .innerJoin('relationship.sourceDataMart', 'source')
      .innerJoin('relationship.targetDataMart', 'target')
      .where('relationship.projectId = :projectId', { projectId })
      .andWhere('source.id IN (:...sourceDataMartIds)', { sourceDataMartIds })
      .orderBy('relationship.createdAt', 'ASC')
      .getRawMany<DataMartRelationshipGraphEdgeRow>();
  }
}
