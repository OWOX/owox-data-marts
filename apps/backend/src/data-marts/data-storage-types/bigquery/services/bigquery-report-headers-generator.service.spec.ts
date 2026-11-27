import { BigQueryReportHeadersGenerator } from './bigquery-report-headers-generator.service';
import { BigqueryDataMartSchema } from '../schemas/bigquery-data-mart.schema';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { BigQueryFieldType } from '../enums/bigquery-field-type.enum';

describe('BigQueryReportHeadersGenerator', () => {
  const generator = new BigQueryReportHeadersGenerator();

  const schemaWith = (fields: BigqueryDataMartSchema['fields']): BigqueryDataMartSchema => ({
    type: 'bigquery-data-mart-schema',
    fields,
  });

  it('omits a calculated field from native headers', () => {
    const headers = generator.generateHeaders(
      schemaWith([
        {
          name: 'clicks',
          type: 'INTEGER',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
        {
          name: 'ctr',
          type: 'FLOAT',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ] as unknown as BigqueryDataMartSchema['fields'])
    );

    expect(headers.map(h => h.name)).toEqual(['clicks']);
  });

  it('omits a calculated field even when its warehouse-derived status is DISCONNECTED', () => {
    const headers = generator.generateHeaders(
      schemaWith([
        {
          name: 'ctr',
          type: 'FLOAT',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.DISCONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ] as unknown as BigqueryDataMartSchema['fields'])
    );

    expect(headers).toEqual([]);
  });

  it('reports a repeated field as an array instead of its element type', () => {
    const headers = generator.generateHeaders(
      schemaWith([
        {
          name: 'quantities',
          type: BigQueryFieldType.INTEGER,
          mode: 'REPEATED',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
      ] as unknown as BigqueryDataMartSchema['fields'])
    );

    expect(headers.map(header => [header.name, header.storageFieldType])).toEqual([
      ['quantities', 'ARRAY<INTEGER>'],
    ]);
  });
});
