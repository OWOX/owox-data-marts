import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateViewExecutorFacade } from '../data-storage-types/facades/create-view-executor.facade';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataStorage } from '../entities/data-storage.entity';
import {
  MAX_DATA_MART_REFERENCE_DEPTH,
  MAX_RESOLVED_SQL_LENGTH,
  maskDataMartReferences,
  parseDataMartReferences,
  replaceDataMartReferences,
  sqlLexingOptionsFor,
  type DataMartSqlReference,
} from '../sql-references/data-mart-sql-reference';
import {
  DataMartSqlReferenceErrorCode,
  DataMartSqlReferenceException,
} from '../sql-references/data-mart-sql-reference.errors';
import {
  containsWithKeyword,
  hasAliasAt,
  isRecursiveQuery,
  renderDerivedTable,
  toSingleStatement,
  topLevelCteBodies,
} from '../sql-references/sql-reference-inlining';
import { technicalViewNameFor } from '../utils/technical-view-name';
import { DataMartDefinitionResolver } from '../data-storage-types/interfaces/data-mart-definition-resolver.interface';

/** The Data Mart whose SQL is being resolved: references are looked up in its project and storage. */
export interface DataMartSqlReferenceScope {
  projectId: string;
  storage: DataStorage;
  /** The Data Mart that owns the SQL, so a reference back to it is reported as a cycle. */
  dataMartId?: string;
}

type ResolvableDataMart = Pick<DataMart, 'id' | 'storage' | 'definition'> &
  Partial<Pick<DataMart, 'projectId' | 'title'>>;

/**
 * How long a technical view refreshed for a reference stays trusted for the same SQL. Resolving
 * runs on every report run, preview, schema actualization and SQL editor dry run; without this,
 * each of them would send the warehouse a CREATE OR REPLACE VIEW for an unchanged query.
 */
const TECHNICAL_VIEW_FRESH_MS = 5 * 60 * 1000;

interface RefreshedTechnicalView {
  /** What the view was created from: the storage config and the referenced SQL. */
  fingerprint: string;
  name: Promise<string>;
  expiresAt: number;
}

/**
 * Turns Data Mart references (`[Title](dm:<id>)`) in a SQL Data Mart's query into SQL the
 * warehouse can run. A referenced SQL Data Mart becomes a derived table holding its own resolved
 * SQL; any other Data Mart becomes `(SELECT * FROM <its table>)`. So the resolved query reads
 * warehouse tables all the way down and every number in it can be traced.
 *
 * Two cases cannot be inlined and use the referenced Data Mart's technical view instead:
 * - SQL that starts with `WITH RECURSIVE`, which some warehouses refuse inside a subquery;
 * - on Redshift, SQL containing WITH that would land inside a CTE of the referencing query,
 *   which Redshift refuses ("You can't specify another WITH clause inside a WITH clause subquery").
 *
 * Access is not checked here. Resolving runs for whoever reads the referencing Data Mart, and
 * that reader does not need access to the referenced one — the check happens once, when the
 * reference is saved (see `DataMartSqlReferenceValidator`).
 */
@Injectable()
export class DataMartSqlReferenceResolver implements DataMartDefinitionResolver {
  /** Technical views refreshed recently, by storage and referenced Data Mart. */
  private readonly refreshedViews = new Map<string, RefreshedTechnicalView>();

