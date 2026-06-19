import { isConnected } from './data-mart-schema.utils';
import { DataMartSchemaFieldStatus } from './enums/data-mart-schema-field-status.enum';
import type { DataMartSchemaField } from './data-mart-schema.type';

describe('isConnected', () => {
  const field = (status: DataMartSchemaFieldStatus): DataMartSchemaField =>
    ({ name: 'f', type: 'STRING', status }) as unknown as DataMartSchemaField;

  it('treats CONNECTED as present in the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.CONNECTED))).toBe(true);
  });

  it('treats CONNECTED_WITH_DEFINITION_MISMATCH as present in the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH))).toBe(
      true
    );
  });

  it('treats DISCONNECTED as gone from the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.DISCONNECTED))).toBe(false);
  });
});
