import { AthenaReportHeadersGenerator } from '../athena/services/athena-report-headers-generator.service';
import { AthenaDataMartSchema } from '../athena/schemas/athena-data-mart-schema.schema';
import { DataMartSchemaFieldStatus } from '../enums/data-mart-schema-field-status.enum';

// FlatReportHeadersGenerator is abstract; AthenaReportHeadersGenerator is its thinnest concrete
// subclass, so it stands in for every storage that shares this base (Athena, Redshift, Snowflake,
// Databricks).
describe('FlatReportHeadersGenerator', () => {
  const generator = new AthenaReportHeadersGenerator();

  const schemaWith = (fields: AthenaDataMartSchema['fields']): AthenaDataMartSchema => ({
    type: 'athena-data-mart-schema',
    fields,
  });

  it('omits a calculated field from native headers', () => {
    const headers = generator.generateHeaders(
      schemaWith([
        {
          name: 'clicks',
          type: 'INTEGER',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
        {
          name: 'ctr',
          type: 'FLOAT',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ] as unknown as AthenaDataMartSchema['fields'])
    );

    expect(headers.map(h => h.name)).toEqual(['clicks']);
  });

  it('omits a calculated field even when its warehouse-derived status is DISCONNECTED', () => {
    const headers = generator.generateHeaders(
      schemaWith([
        {
          name: 'ctr',
          type: 'FLOAT',
          status: DataMartSchemaFieldStatus.DISCONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ] as unknown as AthenaDataMartSchema['fields'])
    );

    expect(headers).toEqual([]);
  });
});
