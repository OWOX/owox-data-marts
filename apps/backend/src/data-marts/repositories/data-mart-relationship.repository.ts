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

export interface DataMartRelationshipEndpointRow {
  sourceDataMartId: string;
  targetDataMartId: string;
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

    return this.buildGraphEdgeRowsQuery(projectId)
      .andWhere('source.id IN (:...sourceDataMartIds)', { sourceDataMartIds })
      .getRawMany<DataMartRelationshipGraphEdgeRow>();
  }

  /**
   * Both ends of every relationship that starts or ends at one of the given Data Marts.
   * Relationships whose other end is deleted are left out.
   */
  async listEndpointRowsByProjectIdAndDataMartIds(
    projectId: string,
    dataMartIds: string[]
  ): Promise<DataMartRelationshipEndpointRow[]> {
    if (dataMartIds.length === 0) return [];

    return this.repository
      .createQueryBuilder('relationship')
      .select('source.id', 'sourceDataMartId')
      .addSelect('target.id', 'targetDataMartId')
      .innerJoin('relationship.sourceDataMart', 'source')
      .innerJoin('relationship.targetDataMart', 'target')
      .where('relationship.projectId = :projectId', { projectId })
      .andWhere('source.deletedAt IS NULL')
      .andWhere('target.deletedAt IS NULL')
      .andWhere('(source.id IN (:...dataMartIds) OR target.id IN (:...dataMartIds))', {
        dataMartIds,
      })
      .getRawMany<DataMartRelationshipEndpointRow>();
  }

  async listGraphEdgeRowsByProjectIdAndStorageId(
    projectId: string,
    storageId: string
  ): Promise<DataMartRelationshipGraphEdgeRow[]> {
    return this.buildGraphEdgeRowsQuery(projectId)
      .andWhere('relationship.dataStorage = :storageId', { storageId })
      .getRawMany<DataMartRelationshipGraphEdgeRow>();
  }

  private buildGraphEdgeRowsQuery(projectId: string) {
    return this.repository
      .createQueryBuilder('relationship')
      .select('relationship.id', 'id')
      .addSelect('source.id', 'sourceDataMartId')
      .addSelect('target.id', 'targetDataMartId')
      .addSelect('relationship.joinConditions', 'joinConditions')
      .innerJoin('relationship.sourceDataMart', 'source')
      .innerJoin('relationship.targetDataMart', 'target')
      .where('relationship.projectId = :projectId', { projectId })
      .orderBy('relationship.createdAt', 'ASC');
  }
}
