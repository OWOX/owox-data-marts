import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { QueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataQualityStorageSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { CreateViewService } from '../use-cases/create-view.service';

type DataQualitySnapshotReferenceIdentity =
  | { type: 'SOURCE'; dataMartId: string }
  | { type: 'RELATIONSHIP_TARGET'; relationshipId: string; targetDataMartId: string };

export interface DataQualitySnapshotTableReferenceInput {
  runId: string;
  projectId: string;
  identity: DataQualitySnapshotReferenceIdentity;
  definition: DataMartDefinition | null;
  storage: DataQualityStorageSnapshot;
  liveStorage: DataQualityStorageSnapshot | null | undefined;
}

interface DataQualitySnapshotTableReference {
  query: string | QueryBuildResult;
  technicalViewReference: string | null;
}

export class DataQualitySnapshotStorageMismatchError extends Error {
  constructor() {
    super('Data Storage changed after the run was queued');
    this.name = 'DataQualitySnapshotStorageMismatchError';
  }
}

@Injectable()
export class DataQualitySnapshotTableReferenceService {
  constructor(
    private readonly createViewService: CreateViewService,
    private readonly queryBuilder: DataMartQueryBuilderFacade,
    private readonly identifierEscaper: IdentifierEscaperFacade
  ) {}

  async resolve(
    input: DataQualitySnapshotTableReferenceInput
  ): Promise<DataQualitySnapshotTableReference> {
    this.validateStorage(input.storage, input.liveStorage);
    if (!input.definition) {
      throw new Error('Data Mart definition snapshot is unavailable');
    }
    if (!isSqlDefinition(input.definition)) {
      return {
        query: await this.queryBuilder.buildQuery(input.storage.type, input.definition),
        technicalViewReference: null,
      };
    }

    const result = await this.createViewService.runFromSnapshot({
      projectId: input.projectId,
      storageId: input.storage.id,
      storageType: input.storage.type,
      viewName: createTechnicalViewName(input.runId, input.identity),
      sql: input.definition.sqlQuery,
    });
    const escapedReference = await this.identifierEscaper.escapeIdentifier(
      input.storage.type,
      result.fullyQualifiedName
    );
    return {
      query: `SELECT * FROM ${escapedReference}`,
      technicalViewReference: result.fullyQualifiedName,
    };
  }

  private validateStorage(
    snapshot: DataQualityStorageSnapshot,
    live: DataQualityStorageSnapshot | null | undefined
  ): void {
    if (!live || live.id !== snapshot.id || live.type !== snapshot.type) {
      throw new DataQualitySnapshotStorageMismatchError();
    }
  }
}

function createTechnicalViewName(
  runId: string,
  identity: DataQualitySnapshotReferenceIdentity
): string {
  const runToken = runId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const identityHash = createHash('sha256')
    .update(`${runId}:${JSON.stringify(identity)}`)
    .digest('hex')
    .slice(0, 16);
  return `dq_${runToken || 'run'}_${identityHash}`;
}
