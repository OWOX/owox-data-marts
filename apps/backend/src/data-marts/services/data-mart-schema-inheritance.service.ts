import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMart } from '../entities/data-mart.entity';
import {
  MAX_DATA_MART_REFERENCE_DEPTH,
  parseDataMartReferences,
  sqlLexingOptionsFor,
} from '../sql-references/data-mart-sql-reference';
import { DataMartSqlReferenceResolver } from './data-mart-sql-reference-resolver.service';

export interface InheritedFrom {
  dataMartId: string;
  dataMartTitle: string;
}

/** A Data Mart whose stored schema propagation changed. */
export interface UpdatedDataMart {
  id: string;
  projectId: string;
}

interface SchemaFieldLike {
  name: string;
  alias?: string;
  description?: string;
  status?: DataMartSchemaFieldStatus;
  calculated?: unknown;
  inheritedFrom?: InheritedFrom;
  fields?: SchemaFieldLike[];
}

interface SourceField {
  alias?: string;
  description?: string;
  from: InheritedFrom;
  nested: SourceIndex;
}

const AMBIGUOUS = 'ambiguous' as const;
type SourceIndex = Map<string, SourceField | typeof AMBIGUOUS>;

type InheritingDataMart = Pick<DataMart, 'id' | 'projectId' | 'storage' | 'definition'>;

/**
 * Keeps the alias and description of a SQL Data Mart's pass-through fields in step with the Data
 * Marts its query references (`[Title](dm:<id>)`).
 *
 * A field of the referencing Data Mart that has the same name as a field of a referenced one is
 * the same field: it takes that field's alias and description, read-only, and is marked with
 * `inheritedFrom`. A column that means something else needs another name. When the name matches
 * fields of several referenced Data Marts, the source is ambiguous and nothing is inherited.
 * Primary keys and calculated fields are never inherited.
 *
 * Applied when the referencing Data Mart's schema is actualized or saved (a save cannot change
 * inherited values), and pushed to the referencing Data Marts when a referenced one's schema or
 * title is saved.
 */
@Injectable()
export class DataMartSchemaInheritanceService {
  private readonly logger = new Logger(DataMartSchemaInheritanceService.name);

  // The repository, not DataMartService: DataMartService applies inheritance during actualization.
  constructor(
    private readonly sqlReferenceResolver: DataMartSqlReferenceResolver,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>
  ) {}

  /** `schema` with inherited metadata applied, and whether that changed anything. */
  async applyInheritance(
    dataMart: InheritingDataMart,
    schema: DataMartSchema | undefined
  ): Promise<{ schema: DataMartSchema | undefined; changed: boolean }> {
    if (!schema) return { schema, changed: false };
    return applyIndex(schema, buildSourceIndex(await this.loadSources(dataMart)));
  }

