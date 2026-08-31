import { Logger } from '@nestjs/common';
import type { CalculatedFieldConfig } from '../../calculated-fields/calculated-field.utils';
import { DataMartSchema } from '../data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchemaMerger } from './data-mart-schema-merger.interface';

interface MergeableField {
  name: string;
  type: unknown;
  alias?: string;
  description?: string;
  isPrimaryKey?: boolean;
  isHiddenForReporting?: boolean;
  aggregationRole?: string;
  allowedAggregations?: string[];
  status?: DataMartSchemaFieldStatus;
  calculated?: CalculatedFieldConfig;
}

interface MergeableSchema {
  fields: MergeableField[];
}

// BigQuery keeps its own merger — RECORD / STRUCT recursion does not fit this shape.
export abstract class FlatDataMartSchemaMerger implements DataMartSchemaMerger {
  protected readonly logger = new Logger(this.constructor.name);
  abstract readonly type: DataStorageType;
  protected abstract readonly storageName: string;
  protected abstract isSchemaValid(schema: DataMartSchema): boolean;

  mergeSchemas(
    existingSchema: DataMartSchema | undefined,
    newSchema: DataMartSchema
  ): DataMartSchema {
    this.logger.debug('Merging schemas', { existingSchema, newSchema });

    if (!this.isSchemaValid(newSchema)) {
      throw new Error(`New schema must be a ${this.storageName} schema`);
    }

    if (existingSchema && !this.isSchemaValid(existingSchema)) {
      throw new Error(`Existing schema must be a ${this.storageName} schema`);
    }

    if (!existingSchema) {
      return newSchema;
    }

    const existing = existingSchema as unknown as MergeableSchema;
    const incoming = newSchema as unknown as MergeableSchema;

    const mergedFields = mergeFlatSchemaFields(existing.fields, incoming.fields, this.logger);

    return {
      ...(existingSchema as DataMartSchema),
      fields: mergedFields,
    } as DataMartSchema;
  }
}

function mergeFlatSchemaFields(
  existing: MergeableField[],
  incoming: MergeableField[],
  logger: Logger
): MergeableField[] {
  const incomingByName = new Map(incoming.map(f => [f.name, f]));
  const existingByName = new Map(existing.map(f => [f.name, f]));

  const updated = existing.map(existingField => {
    // Actualisation reconciles the schema with the warehouse. A calculated field has no
    // warehouse counterpart, so comparing it against the incoming set would mark it
    // DISCONNECTED on every refresh.
    if (existingField.calculated) return existingField;

    const newField = incomingByName.get(existingField.name);
    if (!newField) {
      return { ...existingField, status: DataMartSchemaFieldStatus.DISCONNECTED };
    }

    const hasTypeMismatch = existingField.type !== newField.type;
    return {
      ...newField,
      alias: existingField.alias ?? newField.alias,
      description: existingField.description ?? newField.description,
      isPrimaryKey: existingField.isPrimaryKey ?? newField.isPrimaryKey ?? false,
      isHiddenForReporting: existingField.isHiddenForReporting ?? false,
      aggregationRole: existingField.aggregationRole ?? newField.aggregationRole,
      allowedAggregations: existingField.allowedAggregations ?? newField.allowedAggregations,
      status: hasTypeMismatch
        ? DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH
        : DataMartSchemaFieldStatus.CONNECTED,
    };
  });

  const added = incoming.filter(f => {
    const existingField = existingByName.get(f.name);
    if (!existingField) return true;

    // The name is taken by a calculated field, which the map above already carried through
    // untouched. The user's declaration wins the name, but a same-named warehouse column
    // silently vanishing is not something to hide — surface it instead of dropping it mute.
    if (existingField.calculated) {
      logger.warn(
        `Data Mart field "${f.name}": a warehouse column of this name cannot be surfaced ` +
          `because a calculated field already holds the name.`
      );
    }
    return false;
  });

  return [...updated, ...added];
}
