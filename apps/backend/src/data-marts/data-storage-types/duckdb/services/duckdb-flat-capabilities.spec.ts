import { DuckDbSchemaMerger } from './duckdb-schema-merger';
import { DuckDbReportHeadersGenerator } from './duckdb-report-headers-generator.service';
import { DuckDbDataMartSchemaParser } from './duckdb-data-mart-schema.parser';
import { DuckDbIdentifierEscaper } from './duckdb-identifier.escaper';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DuckdbFieldType } from '../enums/duckdb-field-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';

describe('DuckDB flat capabilities', () => {
  it('all carry type DUCKDB', () => {
    expect(new DuckDbSchemaMerger().type).toBe(DataStorageType.DUCKDB);
    expect(new DuckDbReportHeadersGenerator().type).toBe(DataStorageType.DUCKDB);
    expect(new DuckDbDataMartSchemaParser().type).toBe(DataStorageType.DUCKDB);
    expect(new DuckDbIdentifierEscaper().type).toBe(DataStorageType.DUCKDB);
  });
  it('escaper quotes identifiers', () => {
    expect(new DuckDbIdentifierEscaper().escapeIdentifier('main.orders')).toContain('"');
  });
  it('parser accepts a valid duckdb schema, rejects garbage', async () => {
    const parser = new DuckDbDataMartSchemaParser();
    await expect(
      parser.validateAndParse({
        type: 'duckdb-data-mart-schema',
        fields: [
          { name: 'x', type: DuckdbFieldType.VARCHAR, status: DataMartSchemaFieldStatus.CONNECTED },
        ],
      })
    ).resolves.toBeDefined();
    await expect(parser.validateAndParse({ nope: true })).rejects.toBeDefined();
  });
  it('headers generator emits connected, non-hidden fields', () => {
    const headers = new DuckDbReportHeadersGenerator().generateHeaders({
      type: 'duckdb-data-mart-schema',
      fields: [
        {
          name: 'id',
          type: DuckdbFieldType.BIGINT,
          status: DataMartSchemaFieldStatus.CONNECTED,
          isHiddenForReporting: false,
        },
      ],
    } as never);
    expect(headers.map(h => h.name)).toContain('id');
  });
});
