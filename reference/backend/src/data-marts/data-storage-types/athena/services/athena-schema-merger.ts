import { Injectable, Logger } from '@nestjs/common';
import { isAthenaDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaMerger } from '../../interfaces/data-mart-schema-merger.interface';
import { AthenaDataMartSchema } from '../schemas/athena-data-mart-schema.schema';

type SchemaField = AthenaDataMartSchema['fields'][0];
type FieldsMap = Map<string, SchemaField>;

@Injectable()
export class AthenaSchemaMerger implements DataMartSchemaMerger {
  private readonly logger = new Logger(AthenaSchemaMerger.name);
  readonly type = DataStorageType.AWS_ATHENA;

  mergeSchemas(
    existingSchema: DataMartSchema | undefined,
    newSchema: DataMartSchema
  ): DataMartSchema {
    this.logger.debug('Merging schemas', { existingSchema, newSchema });

    if (!isAthenaDataMartSchema(newSchema)) {
      throw new Error('New schema must be an Athena schema');
    }

    if (existingSchema && !isAthenaDataMartSchema(existingSchema)) {
      throw new Error('Existing schema must be an Athena schema');
    }

    if (!existingSchema) {
      return newSchema;
    }

    const existingFieldsMap = this.createFieldsMap(existingSchema.fields);
    const newFieldsMap = this.createFieldsMap(newSchema.fields);

    const updatedExistingFields = this.updateExistingFields(existingSchema.fields, newFieldsMap);
    const newFields = this.getNewFields(newSchema.fields, existingFieldsMap);

    return {
      ...existingSchema,
      fields: [...updatedExistingFields, ...newFields],
    };
  }

  private createFieldsMap(fields: SchemaField[]): FieldsMap {
    return new Map(fields.map(field => [field.name, field]));
  }

  private updateExistingFields(
    existingFields: SchemaField[],
    newFieldsMap: FieldsMap
  ): SchemaField[] {
    return existingFields.map(existingField => {
      const newField = newFieldsMap.get(existingField.name);

      if (newField) {
        return {
          ...existingField,
          status:
            existingField.type === newField.type
              ? DataMartSchemaFieldStatus.CONNECTED
              : DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH,
        };
      }

      return {
        ...existingField,
        status: DataMartSchemaFieldStatus.DISCONNECTED,
      };
    });
  }

  private getNewFields(newFields: SchemaField[], existingFieldsMap: FieldsMap): SchemaField[] {
    return newFields.filter(newField => !existingFieldsMap.has(newField.name));
  }
}
