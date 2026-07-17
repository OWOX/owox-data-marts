import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import type { AthenaSchemaField } from '../../../../shared/types/data-mart-schema.types';
import {
  AthenaFieldType,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';
import { AthenaSchemaTable } from './AthenaSchemaTable';
import type { SchemaToolbar } from '../types/schema-toolbar';

// SchemaTable uses useOutletContext for schema-actualization loading state
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useOutletContext: vi.fn(() => ({ isSchemaActualizationLoading: false })),
  };
});

const mockSchemaToolbar: SchemaToolbar = {
  showAiHelper: false,

  refresh: {
    disabled: false,
    onClick: vi.fn(),
  },

  ai: {
    disabled: false,
    loading: {
      metadata: false,
      aliases: false,
      descriptions: false,
    },
    onGenerateMetadata: vi.fn(),
    onGenerateDescriptions: vi.fn(),
    onGenerateAliases: vi.fn(),
  },
};

function buildAthenaField(overrides: Partial<AthenaSchemaField> = {}): AthenaSchemaField {
  return {
    name: 'field_a',
    type: AthenaFieldType.STRING,
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    ...overrides,
  };
}

describe('BaseSchemaTable — Aggregations column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Available aggregations" column header (Σ icon with aria-label)', () => {
    const fields = [buildAthenaField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    expect(screen.getByLabelText('Available aggregations')).toBeInTheDocument();
  });

  it('shows the STRING default (COUNT, COUNT_DISTINCT) as joined names for a STRING field with no allowedAggregations', () => {
    const fields = [buildAthenaField({ name: 'my_string', type: AthenaFieldType.STRING })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // STRING default is [COUNT, COUNT_DISTINCT] — 2 items → joined names.
    expect(screen.getByText('COUNT, COUNT_DISTINCT')).toBeInTheDocument();
  });

  it('shows "4 selected" for a numeric field with no allowedAggregations (type-derived default: SUM, AVG, MIN, MAX)', () => {
    const fields = [buildAthenaField({ name: 'revenue', type: AthenaFieldType.DOUBLE })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // DOUBLE numeric default is [SUM, AVG, MIN, MAX] — 4 items → "4 selected".
    expect(screen.getByText('4 selected')).toBeInTheDocument();
  });

  it('shows "COUNT" when field has explicit allowedAggregations: [COUNT]', () => {
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: ['COUNT'] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    expect(screen.getByText('COUNT')).toBeInTheDocument();
  });

  it('shows "None" when field has explicit allowedAggregations: []', () => {
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: [] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('toggling a function OFF calls onFieldsChange with narrowed allowedAggregations array', async () => {
    const onFieldsChange = vi.fn();
    // STRING default is [COUNT, COUNT_DISTINCT] — both checked by default.
    const fields = [buildAthenaField({ name: 'my_string', type: AthenaFieldType.STRING })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Open the aggregations dropdown for the field
    const trigger = screen.getByRole('button', { name: 'Aggregations for my_string' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // COUNT_DISTINCT is checked — uncheck it
    const countDistinctItem = await within(document.body).findByRole('menuitemcheckbox', {
      name: 'COUNT_DISTINCT',
    });
    fireEvent.click(countDistinctItem);

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalled();
    });

    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields[0].allowedAggregations).toEqual(['COUNT']);
  });

  it('clearing all aggregations writes an explicit empty array [] (not dropped)', async () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: ['COUNT'] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Aggregations for field_a' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // COUNT is the only checked item — uncheck it to clear all
    const countItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'COUNT' });
    fireEvent.click(countItem);

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalled();
    });

    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    // Must persist explicit [] — not undefined, not omitted
    expect(updatedFields[0]).toHaveProperty('allowedAggregations');
    expect(updatedFields[0].allowedAggregations).toEqual([]);
  });

  it('turning a function ON calls onFieldsChange with that function added', async () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: ['COUNT'] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Aggregations for field_a' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // MIN is unchecked — click it to add it
    const minItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'MIN' });
    fireEvent.click(minItem);

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalled();
    });

    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields[0].allowedAggregations).toContain('MIN');
    expect(updatedFields[0].allowedAggregations).toContain('COUNT');
  });
});

it('renders AI header buttons when AI helper is enabled', () => {
  const fields = [buildAthenaField()];

  render(
    <AthenaSchemaTable
      fields={fields}
      onFieldsChange={() => {}}
      schemaToolbar={{
        ...mockSchemaToolbar,
        showAiHelper: true,
      }}
    />
  );

  expect(screen.getByLabelText('Generate field aliases')).toBeInTheDocument();

  expect(screen.getByLabelText('Generate field descriptions')).toBeInTheDocument();
});

it('hides AI header buttons when AI helper is disabled', () => {
  const fields = [buildAthenaField()];

  render(
    <AthenaSchemaTable
      fields={fields}
      onFieldsChange={() => {}}
      schemaToolbar={{
        ...mockSchemaToolbar,
        showAiHelper: false,
      }}
    />
  );

  expect(screen.queryByLabelText('Generate field aliases')).not.toBeInTheDocument();

  expect(screen.queryByLabelText('Generate field descriptions')).not.toBeInTheDocument();
});

it('calls AI callbacks when header buttons are clicked', () => {
  const onGenerateAliases = vi.fn();
  const onGenerateDescriptions = vi.fn();

  const fields = [buildAthenaField()];

  render(
    <AthenaSchemaTable
      fields={fields}
      onFieldsChange={() => {}}
      schemaToolbar={{
        ...mockSchemaToolbar,
        showAiHelper: true,
        ai: {
          ...mockSchemaToolbar.ai,
          onGenerateAliases,
          onGenerateDescriptions,
        },
      }}
    />
  );

  fireEvent.click(screen.getByLabelText('Generate field aliases'));

  expect(onGenerateAliases).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByLabelText('Generate field descriptions'));

  expect(onGenerateDescriptions).toHaveBeenCalledTimes(1);
});
