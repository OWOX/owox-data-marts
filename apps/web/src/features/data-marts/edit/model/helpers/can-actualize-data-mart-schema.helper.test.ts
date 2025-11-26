import { describe, expect, it } from 'vitest';
import { canActualizeSchema } from './can-actualize-data-mart-schema.helper';
import { DataMartDefinitionType } from '../../../shared';
import {
  DataMartSchemaFieldStatus,
  BigQueryFieldType,
  BigQueryFieldMode,
} from '../../../shared/types/data-mart-schema.types';
import type { BigQueryDataMartSchema } from '../../../shared/types/data-mart-schema.types';

describe('canActualizeSchema', () => {
  describe('non-CONNECTOR definition types (SQL, null)', () => {
    it('should always return true regardless of schema state', () => {
      // With null schema
      expect(canActualizeSchema(DataMartDefinitionType.SQL, null)).toBe(true);
      expect(canActualizeSchema(null, null)).toBe(true);

      // With empty schema
      const emptySchema: BigQueryDataMartSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [],
      };
      expect(canActualizeSchema(DataMartDefinitionType.SQL, emptySchema)).toBe(true);
      expect(canActualizeSchema(null, emptySchema)).toBe(true);

      // With schema containing fields
      const schemaWithFields: BigQueryDataMartSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'field1',
            type: BigQueryFieldType.STRING,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.DISCONNECTED,
            isPrimaryKey: false,
          },
        ],
      };
      expect(canActualizeSchema(DataMartDefinitionType.SQL, schemaWithFields)).toBe(true);
      expect(canActualizeSchema(null, schemaWithFields)).toBe(true);
    });
  });

  describe('CONNECTOR definition type', () => {
    it('should return true when schema is null (new connector, needs initial actualization)', () => {
      expect(canActualizeSchema(DataMartDefinitionType.CONNECTOR, null)).toBe(true);
    });

    it('should return false when schema exists but is empty or has no connected fields', () => {
      const emptySchema: BigQueryDataMartSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [],
      };
      expect(canActualizeSchema(DataMartDefinitionType.CONNECTOR, emptySchema)).toBe(false);
    });

    it('should return false when all fields are DISCONNECTED', () => {
      const schema: BigQueryDataMartSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'field1',
            type: BigQueryFieldType.STRING,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.DISCONNECTED,
            isPrimaryKey: false,
          },
          {
            name: 'field2',
            type: BigQueryFieldType.INTEGER,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.DISCONNECTED,
            isPrimaryKey: false,
          },
        ],
      };
      expect(canActualizeSchema(DataMartDefinitionType.CONNECTOR, schema)).toBe(false);
    });

    it('should return true when at least one field is CONNECTED', () => {
      const schema: BigQueryDataMartSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'field1',
            type: BigQueryFieldType.STRING,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.CONNECTED,
            isPrimaryKey: false,
          },
          {
            name: 'field2',
            type: BigQueryFieldType.INTEGER,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.DISCONNECTED,
            isPrimaryKey: false,
          },
        ],
      };
      expect(canActualizeSchema(DataMartDefinitionType.CONNECTOR, schema)).toBe(true);
    });
  });
});