  /**
   * Re-applies inheritance on every SQL Data Mart that references `source`, and on through the
   * ones that changed. Called after a referenced Data Mart's schema or title is saved, and after
   * it is deleted, when its fields stop being inherited. Best-effort: a failure is logged and
   * never fails the operation that triggered it.
   *
   * Returns the Data Marts whose stored schema changed. Their schema was written directly, so a
   * caller that changed aliases or descriptions refreshes what depends on them (cached report
   * data, the search index), as a save of their own would.
   */
  async propagateFrom(
    source: Pick<DataMart, 'id' | 'projectId' | 'storage'>
  ): Promise<UpdatedDataMart[]> {
    const updated: UpdatedDataMart[] = [];
    try {
      await this.propagate(source, new Set(), updated);
    } catch (error) {
      this.logger.warn(
        `Could not update the Data Marts that reference ${source.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    return updated;
  }

  private async propagate(
    source: Pick<DataMart, 'id' | 'projectId' | 'storage'>,
    visited: Set<string>,
    updated: UpdatedDataMart[]
  ): Promise<void> {
    if (visited.has(source.id) || visited.size > MAX_DATA_MART_REFERENCE_DEPTH * 10) return;
    visited.add(source.id);

    for (const dependent of await this.sqlReferenceResolver.findReferencingDataMarts(source)) {
      // Referencing Data Marts share the source's Storage; the lookup does not load the relation.
      const inheriting = { ...dependent, storage: source.storage } as InheritingDataMart;
      const index = buildSourceIndex(await this.loadSources(inheriting));
      // The schema as saved now, not as the lookup above loaded it: the Data Marts ahead of this one
      // were updated and walked first, and a save of this one's own fields in the meantime must
      // not be written back out of existence.
      const persisted = await this.dataMartRepository.findOne({
        where: { id: dependent.id },
        select: { id: true, schema: true },
      });
      if (!persisted?.schema) continue;
      const { schema, changed } = applyIndex(persisted.schema, index);
      if (!changed) continue;
      // The repository, not DataMartService.save: DataMartService applies inheritance itself.
      await this.dataMartRepository.update(dependent.id, {
        schema,
      } as QueryDeepPartialEntity<DataMart>);
      updated.push({ id: dependent.id, projectId: dependent.projectId });
      await this.propagate(inheriting, visited, updated);
    }
  }

  private async loadSources(dataMart: InheritingDataMart): Promise<DataMart[]> {
    const definition = dataMart.definition;
    if (!definition || !isSqlDefinition(definition)) return [];
    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) return [];

    const ids = parseDataMartReferences(
      definition.sqlQuery,
      sqlLexingOptionsFor(dataMart.storage.type)
    )
      .map(reference => reference.id)
      .filter(id => id !== dataMart.id);
    if (ids.length === 0) return [];

    const found = await this.sqlReferenceResolver.findReferencedDataMarts(ids, dataMart.projectId);
    return found.filter(source => source.storage?.id === dataMart.storage.id && source.schema);
  }
}

function applyIndex(
  schema: DataMartSchema,
  index: SourceIndex
): { schema: DataMartSchema; changed: boolean } {
  const fields = schema.fields as SchemaFieldLike[];
  const nextFields = applyToFields(fields, index);
  const changed = JSON.stringify(nextFields) !== JSON.stringify(fields);
  return {
    schema: changed ? ({ ...schema, fields: nextFields } as DataMartSchema) : schema,
    changed,
  };
}

function buildSourceIndex(sources: DataMart[]): SourceIndex {
  const index: SourceIndex = new Map();
  for (const source of sources) {
    const from = { dataMartId: source.id, dataMartTitle: source.title };
    for (const field of (source.schema?.fields ?? []) as SchemaFieldLike[]) {
      if (!isInheritable(field)) continue;
      index.set(field.name, index.has(field.name) ? AMBIGUOUS : sourceFieldOf(field, from));
    }
  }
  return index;
}

function sourceFieldOf(field: SchemaFieldLike, from: InheritedFrom): SourceField {
  const nested: SourceIndex = new Map();
  for (const child of field.fields ?? []) {
    if (isInheritable(child)) nested.set(child.name, sourceFieldOf(child, from));
  }
  return { alias: field.alias, description: field.description, from, nested };
}

/** A calculated field is not a column of the source, and a disconnected one no longer is. */
function isInheritable(field: SchemaFieldLike): boolean {
  return !field.calculated && field.status !== DataMartSchemaFieldStatus.DISCONNECTED;
}

// Fields are edited on a copy in place, so keys keep their order and an unchanged schema
// serializes identically — `applyInheritance` decides "changed" by comparing serializations.
function applyToFields(fields: SchemaFieldLike[], index: SourceIndex): SchemaFieldLike[] {
  return fields.map(field => {
    const next: SchemaFieldLike = { ...field };
    if (field.calculated) {
      // `inheritedFrom` is server-owned, and a calculated field never inherits.
      delete next.inheritedFrom;
      return next;
    }
    const source = index.get(field.name);

    if (source && source !== AMBIGUOUS) {
      if (source.alias !== undefined) next.alias = source.alias;
      else delete next.alias;
      if (source.description !== undefined) next.description = source.description;
      else delete next.description;
      next.inheritedFrom = source.from;
      if (field.fields) next.fields = applyToFields(field.fields, source.nested);
      return next;
    }

    // No longer inherited: the field keeps its last values as its own, now editable.
    delete next.inheritedFrom;
    if (field.fields) next.fields = applyToFields(field.fields, new Map());
    return next;
  });
}