  // The repository, not DataMartService: DataMartService depends on the schema provider facade,
  // which depends on this resolver.
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly createViewExecutorFacade: CreateViewExecutorFacade,
    private readonly credentialsResolver: DataStorageCredentialsResolver
  ) {}

  /** Whether the Data Mart is defined by SQL that references other Data Marts. */
  hasReferences(dataMart: Pick<DataMart, 'storage' | 'definition'>): boolean {
    const definition = dataMart.definition;
    if (!definition || !isSqlDefinition(definition)) return false;
    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) return false;
    return (
      parseDataMartReferences(definition.sqlQuery, sqlLexingOptionsFor(dataMart.storage.type))
        .length > 0
    );
  }

  /** `sql` with every reference resolved. SQL without references comes back unchanged. */
  async expandSql(sql: string, scope: DataMartSqlReferenceScope): Promise<string> {
    return this.expand(sql, scope, scope.dataMartId ? [scope.dataMartId] : [], new Map());
  }

  /**
   * The Data Mart's definition with its references resolved. Returns the very same object when
   * there is nothing to resolve, so callers can compare by identity.
   */
  async resolveDefinition(dataMart: ResolvableDataMart): Promise<DataMartDefinition | undefined> {
    const definition = dataMart.definition;
    if (!definition || !isSqlDefinition(definition) || !this.hasReferences(dataMart)) {
      return definition;
    }
    const sqlQuery = await this.expandSql(definition.sqlQuery, this.scopeOf(dataMart));
    return { ...definition, sqlQuery };
  }

  /**
   * A copy of the Data Mart whose definition has its references resolved, or the Data Mart itself
   * when there is nothing to resolve. The copy keeps the entity's prototype, so its accessors work.
   */
  async withResolvedDefinition<T extends ResolvableDataMart>(dataMart: T): Promise<T> {
    const definition = await this.resolveDefinition(dataMart);
    if (definition === dataMart.definition) return dataMart;
    return cloneWith(dataMart, { definition } as Partial<T>);
  }

  /** Same as {@link withResolvedDefinition}, for an object that carries its Data Mart (a report). */
  async withResolvedDataMart<T extends { dataMart: DataMart }>(holder: T): Promise<T> {
    const dataMart = await this.withResolvedDefinition(holder.dataMart);
    if (dataMart === holder.dataMart) return holder;
    return cloneWith(holder, { dataMart } as Partial<T>);
  }

  /**
   * The Data Mart as a derived table to read from in place of its technical view, or null when it
   * should keep the view: it has no references (nothing to show beyond the view), or its SQL
   * cannot sit in a subquery here.
   *
   * Redshift always keeps the view: there the relation lands inside generated CTEs, and a derived
   * table also needs an alias there that the callers do not add.
   */
  async inlineSource(dataMart: ResolvableDataMart): Promise<string | null> {
    if (!this.hasReferences(dataMart)) return null;
    if (dataMart.storage.type === DataStorageType.AWS_REDSHIFT) return null;
    const definition = await this.resolveDefinition(dataMart);
    if (!definition || !isSqlDefinition(definition)) return null;
    const options = sqlLexingOptionsFor(dataMart.storage.type);
    const body = toSingleStatement(definition.sqlQuery, options);
    if (!body || isRecursiveQuery(body, options)) return null;
    return renderDerivedTable(body, labelOf(dataMart));
  }

  /**
   * Data Marts referenced from a SQL query, with what resolving a reference reads: title, status,
   * definition and storage. Deleted Data Marts are not returned.
   */
  async findReferencedDataMarts(ids: readonly string[], projectId: string): Promise<DataMart[]> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return [];
    return this.dataMartRepository.find({
      where: { id: In(uniqueIds), projectId },
      relations: ['storage'],
    });
  }

  /**
   * SQL Data Marts whose query references `target`: same project and Storage (a reference cannot
   * cross them), not deleted. The database narrows the candidates by text; the parser confirms
   * each one, so a mention inside a comment or a string literal does not count.
   */
  async findReferencingDataMarts(
    target: Pick<DataMart, 'id' | 'projectId' | 'storage'>
  ): Promise<DataMart[]> {
    const candidates = await this.dataMartRepository
      .createQueryBuilder('dm')
      .where('dm.projectId = :projectId', { projectId: target.projectId })
      .andWhere('dm.storage = :storageId', { storageId: target.storage.id })
      .andWhere('dm.definitionType = :definitionType', {
        definitionType: DataMartDefinitionType.SQL,
      })
      .andWhere('dm.id != :id', { id: target.id })
      .andWhere(`JSON_EXTRACT(dm.definition, '$.sqlQuery') LIKE :marker`, {
        marker: `%(dm:${target.id})%`,
      })
      .orderBy('dm.title', 'ASC')
      .getMany();

    const options = sqlLexingOptionsFor(target.storage.type);
    return candidates.filter(
      candidate =>
        candidate.definition &&
        isSqlDefinition(candidate.definition) &&
        parseDataMartReferences(candidate.definition.sqlQuery, options).some(
          reference => reference.id === target.id
        )
    );
  }

  private scopeOf(dataMart: ResolvableDataMart): DataMartSqlReferenceScope {
    return {
      projectId: dataMart.projectId ?? dataMart.storage.projectId,
      storage: dataMart.storage,
      dataMartId: dataMart.id,
    };
  }

  /**
   * `sql` with its references resolved. `path` holds the Data Marts being expanded, outermost
   * first; `memo` holds each SQL Data Mart's expansion, shared by every reference to it.
   *
   * References are expanded one at a time, depth first. So a memo entry is either finished or
   * belongs to a Data Mart on `path`, which is reported as a cycle before the memo is read. Expanded
   * side by side, two branches could each wait for the other's entry: A → {B, C}, B → C, C → B.
   */
  private async expand(
    sql: string,
    scope: DataMartSqlReferenceScope,
    path: readonly string[],
    memo: Map<string, Promise<string>>,
    owner?: Pick<DataMart, 'title'>
  ): Promise<string> {
    const options = sqlLexingOptionsFor(scope.storage.type);
    const references = parseDataMartReferences(sql, options);
    if (references.length === 0) return sql;

    if (path.length > MAX_DATA_MART_REFERENCE_DEPTH) {
      throw new DataMartSqlReferenceException(
        DataMartSqlReferenceErrorCode.TOO_DEEP,
        `Data Mart references are nested more than ${MAX_DATA_MART_REFERENCE_DEPTH} levels deep.`,
        { maxDepth: MAX_DATA_MART_REFERENCE_DEPTH }
      );
    }

    const targets = await this.loadTargets(references, scope);

    // Decided up front from the original text, so the inserted SQL cannot shift them.
    const masked = maskDataMartReferences(sql, references);
    const cteBodies =
      scope.storage.type === DataStorageType.AWS_REDSHIFT ? topLevelCteBodies(masked, options) : [];
    const aliasesUsed = new Map<string, number>();
    const placements = references.map(reference => ({
      insideCte: cteBodies.some(([from, to]) => reference.start >= from && reference.start < to),
      alias: hasAliasAt(masked, reference.end, options)
        ? null
        : nextAlias(reference.id, aliasesUsed),
    }));

    let length = sql.length;
    return replaceDataMartReferences(sql, references, async (reference, index) => {
      const target = targets.get(reference.id)!;
      if (path.includes(target.id)) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.CYCLE,
          `Data Mart "${target.title}" references itself through its SQL.`,
          { dataMartId: target.id }
        );
      }
      const { insideCte, alias } = placements[index];
      const source = await this.sourceFor(target, scope, [...path, target.id], memo, insideCte);
      const rendered = alias ? `${source} AS ${alias}` : source;
      // Checked as each reference is written in, so an oversized query is never built.
      length += rendered.length;
      if (length > MAX_RESOLVED_SQL_LENGTH) throw tooLong(owner);
      return rendered;
    });
  }

  private async sourceFor(
    target: DataMart,
    scope: DataMartSqlReferenceScope,
    path: readonly string[],
    memo: Map<string, Promise<string>>,
    insideCte: boolean
  ): Promise<string> {
    const definition = target.definition;
    if (!definition) {
      throw new DataMartSqlReferenceException(
        DataMartSqlReferenceErrorCode.NO_DEFINITION,
        `Data Mart "${target.title}" has no input source yet, so it cannot be referenced.`,
        { dataMartId: target.id }
      );
    }

    if (!isSqlDefinition(definition)) {
      const built = await this.queryBuilderFacade.buildQuery(scope.storage.type, definition);
      return renderDerivedTable(typeof built === 'string' ? built : built.sql, labelOf(target));
    }

    let pending = memo.get(target.id);
    if (!pending) {
      pending = this.expand(definition.sqlQuery, scope, path, memo, target);
      memo.set(target.id, pending);
    }
    const options = sqlLexingOptionsFor(scope.storage.type);
    const body = toSingleStatement(await pending, options);
    if (body === null) {
      throw new DataMartSqlReferenceException(
        DataMartSqlReferenceErrorCode.MULTI_STATEMENT,
        `Data Mart "${target.title}" runs several SQL statements, so it cannot be referenced. ` +
          'Only a Data Mart defined by a single query can be referenced.',
        { dataMartId: target.id }
      );
    }

    const needsView =
      isRecursiveQuery(body, options) ||
      (scope.storage.type === DataStorageType.AWS_REDSHIFT &&
        insideCte &&
        containsWithKeyword(body, options));
    if (needsView) {
      return this.technicalView(target, body, scope.storage);
    }
    return renderDerivedTable(body, labelOf(target));
  }

  /**
   * The referenced Data Mart's technical view, refreshed with `sql`. A view refreshed from the same
   * SQL within the last few minutes is reused, so two references to one Data Mart, or the SQL
   * editor's dry runs while typing, do not each run DDL. A failed refresh is not remembered.
   */
  private technicalView(target: DataMart, sql: string, storage: DataStorage): Promise<string> {
    const key = `${storage.id}␟${target.id}`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(storage.config ?? null))
      .update('\0')
      .update(sql)
      .digest('hex');
    const now = Date.now();
    const refreshed = this.refreshedViews.get(key);
    if (refreshed && refreshed.fingerprint === fingerprint && refreshed.expiresAt > now) {
      return refreshed.name;
    }

    for (const [staleKey, entry] of this.refreshedViews) {
      if (entry.expiresAt <= now) this.refreshedViews.delete(staleKey);
    }
    const entry: RefreshedTechnicalView = {
      fingerprint,
      name: this.refreshTechnicalView(target, sql, storage),
      expiresAt: now + TECHNICAL_VIEW_FRESH_MS,
    };
    this.refreshedViews.set(key, entry);
    entry.name.catch(() => {
      if (this.refreshedViews.get(key) === entry) this.refreshedViews.delete(key);
    });
    return entry.name;
  }

  private async refreshTechnicalView(
    target: DataMart,
    sql: string,
    storage: DataStorage
  ): Promise<string> {
    if (!storage.config) {
      throw new Error('Storage setup is not finished.');
    }
    const credentials = await this.credentialsResolver.resolve(storage);
    const { fullyQualifiedName } = await this.createViewExecutorFacade.createView(
      storage.type,
      credentials,
      storage.config,
      technicalViewNameFor(target.id),
      sql
    );
    return fullyQualifiedName;
  }

  private async loadTargets(
    references: readonly DataMartSqlReference[],
    scope: DataMartSqlReferenceScope
  ): Promise<Map<string, DataMart>> {
    const found = await this.findReferencedDataMarts(
      references.map(reference => reference.id),
      scope.projectId
    );
    const byId = new Map(found.map(dataMart => [dataMart.id, dataMart]));

    for (const reference of references) {
      const target = byId.get(reference.id);
      if (!target) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.NOT_FOUND,
          `Referenced Data Mart "${reference.title}" was not found. It may have been deleted.`,
          { dataMartId: reference.id }
        );
      }
      if (target.storage.id !== scope.storage.id) {
        throw new DataMartSqlReferenceException(
          DataMartSqlReferenceErrorCode.OTHER_STORAGE,
          `Data Mart "${target.title}" is in another Storage. ` +
            'Only Data Marts from the same Storage can be referenced.',
          { dataMartId: target.id }
        );
      }
    }
    return byId;
  }
}

