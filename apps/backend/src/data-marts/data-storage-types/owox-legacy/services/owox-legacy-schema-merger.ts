import { Injectable, Logger } from '@nestjs/common';
import { isBigQueryDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaMerger } from '../../interfaces/data-mart-schema-merger.interface';
import { BigQueryFieldType } from '../../bigquery/enums/bigquery-field-type.enum';
import { BigqueryDataMartSchema } from '../../bigquery/schemas/bigquery-data-mart.schema';

type SchemaField = BigqueryDataMartSchema['fields'][0];
type FieldsMap = Map<string, SchemaField>;

/**
 * OWOX Legacy Schema Merger.
 * Same logic as BigQuery schema merger.
 */
@Injectable()
export class OwoxLegacySchemaMerger implements DataMartSchemaMerger {
    private readonly logger = new Logger(OwoxLegacySchemaMerger.name);
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

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
        const result = {
            ...field,
            status: DataMartSchemaFieldStatus.DISCONNECTED,
        };

        if (field.fields) {
            result.fields = field.fields.map(nestedField => this.markFieldAsDisconnected(nestedField));
        }

        return result;
    }

    private mergeField(existingField: SchemaField, newField: SchemaField): SchemaField {
        const hasTypeMismatch =
            existingField.type !== newField.type || existingField.mode !== newField.mode;
        const isExistingRecord = this.isRecordType(existingField.type);
        const isNewRecord = this.isRecordType(newField.type);

        if (isExistingRecord && isNewRecord) {
            return this.mergeRecordFields(existingField, newField, hasTypeMismatch);
        }

        if (isExistingRecord && !isNewRecord) {
            return this.convertRecordToNonRecord(existingField);
        }

        if (!isExistingRecord && isNewRecord) {
            return this.convertNonRecordToRecord(existingField);
        }

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
        const mergedFields = this.mergeFields(existingField.fields || [], newField.fields || []);

        const hasNestedFieldsWithIssues = mergedFields.some(
            field => field.status !== DataMartSchemaFieldStatus.CONNECTED
        );

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
