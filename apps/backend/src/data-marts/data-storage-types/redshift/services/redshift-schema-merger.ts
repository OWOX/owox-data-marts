import { Injectable } from '@nestjs/common';
import { DataMartSchemaMerger } from '../../interfaces/data-mart-schema-merger.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isRedshiftDataMartSchema } from '../../data-mart-schema.guards';
import {
  RedshiftDataMartSchema,
  RedshiftDataMartSchemaField,
} from '../schemas/redshift-data-mart-schema.schema';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';

@Injectable()
export class RedshiftSchemaMerger implements DataMartSchemaMerger {
  readonly type = DataStorageType.AWS_REDSHIFT;

  mergeSchemas(existingSchema: DataMartSchema, newSchema: DataMartSchema): DataMartSchema {
    // If existing schema is empty or invalid, return new schema
    if (!existingSchema || !isRedshiftDataMartSchema(existingSchema)) {
      if (!isRedshiftDataMartSchema(newSchema)) {
        throw new Error('New schema must be a Redshift data mart schema');
      }
      return newSchema;
    }

    if (!isRedshiftDataMartSchema(newSchema)) {
      throw new Error('New schema must be a Redshift data mart schema');
    }

    return this.mergeRedshiftSchemas(existingSchema, newSchema);
  }

  private mergeRedshiftSchemas(
    existingSchema: RedshiftDataMartSchema,
    newSchema: RedshiftDataMartSchema
  ): RedshiftDataMartSchema {
    const newFieldsMap = new Map<string, RedshiftDataMartSchemaField>();
    newSchema.fields.forEach(field => {
      newFieldsMap.set(field.name as string, field);
    });

    const mergedFields: RedshiftDataMartSchemaField[] = [];

    // Process existing fields
    for (const existingField of existingSchema.fields) {
      const newField = newFieldsMap.get(existingField.name as string);

      if (!newField) {
        // Field no longer exists in new schema
        mergedFields.push({
          ...existingField,
          status: DataMartSchemaFieldStatus.DISCONNECTED,
        });
      } else {
        // Field exists in both schemas
        if (existingField.type === newField.type) {
          // Type matches
          mergedFields.push({
            ...existingField,
            type: newField.type,
            status: DataMartSchemaFieldStatus.CONNECTED,
          });
        } else {
          // Type mismatch
          mergedFields.push({
            ...existingField,
            type: newField.type,
            status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH,
          });
        }

        // Remove from new fields map
        newFieldsMap.delete(existingField.name as string);
      }
    }

    // Add new fields that weren't in existing schema
    for (const newField of newFieldsMap.values()) {
      mergedFields.push({
        ...newField,
        status: DataMartSchemaFieldStatus.CONNECTED,
      });
    }

    return {
      ...existingSchema,
      fields: mergedFields,
    };
  }
}
