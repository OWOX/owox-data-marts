import { Injectable, Logger } from '@nestjs/common';
import { isBigQueryDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaMerger } from '../../interfaces/data-mart-schema-merger.interface';
import { BigQueryFieldType } from '../enums/bigquery-field-type.enum';
import { BigqueryDataMartSchema } from '../schemas/bigquery-data-mart.schema';

type SchemaField = BigqueryDataMartSchema['fields'][0];
type FieldsMap = Map<string, SchemaField>;

@Injectable()
export class BigQuerySchemaMerger implements DataMartSchemaMerger {
  protected readonly logger = new Logger(BigQuerySchemaMerger.name);
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  mergeSchemas(
    existingSchema: DataMartSchema | undefined,
    newSchema: DataMartSchema
  ): DataMartSchema {
    this.logger.debug('Merging schemas', { existingSchema, newSchema });

    if (!isBigQueryDataMartSchema(newSchema)) {
      throw new Error('New schema must be a BigQuery schema');
    }

    if (existingSchema && !isBigQueryDataMartSchema(existingSchema)) {
      throw new Error('Existing schema must be a BigQuery schema');
    }

    if (!existingSchema) {
      return newSchema;
    }

    return {
      ...existingSchema,
      fields: this.mergeFields(existingSchema.fields, newSchema.fields),
    };
  }

  private mergeFields(existingFields: SchemaField[], newFields: SchemaField[]): SchemaField[] {
    const existingFieldsMap = this.createFieldsMap(existingFields);
    const newFieldsMap = this.createFieldsMap(newFields);

    const updatedExistingFields = this.updateExistingFields(existingFields, newFieldsMap);
    const newFieldsToAdd = this.getNewFields(newFields, existingFieldsMap);

    return [...updatedExistingFields, ...newFieldsToAdd];
  }

  private updateExistingFields(
    existingFields: SchemaField[],
    newFieldsMap: FieldsMap
  ): SchemaField[] {
    return existingFields.map(existingField => {
      const newField = newFieldsMap.get(existingField.name);

      if (!newField) {
        return this.markFieldAsDisconnected(existingField);
      }

      return this.mergeField(existingField, newField);
    });
  }

  private markFieldAsDisconnected(field: SchemaField): SchemaField {
    // Mark the field and all its nested fields as disconnected
    const result = {
      ...field,
      status: DataMartSchemaFieldStatus.DISCONNECTED,
    };

    // If this is a field with nested fields, mark all nested fields as disconnected too
    if (field.fields) {
      result.fields = field.fields.map(nestedField => this.markFieldAsDisconnected(nestedField));
    }

    return result;
  }

  private mergeField(existingField: SchemaField, newField: SchemaField): SchemaField {
    // Check for type mismatch
    const hasTypeMismatch =
      existingField.type !== newField.type || existingField.mode !== newField.mode;
    //existingField.isPrimaryKey !== newField.isPrimaryKey;
    const isExistingRecord = this.isRecordType(existingField.type);
    const isNewRecord = this.isRecordType(newField.type);

    // Both fields are records: merging nested fields
    if (isExistingRecord && isNewRecord) {
      return this.mergeRecordFields(existingField, newField, hasTypeMismatch);
    }

    // Field was a record but is no longer: keep nested fields as disconnected
    if (isExistingRecord && !isNewRecord) {
      return this.convertRecordToNonRecord(existingField);
    }

    // Field was not a record but is now: add new nested fields
    if (!isExistingRecord && isNewRecord) {
      return this.convertNonRecordToRecord(existingField);
    }

    // Simple field: update status
    return this.updateSimpleField(existingField, hasTypeMismatch);
  }

  private isRecordType(type: BigQueryFieldType): boolean {
    return type === BigQueryFieldType.RECORD || type === BigQueryFieldType.STRUCT;
  }

  private mergeRecordFields(
    existingField: SchemaField,
    newField: SchemaField,
    hasTypeMismatch: boolean
  ): SchemaField {
    // First merge the nested fields
    const mergedFields = this.mergeFields(existingField.fields || [], newField.fields || []);

    // Check if any nested field has issues
    const hasNestedFieldsWithIssues = mergedFields.some(
      field => field.status !== DataMartSchemaFieldStatus.CONNECTED
    );

    // If any nested field has issues, mark the parent as having issues too
    const status = hasNestedFieldsWithIssues
      ? DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH
      : this.getConnectedFieldStatus(hasTypeMismatch);

    return {
      ...existingField,
      status,
      fields: mergedFields,
    };
  }

  private convertRecordToNonRecord(existingField: SchemaField): SchemaField {
    return {
      ...existingField,
      status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH,
      fields: undefined,
    };
  }

  private convertNonRecordToRecord(existingField: SchemaField): SchemaField {
    return {
      ...existingField,
      status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH,
    };
  }

  private updateSimpleField(existingField: SchemaField, hasTypeMismatch: boolean): SchemaField {
    return {
      ...existingField,
      status: this.getConnectedFieldStatus(hasTypeMismatch),
    };
  }

  private getConnectedFieldStatus(hasTypeMismatch: boolean): DataMartSchemaFieldStatus {
    return hasTypeMismatch
      ? DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH
      : DataMartSchemaFieldStatus.CONNECTED;
  }

  private createFieldsMap(fields: SchemaField[]): FieldsMap {
    return new Map(fields.map(field => [field.name, field]));
  }

  private getNewFields(newFields: SchemaField[], existingFieldsMap: FieldsMap): SchemaField[] {
    return newFields.filter(newField => !existingFieldsMap.has(newField.name));
  }
}
