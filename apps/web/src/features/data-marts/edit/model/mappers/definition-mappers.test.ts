import { describe, it, expect } from 'vitest';
import { mapConnectorDefinitionToDto, mapConnectorDefinitionFromDto } from './definition-mappers';
import type { ConnectorDefinitionConfig } from '../types';
import type { ConnectorDefinitionDto } from '../../../shared/types/api';

describe('connector definition version round-trip', () => {
  const pinned: ConnectorDefinitionConfig = {
    connector: {
      source: { name: 'X', configuration: [{ a: 1 }], node: 'n', fields: ['f'], version: 3 },
      storage: { fullyQualifiedName: 'ds.tbl' },
    },
  };

  it('carries source.version through toDto when pinned', () => {
    const dto = mapConnectorDefinitionToDto(pinned);
    expect(dto.connector.source.version).toBe(3);
  });

  it('leaves source.version undefined when following active', () => {
    const followActive: ConnectorDefinitionConfig = {
      connector: {
        source: { name: 'X', configuration: [{ a: 1 }], node: 'n', fields: ['f'] },
        storage: { fullyQualifiedName: 'ds.tbl' },
      },
    };
    const dto = mapConnectorDefinitionToDto(followActive);
    expect(dto.connector.source.version).toBeUndefined();
  });

  it('reads source.version back fromDto', () => {
    const dto: ConnectorDefinitionDto = {
      connector: {
        source: { name: 'X', configuration: [{ a: 1 }], node: 'n', fields: ['f'], version: 5 },
        storage: { fullyQualifiedName: 'ds.tbl' },
      },
    };
    const model = mapConnectorDefinitionFromDto(dto);
    expect(model.connector.source.version).toBe(5);
  });
});