function tooLong(owner?: Pick<DataMart, 'title'>): DataMartSqlReferenceException {
  const limit = MAX_RESOLVED_SQL_LENGTH.toLocaleString('en-US');
  const subject = owner?.title ? `The SQL of Data Mart "${owner.title}"` : 'This SQL';
  return new DataMartSqlReferenceException(
    DataMartSqlReferenceErrorCode.TOO_LONG,
    `${subject} becomes longer than ${limit} characters once the Data Marts it references are ` +
      'written into it. Reference fewer Data Marts, or reference them fewer times.',
    { maxLength: MAX_RESOLVED_SQL_LENGTH }
  );
}

function labelOf(dataMart: Partial<Pick<DataMart, 'title'>> & Pick<DataMart, 'id'>): string {
  return dataMart.title ? `${dataMart.title} (${dataMart.id})` : dataMart.id;
}

function nextAlias(dataMartId: string, used: Map<string, number>): string {
  const base = `dm_${dataMartId.replace(/-/g, '').slice(0, 8)}`;
  const count = (used.get(base) ?? 0) + 1;
  used.set(base, count);
  return count === 1 ? base : `${base}_${count}`;
}

function cloneWith<T extends object>(source: T, overrides: Partial<T>): T {
  return Object.assign(
    Object.create(Object.getPrototypeOf(source) as object) as T,
    source,
    overrides
  );
}
