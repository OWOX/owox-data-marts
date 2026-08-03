import { Injectable } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { QueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataQualityStorageSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMartTableReferenceService } from '../services/data-mart-table-reference.service';

export interface DataQualitySnapshotTableReferenceInput {
  dataMartId: string;
  projectId: string;
  definition: DataMartDefinition | null;
  storage: DataQualityStorageSnapshot;
  liveStorage: DataQualityStorageSnapshot | null | undefined;
}

interface DataQualitySnapshotTableReference {
  buildQuery(columns: string[]): Promise<string | QueryBuildResult>;
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
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly queryBuilder: DataMartQueryBuilderFacade,
    private readonly identifierEscaper: IdentifierEscaperFacade
  ) {}

  async resolve(
    input: DataQualitySnapshotTableReferenceInput
  ): Promise<DataQualitySnapshotTableReference> {
    this.validateStorage(input.storage, input.liveStorage);
    const definition = input.definition;
    if (!definition) {
      throw new Error('Data Mart definition snapshot is unavailable');
    }
    const mainTableReference = isSqlDefinition(definition)
      ? await this.resolveSqlTableReference(input)
      : undefined;
    return {
      buildQuery: async columns =>
        mainTableReference
          ? `SELECT ${columns.length > 0 ? columns.join(', ') : '*'} FROM ${mainTableReference}`
          : this.queryBuilder.buildQuery(input.storage.type, definition, { columns }),
    };
  }

  private async resolveSqlTableReference(
    input: DataQualitySnapshotTableReferenceInput
  ): Promise<string> {
    const tableReference = await this.tableReferenceService.resolveTableName(
      input.dataMartId,
      input.projectId
    );
    return this.identifierEscaper.escapeIdentifier(input.storage.type, tableReference);
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
