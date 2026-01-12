import { Injectable, Logger } from '@nestjs/common';
import { isSnowflakeDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaMerger } from '../../interfaces/data-mart-schema-merger.interface';
import { SnowflakeDataMartSchema } from '../schemas/snowflake-data-mart-schema.schema';

type SchemaField = SnowflakeDataMartSchema['fields'][0];
type FieldsMap = Map<string, SchemaField>;

@Injectable()
export class SnowflakeSchemaMerger implements DataMartSchemaMerger {
  private readonly logger = new Logger(SnowflakeSchemaMerger.name);
  readonly type = DataStorageType.SNOWFLAKE;

  mergeSchemas(
    existingSchema: DataMartSchema | undefined,
    newSchema: DataMartSchema
  ): DataMartSchema {
    this.logger.debug('Merging schemas', { existingSchema, newSchema });

    if (!isSnowflakeDataMartSchema(newSchema)) {
      throw new Error('New schema must be a Snowflake schema');
    }

    if (existingSchema && !isSnowflakeDataMartSchema(existingSchema)) {
      throw new Error('Existing schema must be a Snowflake schema');
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
    return {
      ...field,
      status: DataMartSchemaFieldStatus.DISCONNECTED,
    };
  }

  private mergeField(existingField: SchemaField, newField: SchemaField): SchemaField {
    const hasTypeMismatch = existingField.type !== newField.type;

    return {
      ...newField,
      alias: existingField.alias,
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
