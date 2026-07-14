// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDefinitionConfig } from '../../../model/types/connector-definition-config';
import { EditFieldsButtonLabel } from './ConnectorDefinitionField';

const previewConnectorFields = vi.hoisted(() => vi.fn());

vi.mock('../../../../../connectors/shared/api', () => ({
  ConnectorApiService: class {
    previewConnectorFields(...args: unknown[]) {
      return previewConnectorFields(...args);
    }
  },
}));

describe('EditFieldsButtonLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts selected columns that still exist in the live Google Sheets preview', async () => {
    const availableFields = [
      '_owox_row_number',
      '_owox_imported_at',
      'column_a',
      'column_b',
      'column_c',
      'column_d',
      'column_e',
    ];
    const savedFields = [...availableFields, 'deleted_column'];
    previewConnectorFields.mockResolvedValue([
      {
        name: 'sheet',
        fields: availableFields.map(name => ({ name })),
        defaultFields: availableFields,
      },
    ]);
    const connectorDef = {
      connector: {
        source: {
          name: 'GoogleSheets',
          node: 'sheet',
          fields: savedFields,
          configuration: [
            {
              ImportAllColumns: false,
              SelectedColumns: savedFields.join(','),
            },
          ],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    } as ConnectorDefinitionConfig;

    render(<EditFieldsButtonLabel connectorDef={connectorDef} />);

    expect(await screen.findByText('Edit Fields (7)')).toBeInTheDocument();
  });
});
