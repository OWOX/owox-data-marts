import { Logger } from '@nestjs/common';
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
  status?: DataMartSchemaFieldStatus;
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

    const mergedFields = mergeFlatSchemaFields(existing.fields, incoming.fields);

    return {
      ...(existingSchema as DataMartSchema),
      fields: mergedFields,
    } as DataMartSchema;
  }
}

function mergeFlatSchemaFields(
  existing: MergeableField[],
  incoming: MergeableField[]
): MergeableField[] {
  const incomingByName = new Map(incoming.map(f => [f.name, f]));
  const existingNames = new Set(existing.map(f => f.name));

  const updated = existing.map(existingField => {
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
      status: hasTypeMismatch
        ? DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH
        : DataMartSchemaFieldStatus.CONNECTED,
    };
  });

  const added = incoming.filter(f => !existingNames.has(f.name));

  return [...updated, ...added];
}
