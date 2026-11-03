import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import {
  MAX_DATA_MART_REFERENCE_DEPTH,
  parseDataMartReferences,
  replaceDataMartReferences,
  serializeDataMartReference,
  sqlLexingOptionsFor,
} from '../sql-references/data-mart-sql-reference';
import {
  DataMartSqlReferenceErrorCode,
  DataMartSqlReferenceException,
} from '../sql-references/data-mart-sql-reference.errors';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import { DataMartSqlReferenceResolver } from './data-mart-sql-reference-resolver.service';

export interface PrepareSqlReferencesForSaveInput {
  /** The Data Mart whose SQL is being saved. */
  dataMart: Pick<DataMart, 'id' | 'projectId' | 'storage'>;
  sqlQuery: string;
  /** Who saves. Without one (system calls) access is not checked. */
  userId?: string;
  roles?: string[];
}

/**
 * Checks the Data Mart references in a SQL query before it is saved.
 *
 * Every reference must point at a published Data Mart of the same project and Storage, other than
 * the one being saved, that the saving user can use in reports, and must not lead back to it.
 *
 * Every save checks every reference, the ones an earlier version already had included: the query
 * reads the referenced Data Mart for everyone who reads this one, so whoever saves it vouches for
 * that access. A co-editor without access to a referenced Data Mart cannot save the query, and the
 * error names the Data Mart to ask access for. Access is checked only on save: a Data Mart that
 * stops being shared keeps feeding the Data Marts already saved with a reference to it.
 */
@Injectable()
export class DataMartSqlReferenceValidator {
  constructor(
    private readonly sqlReferenceResolver: DataMartSqlReferenceResolver,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  /** Returns the query with every reference's title refreshed from the referenced Data Mart. */
  async prepareForSave(input: PrepareSqlReferencesForSaveInput): Promise<string> {
    const { dataMart, sqlQuery } = input;
    const options = sqlLexingOptionsFor(dataMart.storage.type);
    const references = parseDataMartReferences(sqlQuery, options);
    if (references.length === 0) return sqlQuery;

    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      throw new DataMartSqlReferenceException(
        DataMartSqlReferenceErrorCode.LEGACY_STORAGE,
        'Data Mart references are not supported for Legacy Google BigQuery storages.'
      );
    }

    const targets = new Map(
      (
        await this.sqlReferenceResolver.findReferencedDataMarts(
          references.map(reference => reference.id),
          dataMart.projectId
        )
      ).map(target => [target.id, target])
    );

    const checked = new Set<string>();

    for (const reference of references) {
      if (reference.id === dataMart.id) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.SELF,
          'A Data Mart cannot reference itself.',
          { dataMartId: reference.id }
        );
      }
      const target = targets.get(reference.id);
      if (!target) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.NOT_FOUND,
          `Referenced Data Mart "${reference.title}" was not found. It may have been deleted.`,
          { dataMartId: reference.id }
        );
      }
      if (target.storage.id !== dataMart.storage.id) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.OTHER_STORAGE,
          `Data Mart "${target.title}" is in another Storage. ` +
            'Only Data Marts from the same Storage can be referenced.',
          { dataMartId: target.id }
        );
      }
      if (checked.has(target.id)) continue;
      checked.add(target.id);

      if (target.status !== DataMartStatus.PUBLISHED) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.NOT_PUBLISHED,
          `Data Mart "${target.title}" is not published yet, so it cannot be referenced.`,
          { dataMartId: target.id }
        );
      }
      if (input.userId && !(await this.canUse(input.userId, input.roles ?? [], target))) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.ACCESS_DENIED,
          `You do not have access to Data Mart "${target.title}", so you cannot save SQL that ` +
            'references it. Ask its owner to share it with you.',
          { dataMartId: target.id }
        );
      }
    }

    await this.assertNoCycle(dataMart, [...targets.values()]);

    return replaceDataMartReferences(sqlQuery, references, reference =>
      serializeDataMartReference({ id: reference.id, title: targets.get(reference.id)!.title })
    );
  }

  private canUse(userId: string, roles: string[], target: DataMart): Promise<boolean> {
    return this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      target.id,
      Action.USE,
      target.projectId
    );
  }

  /**
   * Walks the references level by level: from what the new query references, through what those
   * Data Marts' own queries reference, and so on. Reaching the saved Data Mart again is a cycle.
   */
  private async assertNoCycle(
    dataMart: Pick<DataMart, 'id' | 'projectId' | 'storage'>,
    firstLevel: DataMart[]
  ): Promise<void> {
    const options = sqlLexingOptionsFor(dataMart.storage.type);
    const visited = new Set<string>();
    let level = firstLevel;

    for (let depth = 1; level.length > 0; depth++) {
      if (depth > MAX_DATA_MART_REFERENCE_DEPTH) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.TOO_DEEP,
          `Data Mart references are nested more than ${MAX_DATA_MART_REFERENCE_DEPTH} levels deep.`,
          { maxDepth: MAX_DATA_MART_REFERENCE_DEPTH }
        );
      }

      const nextIds = new Set<string>();
      for (const current of level) {
        if (visited.has(current.id)) continue;
        visited.add(current.id);
        const definition = current.definition;
        if (!definition || !isSqlDefinition(definition)) continue;
        for (const reference of parseDataMartReferences(definition.sqlQuery, options)) {
          if (reference.id === dataMart.id) {
            throw new DataMartSqlReferenceException(
              DataMartSqlReferenceErrorCode.CYCLE,
              `Data Mart "${current.title}" already references this Data Mart, ` +
                'so referencing it back would create a loop.',
              { dataMartId: current.id }
            );
          }
          if (!visited.has(reference.id)) nextIds.add(reference.id);
        }
      }

      level =
        nextIds.size > 0
          ? await this.sqlReferenceResolver.findReferencedDataMarts(
              [...nextIds],
              dataMart.projectId
            )
          : [];
    }
  }
}
