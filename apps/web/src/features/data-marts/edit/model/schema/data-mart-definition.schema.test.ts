import { describe, it, expect } from 'vitest';
import { createDataMartDefinitionSchema } from './data-mart-definition.schema';
import { DataMartDefinitionType } from '../../../shared';
import { DataStorageType } from '../../../../data-storage';

describe('connector definition schema preserves source.version', () => {
  const schema = createDataMartDefinitionSchema(
    DataMartDefinitionType.CONNECTOR,
    DataStorageType.GOOGLE_BIGQUERY
  );
  const base = {
    definitionType: DataMartDefinitionType.CONNECTOR,
    definition: {
      connector: {
        source: { name: 'X', configuration: [{ a: 1 }], node: 'n', fields: ['f'] },
        storage: { fullyQualifiedName: 'ds.tbl' },
      },
    },
  };

  it('keeps a pinned version through parse (the resolver would otherwise strip it)', () => {
    const input = {
      ...base,
      definition: {
        connector: {
          ...base.definition.connector,
          source: { ...base.definition.connector.source, version: 3 },
        },
      },
    };
    const parsed = schema.parse(input) as typeof input;
    expect(parsed.definition.connector.source.version).toBe(3);
  });

  it('parses follow-active (no version) without error', () => {
    const parsed = schema.parse(base) as typeof base & {
      definition: { connector: { source: { version?: number } } };
    };
    expect(parsed.definition.connector.source.version).toBeUndefined();
  });
});
