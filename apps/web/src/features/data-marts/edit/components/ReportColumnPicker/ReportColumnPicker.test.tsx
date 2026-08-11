import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';
import { ReportColumnPicker } from './ReportColumnPicker';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  AvailableSource,
  BlendableSchema,
  BlendedField,
  JoinedUniqueCountAvailability,
} from '../../../shared/types/relationship.types';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import { MAIN_UNIQUE_COUNT_SOURCE, type OutputConfig } from '../../../shared/types/output-config';

vi.mock('../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    getBlendableSchema: vi.fn(),
  },
}));

const DATA_MART_ID = 'dm-root';

function buildAvailableSource(overrides: Partial<AvailableSource> = {}): AvailableSource {
  return {
    aliasPath: 'b',
    title: 'Joined DM',
    description: undefined,
    defaultAlias: 'Joined DM',
    depth: 1,
    fieldCount: 1,
    isIncluded: true,
    relationshipId: 'rel-1',
    dataMartId: 'dm-1',
    isAccessibleForReporting: true,
    uniqueCountAvailability: 'available',
    ...overrides,
  };
}

function buildBlendedField(overrides: Partial<BlendedField> = {}): BlendedField {
  return {
    name: 'b__some_field',
    sourceRelationshipId: 'rel-1',
    sourceDataMartId: 'dm-1',
    sourceDataMartTitle: 'Joined DM',
    targetAlias: 'b',
    originalFieldName: 'some_field',
    type: 'STRING',
    alias: '',
    description: '',
    isHidden: false,
    aggregateFunction: 'STRING_AGG',
    transitiveDepth: 1,
    aliasPath: 'b',
    outputPrefix: 'Joined DM',
    ...overrides,
  };
}

function buildSchema(overrides: Partial<BlendableSchema> = {}): BlendableSchema {
  return {
    nativeFields: [{ name: 'native_one', type: 'STRING' }] as unknown[],
    nativeDescription: undefined,
    blendedFields: [],
    availableSources: [],
    ...overrides,
  };
}

function renderPicker(
  schema: BlendableSchema,
  value: string[] | null,
  props: Partial<ComponentProps<typeof ReportColumnPicker>> = {}
) {
  vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const onChange = vi.fn();
  const utils = render(
    <ReportColumnPicker dataMartId={DATA_MART_ID} value={value} onChange={onChange} {...props} />,
    { wrapper }
  );
  return { ...utils, onChange, client };
}

describe('ReportColumnPicker access flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an accessible blended source normally with all of its fields visible', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({ name: 'b__field_a', originalFieldName: 'field_a' }),
        buildBlendedField({ name: 'b__field_b', originalFieldName: 'field_b' }),
      ],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: true })],
    });

    renderPicker(schema, ['b__field_a']);

    expect(screen.getByRole('button', { name: /Collapse Joined DM/ })).toBeInTheDocument();
    expect(screen.getByText('field_a')).toBeInTheDocument();
    expect(screen.getByText('field_b')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('You do not have access to this data mart')
    ).not.toBeInTheDocument();
  });

  it('hides an inaccessible source entirely when nothing is selected from it', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__field_a', originalFieldName: 'field_a' })],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    renderPicker(schema, []);

    expect(screen.queryByText('Joined DM')).not.toBeInTheDocument();
    expect(screen.queryByText('field_a')).not.toBeInTheDocument();
  });

  it('renders an inaccessible source with destructive styling, an alert icon, and only its selected fields', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({ name: 'b__keep', originalFieldName: 'keep' }),
        buildBlendedField({ name: 'b__hide_me', originalFieldName: 'hide_me' }),
      ],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    renderPicker(schema, ['b__keep']);

    expect(screen.getByLabelText('You do not have access to this data mart')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Collapse Joined DM/ });
    const block = trigger.parentElement;
    expect(block).not.toBeNull();
    expect(block!.className).toMatch(/border-destructive/);
    expect(block!.className).toMatch(/bg-destructive\/10/);

    const title = within(block!).getByText('Joined DM');
    expect(title.className).toMatch(/text-destructive/);

    expect(screen.getByText('keep')).toBeInTheDocument();
    expect(screen.queryByText('hide_me')).not.toBeInTheDocument();
  });

  it('Select all toggles only accessible fields and preserves already-selected inaccessible ones', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__yes',
          originalFieldName: 'yes',
          aliasPath: 'b',
          outputPrefix: 'b',
          targetAlias: 'b',
          sourceRelationshipId: 'rel-b',
          sourceDataMartId: 'dm-b',
        }),
        buildBlendedField({
          name: 'c__no_new',
          originalFieldName: 'no_new',
          aliasPath: 'c',
          outputPrefix: 'c',
          targetAlias: 'c',
          sourceRelationshipId: 'rel-c',
          sourceDataMartId: 'dm-c',
        }),
        buildBlendedField({
          name: 'c__keep',
          originalFieldName: 'keep',
          aliasPath: 'c',
          outputPrefix: 'c',
          targetAlias: 'c',
          sourceRelationshipId: 'rel-c',
          sourceDataMartId: 'dm-c',
        }),
      ],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'b',
          relationshipId: 'rel-b',
          dataMartId: 'dm-b',
          isAccessibleForReporting: true,
        }),
        buildAvailableSource({
          aliasPath: 'c',
          title: 'Locked DM',
          relationshipId: 'rel-c',
          dataMartId: 'dm-c',
          isAccessibleForReporting: false,
        }),
      ],
    });

    const { onChange } = renderPicker(schema, ['c__keep']);

    const masterCheckbox = screen.getByRole('checkbox', { name: 'Select all fields' });
    fireEvent.click(masterCheckbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as string[];
    expect(next).toEqual(expect.arrayContaining(['native_one', 'b__yes', 'c__keep']));
    expect(next).not.toContain('c__no_new');
  });

  it('removes the inaccessible block from the DOM after the last selected field is unchecked', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__only', originalFieldName: 'only' })],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    const { rerender, onChange } = renderPicker(schema, ['b__only']);

    const fieldLabel = screen.getByText('only').closest('label');
    expect(fieldLabel).not.toBeNull();
    const fieldCheckbox = within(fieldLabel!).getByRole('checkbox');

    fireEvent.click(fieldCheckbox);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as string[];
    expect(next).not.toContain('b__only');

    rerender(<ReportColumnPicker dataMartId={DATA_MART_ID} value={next} onChange={() => {}} />);

    expect(screen.queryByText('Joined DM')).not.toBeInTheDocument();
    expect(screen.queryByText('only')).not.toBeInTheDocument();
  });
});

describe('ReportColumnPicker unresolved columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists selected columns missing from the schema in a Disconnected columns block', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'page__pageGroup' })],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, ['native_one', 'page_hash__pageGroup', 'page_hash__pagePath']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('page_hash__pageGroup')).toBeInTheDocument();
    expect(within(block as HTMLElement).getByText('page_hash__pagePath')).toBeInTheDocument();
  });

  it('removes an unresolved column from the report when its checkbox is unchecked', () => {
    const schema = buildSchema();

    const { onChange } = renderPicker(schema, ['native_one', 'gone__field']);

    const row = screen.getByText('gone__field').closest('label');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(['native_one']);
  });

  it('does not render the block when every selected column resolves against the schema', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__some_field' })],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, ['native_one', 'b__some_field']);

    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
  });

  it('treats hidden-for-reporting nested native fields as disconnected', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'native_one', type: 'STRING' },
        {
          name: 'user',
          type: 'RECORD',
          fields: [
            { name: 'email', type: 'STRING' },
            { name: 'secret_child', type: 'STRING', isHiddenForReporting: true },
          ],
        },
      ] as unknown[],
    });

    renderPicker(schema, ['native_one', 'user.email', 'user.secret_child']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('user.secret_child')).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('user.email')).not.toBeInTheDocument();
    expect(screen.getAllByText('user.secret_child')).toHaveLength(1);
  });

  it('treats DISCONNECTED native fields as disconnected columns', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'native_one', type: 'STRING' },
        { name: 'legacy', type: 'STRING', status: 'DISCONNECTED' },
      ] as unknown[],
    });

    renderPicker(schema, ['native_one', 'legacy']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('legacy')).toBeInTheDocument();
    expect(screen.getAllByText('legacy')).toHaveLength(1);
  });

  it('treats blended fields hidden in the joined data marts setup as disconnected', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__hidden_field',
          originalFieldName: 'hidden_field',
          isHidden: true,
        }),
        buildBlendedField({ name: 'b__visible_field', originalFieldName: 'visible_field' }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, ['native_one', 'b__hidden_field', 'b__visible_field']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('b__hidden_field')).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('b__visible_field')).not.toBeInTheDocument();
  });

  it('does not treat excluded-source blended fields as unresolved', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'c__excluded_field',
          originalFieldName: 'excluded_field',
          aliasPath: 'c',
          targetAlias: 'c',
          sourceRelationshipId: 'rel-c',
          sourceDataMartId: 'dm-c',
        }),
      ],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'c',
          relationshipId: 'rel-c',
          dataMartId: 'dm-c',
          isIncluded: false,
        }),
      ],
    });

    renderPicker(schema, ['native_one', 'c__excluded_field']);

    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
  });

  it('shows a filter-only reference to a missing column as a disconnected row with its filter', () => {
    const schema = buildSchema();
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [{ column: 'ghost__col', operator: 'eq', value: 'x' }] as never,
          sortConfig: [],
          limitConfig: null,
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: [],
        }}
        onOutputConfigChange={() => {}}
      />,
      { wrapper }
    );

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');
    const row = within(block as HTMLElement)
      .getByText('ghost__col')
      .closest('label');
    expect(row).not.toBeNull();
    const checkbox = within(row as HTMLElement).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(
      within(row as HTMLElement).getByRole('button', { name: 'Manage filters and slices' })
    ).toBeInTheDocument();
  });

  it('keeps a sort-only reference out of disconnected columns and removable in output settings', () => {
    const schema = buildSchema();
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const onOutputConfigChange = vi.fn();

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [],
          sortConfig: [{ column: 'ghost__sort', direction: 'asc' }],
          limitConfig: null,
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: [],
        }}
        onOutputConfigChange={onOutputConfigChange}
      />,
      { wrapper }
    );

    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));

    expect(screen.getByText('ghost__sort')).toBeInTheDocument();
    expect(screen.getByLabelText('Column not found in schema')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove sort' }));

    expect(onOutputConfigChange).toHaveBeenCalledWith({
      filterConfig: [],
      sortConfig: [],
      limitConfig: null,
      aggregationConfig: [],
      dateTruncConfig: [],
      uniqueCountConfig: [],
    });
  });

  it('flags filters on hidden blended fields as disconnected but not filters on known columns', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__hidden_field',
          originalFieldName: 'hidden_field',
          isHidden: true,
        }),
      ],
      availableSources: [buildAvailableSource()],
    });
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [
            { column: 'b__hidden_field', operator: 'eq', value: 'x' },
            { column: 'native_one', operator: 'eq', value: 'y' },
          ] as never,
          sortConfig: [],
          limitConfig: null,
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: [],
        }}
        onOutputConfigChange={() => {}}
      />,
      { wrapper }
    );

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('b__hidden_field')).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('native_one')).not.toBeInTheDocument();
  });

  it('flags pre-join slices on hidden joined fields as disconnected with the slice removable', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__hidden_field',
          originalFieldName: 'hidden_field',
          isHidden: true,
        }),
        buildBlendedField({ name: 'b__visible_field', originalFieldName: 'visible_field' }),
      ],
      availableSources: [buildAvailableSource()],
    });
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one', 'b__visible_field']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [
            {
              column: 'b__hidden_field',
              operator: 'eq',
              value: 'x',
              placement: 'pre-join',
            },
            {
              column: 'b__visible_field',
              operator: 'eq',
              value: 'y',
              placement: 'pre-join',
            },
          ],
          sortConfig: [],
          limitConfig: null,
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: [],
        }}
        onOutputConfigChange={() => {}}
      />,
      { wrapper }
    );

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    const row = within(block as HTMLElement)
      .getByText('b__hidden_field')
      .closest('label');
    expect(row).not.toBeNull();
    const checkbox = within(row as HTMLElement).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(
      within(row as HTMLElement).getByRole('button', { name: 'Manage filters and slices' })
    ).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('b__visible_field')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('2');
  });

  it('shows a neutral output controls count when all controls resolve', () => {
    const schema = buildSchema();

    renderPicker(schema, ['native_one'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [{ column: 'native_one', operator: 'eq', value: 'ok' }] as never,
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    expect(screen.getByLabelText('Output controls count')).toHaveTextContent('1');
    expect(screen.queryByLabelText('Disconnected output controls')).not.toBeInTheDocument();
  });

  it('does not mark output controls on inaccessible but known blended fields as disconnected', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__field', originalFieldName: 'field' })],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    renderPicker(schema, ['native_one'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [
          { column: 'b__field', operator: 'eq', value: 'x' },
          { column: 'b__field', operator: 'eq', value: 'y', placement: 'pre-join' },
        ],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    expect(screen.getByLabelText('Output controls count')).toHaveTextContent('2');
    expect(screen.queryByLabelText('Disconnected output controls')).not.toBeInTheDocument();
    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
  });

  it('counts unresolved columns in both selected and total', () => {
    const schema = buildSchema();
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const onCountChange = vi.fn();
    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        value={['native_one', 'gone__field']}
        onChange={() => {}}
        onCountChange={onCountChange}
      />,
      { wrapper }
    );

    expect(onCountChange).toHaveBeenLastCalledWith({ selected: 2, total: 2 });
  });
});

describe('ReportColumnPicker aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const aggSchema = () =>
    buildSchema({
      nativeFields: [
        { name: 'native_one', type: 'STRING' },
        { name: 'revenue', type: 'INTEGER' },
        { name: 'ordered_at', type: 'TIMESTAMP' },
      ] as unknown[],
    });

  it('AGG button badge counts aggregation + date-trunc only (Row Count excluded — automatic)', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue', 'ordered_at'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [{ column: 'native_one', operator: 'eq', value: 'x' }] as never,
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [
          { column: 'revenue', function: 'SUM' },
          { column: 'revenue', function: 'AVG' },
        ],
        dateTruncConfig: [{ column: 'ordered_at', unit: 'MONTH' }],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    // AGG badge = 2 aggregations + 1 date-trunc = 3 (Row Count is automatic, not counted).
    expect(screen.getByLabelText('Aggregations count')).toHaveTextContent('3');
    // Output controls badge counts only the filter (1), NOT aggregation.
    expect(screen.getByLabelText('Output controls count')).toHaveTextContent('1');
  });

  it('opens the AGG panel (with aggregation controls) on click; neither panel has a row-count toggle', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    // Output controls panel: no row-count toggle.
    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    expect(screen.queryByLabelText('Add a Row Count metric')).not.toBeInTheDocument();

    // AGG panel: no row-count toggle (Row Count is automatic).
    fireEvent.click(screen.getByRole('button', { name: 'Aggregations' }));
    expect(screen.queryByLabelText('Add a Row Count metric')).not.toBeInTheDocument();
  });

  it('shows a per-row AGG icon on a selected aggregatable field, hidden on an unselected one', () => {
    renderPicker(aggSchema(), ['revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    const selectedRow = screen.getByText('revenue').closest('label') as HTMLElement;
    expect(
      within(selectedRow).getByRole('button', { name: 'Add aggregation' })
    ).toBeInTheDocument();

    // ordered_at is NOT selected → no AGG icon on its row.
    const unselectedRow = screen.getByText('ordered_at').closest('label') as HTMLElement;
    expect(
      within(unselectedRow).queryByRole('button', { name: /aggregation/i })
    ).not.toBeInTheDocument();
  });

  it('materializes columnConfig to the explicit selection when an aggregation is applied while columns are implicit (null = all)', async () => {
    const { onChange } = renderPicker(aggSchema(), null, {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    // Apply SUM on the numeric `revenue` field via its per-row Σ.
    const revenueRow = screen.getByText('revenue').closest('label') as HTMLElement;
    fireEvent.click(within(revenueRow).getByRole('button', { name: 'Add aggregation' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'SUM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    // Backend rejects a null columnConfig with aggregations → the picker materializes the
    // implicit "all selected" to the explicit native column list so the report stays saveable.
    expect(onChange).toHaveBeenCalledWith(['native_one', 'revenue', 'ordered_at']);
  });

  it('emits columnConfig in the picker DISPLAY order, not the order fields were toggled on', () => {
    // Schema/display order is native_one, revenue, ordered_at. Start with an out-of-order
    // selection and toggle one more on — the emitted config must be re-sorted to display order.
    const { onChange } = renderPicker(aggSchema(), ['revenue', 'native_one'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
    });

    const row = screen.getByText('ordered_at').closest('label') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onChange).toHaveBeenLastCalledWith(['native_one', 'revenue', 'ordered_at']);
  });

  it('hides the per-row AGG icon when the field has an empty allowed-aggregation set', () => {
    const schema = buildSchema({
      nativeFields: [{ name: 'locked', type: 'INTEGER', allowedAggregations: [] }] as unknown[],
    });

    renderPicker(schema, ['locked'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    const row = screen.getByText('locked').closest('label') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /aggregation/i })).not.toBeInTheDocument();
  });

  it('renders AGG button before Output Controls button in DOM order', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    const aggBtn = screen.getByRole('button', { name: 'Aggregations' });
    const outputBtn = screen.getByRole('button', { name: 'Output controls' });
    expect(
      aggBtn.compareDocumentPosition(outputBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('applies blue class to Sigma icon when aggregations are present; no AGG text label', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        dateTruncConfig: [],
        uniqueCountConfig: [],
      },
      onOutputConfigChange: () => {},
    });

    const aggBtn = screen.getByRole('button', { name: 'Aggregations' });
    // Sigma svg has text-blue-500 when active.
    const sigmaIcon = aggBtn.querySelector('svg');
    expect(sigmaIcon).not.toBeNull();
    expect(sigmaIcon!.getAttribute('class')).toMatch(/text-blue-500/);
    // The "AGG" text label is gone.
    expect(
      Array.from(aggBtn.querySelectorAll('span')).find(el => el.textContent === 'AGG')
    ).toBeUndefined();
    // Badge count is visible.
    expect(screen.getByLabelText('Aggregations count')).toBeInTheDocument();
  });
});

/**
 * The Unique Count row container. Not `closest('label')`: the row only wraps its checkbox in a
 * label when it has no note — a note replaces the plain text with a focusable tooltip trigger,
 * which a label may not own alongside the checkbox.
 */
function uniqueCountRowOf(label: string): HTMLElement {
  return screen.getByText(label).closest('[data-slot="unique-count-row"]')!;
}

/**
 * A JOINED source's Unique Count row, addressed through its group. Every row reads a bare
 * `Unique Count` — the group header already names the source — so the label alone no longer tells
 * the main Data Mart's row from a joined one.
 */
function queryJoinedUniqueCountRowOf(groupAlias: string): HTMLElement | null {
  const header = screen.queryByRole('button', {
    name: new RegExp(`^(Collapse|Expand) ${groupAlias}$`),
  });
  return header?.parentElement?.querySelector('[data-slot="unique-count-row"]') ?? null;
}

function joinedUniqueCountRowOf(groupAlias: string): HTMLElement {
  return queryJoinedUniqueCountRowOf(groupAlias)!;
}

/** The joined row's checkbox — `getByRole` scoped to the row, since the name is no longer unique. */
function joinedUniqueCountCheckboxOf(groupAlias: string): HTMLElement {
  return within(joinedUniqueCountRowOf(groupAlias)).getByRole('checkbox');
}

/**
 * A configured output control shown in the Output controls dropdown, addressed by its column
 * label — which the picker row now shares verbatim, so plain `getByText` matches both.
 */
function outputControlChipOf(label: string): HTMLElement {
  return screen.getAllByText(label).find(node => !node.closest('[data-slot="unique-count-row"]'))!;
}

/**
 * The main mart's single unavailable hint. One message for every cause on purpose — see
 * MAIN_UNIQUE_COUNT_AVAILABILITY_VALUES.
 */
const MAIN_UNAVAILABLE_HINT =
  "No Primary Key is available for reporting in this Data Mart, so unique values can't be counted.\nReach your analyst to handle it";

/**
 * A JOINED source is diagnosed on the backend from the raw schema, so it still names the cause —
 * and, since the row's own label no longer does, it names the Data Mart whose key has to be fixed.
 */
const JOINED_NO_PK_HINT = 'Primary Key is not set for Orders.\nReach your analyst to handle it';

/**
 * A hint carries a line break between its cause and its call to action, and every text query
 * collapses whitespace — so it is matched against the raw text of a leaf node instead.
 */
const hintNode =
  (hint: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.textContent === hint && element.children.length === 0;

describe('ReportColumnPicker Unique Count virtual row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pkSchema = () =>
    buildSchema({
      nativeFields: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'name', type: 'STRING' },
      ] as unknown[],
    });

  const noPkSchema = () =>
    buildSchema({
      nativeFields: [
        { name: 'col_a', type: 'STRING' },
        { name: 'col_b', type: 'INTEGER' },
      ] as unknown[],
    });

  const baseOutputConfig: OutputConfig = {
    filterConfig: [],
    sortConfig: [],
    limitConfig: null,
    aggregationConfig: [],
    dateTruncConfig: [],
    uniqueCountConfig: [],
  };

  it('renders the Unique Count row when the schema has a PK field and outputControlsAvailable', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByText('Unique Count')).toBeInTheDocument();
  });

  it('renders the Unique Count label in the same monospace font as the native field rows', () => {
    // The native field rows (e.g. `field.name`) render in font-mono; the virtual
    // Unique Count row must not visually diverge from them (#6733.4 font fix).
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByText('Unique Count').className).toMatch(/font-mono/);
  });

  // Hidden would remove the only signal that explains WHY the metric is missing — the person
  // editing a report is rarely the one who can set a primary key.
  it('renders the Unique Count row DISABLED with a hint when the schema has no PK field', () => {
    renderPicker(noPkSchema(), ['col_a', 'col_b'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const row = uniqueCountRowOf('Unique Count');
    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    expect(checkbox).not.toBeDisabled();
    expect(screen.getByText(hintNode(MAIN_UNAVAILABLE_HINT))).toBeInTheDocument();
  });

  // `aria-disabled` keeps the control focusable, which is why it was chosen — but @owox/ui's
  // Checkbox styles only the real `disabled` attribute, so on its own the row looks fully active
  // and a sighted user gets a dead control with no explanation. Both halves must hold.
  it('renders the disabled row with the design system’s non-interactive styling', () => {
    renderPicker(noPkSchema(), ['col_a', 'col_b'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Unique Count' });
    // The bare utilities, not the `disabled:` variants the ui-kit Checkbox always carries — those
    // never apply without the attribute this row must not use.
    expect(checkbox.classList.contains('opacity-50')).toBe(true);
    expect(checkbox.classList.contains('cursor-not-allowed')).toBe(true);
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    expect(checkbox).not.toBeDisabled();
  });

  it('leaves an available row visually interactive', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Unique Count' });
    expect(checkbox.classList.contains('opacity-50')).toBe(false);
    expect(checkbox.classList.contains('cursor-not-allowed')).toBe(false);
  });

  // The hint is the DESCRIPTION, never part of the name: inside the <label> it would be announced
  // once as the name and again as the description.
  it('names the disabled main row and describes it with the hint, without mixing the two', () => {
    renderPicker(noPkSchema(), ['col_a'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Unique Count' });
    expect(checkbox).toHaveAccessibleName('Unique Count');
    expect(checkbox).toHaveAccessibleDescription(MAIN_UNAVAILABLE_HINT);
  });

  // The assertions above resolve against the always-present sr-only description, so they would
  // still pass if the tooltip never rendered. These two pin the tooltip itself — on hover, and
  // on keyboard focus, which is the path a sighted keyboard-only user has.
  it('opens the hint tooltip on hover', async () => {
    renderPicker(noPkSchema(), ['col_a'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const trigger = screen.getByRole('button', { name: 'Unique Count' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe(MAIN_UNAVAILABLE_HINT);
  });

  it('opens the hint tooltip on keyboard focus, and the trigger is reachable by Tab', async () => {
    renderPicker(noPkSchema(), ['col_a'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const trigger = screen.getByRole('button', { name: 'Unique Count' });
    // A native button: in the tab order without a tabindex of its own, and not `disabled`.
    expect(trigger).not.toBeDisabled();
    expect(trigger).not.toHaveAttribute('tabindex', '-1');

    fireEvent.focusIn(trigger);

    expect((await screen.findByRole('tooltip')).textContent).toBe(MAIN_UNAVAILABLE_HINT);
  });

  it('does not toggle the main Unique Count row while it is disabled', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(noPkSchema(), ['col_a'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    const row = uniqueCountRowOf('Unique Count');
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  // The main mart is governed by getReportablePrimaryKeyFields, which KEEPS a nested key — the backend
  // emits COUNT(DISTINCT user.id) for this mart today. (A joined source is governed by
  // collectPrimaryKeyRowIdentity, which rejects nested; the two rules must not be swapped.)
  const nestedPkSchema = () =>
    buildSchema({
      nativeFields: [
        {
          name: 'user',
          type: 'RECORD',
          fields: [{ name: 'id', type: 'STRING', isPrimaryKey: true }],
        },
      ] as unknown[],
    });

  it('keeps the Unique Count row ENABLED for a nested primary key', () => {
    renderPicker(nestedPkSchema(), ['user.id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Unique Count' });
    expect(checkbox).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText(/doesn't support the nested Primary Key/)).not.toBeInTheDocument();
  });

  it('toggles on for a nested primary key', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(nestedPkSchema(), ['user.id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Unique Count' }));

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] })
    );
  });

  // Silent-data-loss guard: pruning on open must not touch a saved config whose metric still runs.
  it('does not prune a saved main Unique Count on a nested-primary-key mart', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(nestedPkSchema(), ['user.id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  // getReportablePrimaryKeyFields prunes a hidden key, so the backend finds none and 400s on save —
  // offering the control would ship one the backend rejects.
  it('disables the row when the only primary key is hidden for reporting', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true, isHiddenForReporting: true },
        { name: 'name', type: 'STRING' },
      ] as unknown[],
    });

    renderPicker(schema, ['name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByRole('checkbox', { name: 'Unique Count' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText(hintNode(MAIN_UNAVAILABLE_HINT))).toBeInTheDocument();
  });

  // The three ways the main mart can withhold the metric must read the SAME, because the client
  // cannot tell them apart: `BlendableSchemaDto.nativeFields` arrives with hidden top-level fields
  // already stripped, so a hidden key looks exactly like no key at all. Naming a cause here used to
  // produce "Primary Key is not set" for a hidden top-level key and "…is disconnected" for a hidden
  // NESTED one — two different wrong explanations of one cause.
  it.each([
    [
      'a key hidden at the top level, as the payload actually arrives (backend already stripped it)',
      [{ name: 'name', type: 'STRING' }],
    ],
    [
      'a key hidden inside a nested record, which survives that stripping',
      [
        {
          name: 'user',
          type: 'RECORD',
          fields: [{ name: 'id', type: 'STRING', isPrimaryKey: true, isHiddenForReporting: true }],
        },
      ],
    ],
    [
      'a DISCONNECTED key',
      [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true, status: 'DISCONNECTED' },
        { name: 'name', type: 'STRING' },
      ],
    ],
  ])('gives one honest explanation for %s', (_case, nativeFields) => {
    renderPicker(buildSchema({ nativeFields: nativeFields as unknown[] }), ['name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByRole('checkbox', { name: 'Unique Count' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText(hintNode(MAIN_UNAVAILABLE_HINT))).toBeInTheDocument();
    expect(screen.queryByText(/Primary Key is not set/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Primary Key is disconnected/)).not.toBeInTheDocument();
  });

  it('does NOT render the Unique Count row when outputControlsAvailable is false (no onOutputConfigChange)', () => {
    renderPicker(pkSchema(), ['id', 'name']);

    expect(screen.queryByText('Unique Count')).not.toBeInTheDocument();
  });

  it('toggling the Unique Count checkbox calls onOutputConfigChange with uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE]', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    const row = uniqueCountRowOf('Unique Count');
    const checkbox = within(row).getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onOutputConfigChange).toHaveBeenCalledTimes(1);
    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] })
    );
  });

  it('toggling the Unique Count checkbox back calls onOutputConfigChange with uniqueCountConfig: []', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange,
    });

    const row = uniqueCountRowOf('Unique Count');
    const checkbox = within(row).getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onOutputConfigChange).toHaveBeenCalledTimes(1);
    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: [] })
    );
  });

  it('shows the Σ indicator (and no COUNT_DISTINCT text) when uniqueCountConfig is true', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange: vi.fn(),
    });

    const row = uniqueCountRowOf('Unique Count');
    // The metric Σ icon is shown (matching the other aggregated columns): a blue indicator
    // box (text-blue-500 like the native RowAggregationIcon) containing the Sigma svg…
    const indicator = row.querySelector('.text-blue-500');
    expect(indicator).not.toBeNull();
    expect(indicator!.querySelector('svg')).not.toBeNull();
    // …but the raw COUNT_DISTINCT function token is not surfaced.
    expect(screen.queryByText('COUNT_DISTINCT')).not.toBeInTheDocument();
  });

  it('does not show the Σ indicator when uniqueCountConfig is false', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [] },
      onOutputConfigChange: vi.fn(),
    });

    const row = uniqueCountRowOf('Unique Count');
    expect(row.querySelector('.text-blue-500')).toBeNull();
  });

  it('renders the Unique Count row at the bottom of the data mart fields (after the native fields)', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const uniqueRow = screen.getByText('Unique Count');
    const lastNativeField = screen.getByText('name');
    // Unique Count follows the native fields in DOM order (it sits at the bottom of the mart).
    expect(
      lastNativeField.compareDocumentPosition(uniqueRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('toggling Unique Count does NOT call onChange (column selection must not change)', () => {
    const onOutputConfigChange = vi.fn();
    const { onChange } = renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    const row = uniqueCountRowOf('Unique Count');
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onChange).not.toHaveBeenCalled();
    expect(onOutputConfigChange).toHaveBeenCalledTimes(1);
  });

  it('Unique Count row does not affect the native column count (selectedNativeCount / onCountChange)', () => {
    const onCountChange = vi.fn();
    renderPicker(pkSchema(), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange: vi.fn(),
      onCountChange,
    });

    // selectedNativeCount is 1 (only 'id' is selected), totalFieldsCount is 2 (id + name).
    // uniqueCountConfig:true must not inflate these counts.
    expect(onCountChange).toHaveBeenLastCalledWith({ selected: 1, total: 2 });
  });

  it('Unique Count row is NOT included in Select all', () => {
    const onOutputConfigChange = vi.fn();
    const { onChange } = renderPicker(pkSchema(), [], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    const masterCheckbox = screen.getByRole('checkbox', { name: 'Select all fields' });
    fireEvent.click(masterCheckbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    const selected = onChange.mock.calls[0][0] as string[];
    // Only real native field names, no virtual row
    expect(selected).not.toContain('Unique Count');
    expect(selected).toContain('id');
    expect(selected).toContain('name');
    // uniqueCountConfig must remain unchanged
    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  // The main row is a column offer like any other: it belongs to the same search and
  // "Show selected only" filters the field rows obey, and to the same emptiness check.
  describe('row visibility', () => {
    const search = (query: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
        target: { value: query },
      });
    };

    it('disappears when the search matches nothing', () => {
      renderPicker(pkSchema(), ['id', 'name'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig },
        onOutputConfigChange: vi.fn(),
      });

      search('zzz');

      expect(screen.queryByText('Unique Count')).not.toBeInTheDocument();
      expect(screen.getByText('No matching columns found.')).toBeInTheDocument();
    });

    it('is matchable by its own label', () => {
      renderPicker(pkSchema(), ['id', 'name'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig },
        onOutputConfigChange: vi.fn(),
      });

      search('unique');

      expect(screen.getByText('Unique Count')).toBeInTheDocument();
      expect(screen.queryByText('name')).not.toBeInTheDocument();
      // It is a visible column, so the empty-state message must not claim otherwise.
      expect(screen.queryByText('No matching columns found.')).not.toBeInTheDocument();
    });

    it('hides an UNCHECKED row under "Show selected only", like an unselected field', () => {
      renderPicker(pkSchema(), ['id', 'name'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('switch', { name: /Show selected only/i }));

      expect(screen.queryByText('Unique Count')).not.toBeInTheDocument();
    });

    it('keeps a CHECKED row under "Show selected only"', () => {
      renderPicker(pkSchema(), ['id', 'name'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('switch', { name: /Show selected only/i }));

      expect(screen.getByText('Unique Count')).toBeInTheDocument();
    });
  });

  it('keeps a sort by "Unique Count" connected (not disconnected) while the toggle is on', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.queryByLabelText('Disconnected output controls')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));

    expect(outputControlChipOf('Unique Count')).not.toHaveClass('line-through');
    expect(screen.queryByLabelText('Column not found in schema')).not.toBeInTheDocument();
  });

  it('flags a sort by "Unique Count" as disconnected once the toggle is off', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));

    expect(outputControlChipOf('Unique Count')).toHaveClass('line-through');
    expect(screen.getByLabelText('Column not found in schema')).toBeInTheDocument();
  });

  // Per-row icons reuse these accessible names, so scope to the FieldSearchPicker
  // trigger — it is the only one that opens a listbox.
  const openPicker = (name: RegExp) => {
    const trigger = screen
      .getAllByRole('button', { name })
      .find(b => b.getAttribute('aria-haspopup') === 'listbox');
    fireEvent.click(trigger!);
  };

  // Unique Count is sortable ONLY. It is not a real projected column, so a filter or an
  // aggregation on it would be rejected by backend validation — it must never be offered
  // in those pickers, even while the toggle is on.
  it('offers "Unique Count" in the Add sort by picker while the toggle is on', async () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Unique Count')).toBeInTheDocument();
  });

  it('does NOT offer "Unique Count" in the Add filter picker while the toggle is on', async () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add filter/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('id')).toBeInTheDocument();
    expect(within(listbox).queryByText('Unique Count')).not.toBeInTheDocument();
  });

  it('does NOT offer "Unique Count" in the Add aggregation picker while the toggle is on', async () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aggregations' }));
    openPicker(/Add aggregation/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('id')).toBeInTheDocument();
    expect(within(listbox).queryByText('Unique Count')).not.toBeInTheDocument();
  });

  // A real schema field can legitimately be named "Unique Count" (quoted identifiers on
  // Snowflake/Redshift/Athena allow spaces) — the backend has a dedicated
  // OUTPUT_COLUMN_NAME_COLLISION error for exactly this. The synthetic-metric special
  // cases must not hijack the name from a real field that owns it.
  const collisionSchema = () =>
    buildSchema({
      nativeFields: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'Unique Count', type: 'STRING' },
      ] as unknown[],
    });

  it('does not flag a sort on a REAL field named "Unique Count" as disconnected when the toggle is off', () => {
    renderPicker(collisionSchema(), ['id', 'Unique Count'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [],
        sortConfig: [{ column: 'Unique Count', direction: 'asc' }],
      },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.queryByLabelText('Disconnected output controls')).not.toBeInTheDocument();
  });

  it('still flags a sort on an UNSELECTED real field named "Unique Count" when the toggle is off', () => {
    renderPicker(collisionSchema(), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [],
        sortConfig: [{ column: 'Unique Count', direction: 'asc' }],
      },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');
  });

  it('does not offer a duplicate "Unique Count" entry when a real field already owns the name', async () => {
    renderPicker(collisionSchema(), ['id', 'Unique Count'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByText('Unique Count')).toHaveLength(1);
  });

  // An UNSELECTED real field owning the name would make `ORDER BY "Unique Count"` ambiguous
  // between the outer alias and the base column, so the synthetic is suppressed there too.
  it('does not offer the synthetic when an UNSELECTED real field owns the name', async () => {
    renderPicker(collisionSchema(), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByText('Unique Count')).not.toBeInTheDocument();
  });

  // The badge and the sort row must agree: when the synthetic is suppressed because a real
  // field owns the name, an unselected real field's rule is genuinely broken and both the
  // struck-through row and the badge must say so.
  it('reports a sort as disconnected when the synthetic is suppressed by an UNSELECTED real field', () => {
    renderPicker(collisionSchema(), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    expect(screen.getByLabelText('Column not found in schema')).toBeInTheDocument();
  });

  // The PK-loss auto-heal must prune the stranded sort rule in the SAME update that clears
  // the flag — otherwise validateSort rejects the leftover rule on every save and run.
  it('prunes a stranded "Unique Count" sort rule when the schema loses its primary key', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(noPkSchema(), ['col_a'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE],
        sortConfig: [
          { column: 'col_a', direction: 'asc' },
          { column: 'Unique Count', direction: 'desc' },
        ],
      },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueCountConfig: [],
        sortConfig: [{ column: 'col_a', direction: 'asc' }],
      }),
      { isRepair: true, changed: ['uniqueCountConfig', 'sortConfig'] }
    );
  });

  it('leaves a "Unique Count" sort rule alone on PK loss when a real field owns the name', () => {
    const onOutputConfigChange = vi.fn();
    const schema = buildSchema({
      nativeFields: [
        { name: 'col_a', type: 'STRING' },
        { name: 'Unique Count', type: 'STRING' },
      ] as unknown[],
    });
    renderPicker(schema, ['col_a', 'Unique Count'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      },
      onOutputConfigChange,
    });

    // The flag is still cleared (no PK), but the real field's sort rule survives.
    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueCountConfig: [],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      }),
      { isRepair: true, changed: ['uniqueCountConfig'] }
    );
  });
});

describe('ReportColumnPicker Unique Count per joined source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseOutputConfig: OutputConfig = {
    filterConfig: [],
    sortConfig: [],
    limitConfig: null,
    aggregationConfig: [],
    dateTruncConfig: [],
    uniqueCountConfig: [],
  };

  const joinedSource = (
    aliasPath: string,
    displayName: string,
    uniqueCountAvailability: JoinedUniqueCountAvailability
  ) =>
    buildAvailableSource({
      aliasPath,
      title: displayName,
      defaultAlias: displayName,
      relationshipId: `rel-${aliasPath}`,
      dataMartId: `dm-${aliasPath}`,
      uniqueCountAvailability,
    });

  const joinedField = (aliasPath: string, displayName: string) =>
    buildBlendedField({
      name: `${aliasPath}__amount`,
      originalFieldName: 'amount',
      aliasPath,
      targetAlias: aliasPath,
      outputPrefix: displayName,
      sourceRelationshipId: `rel-${aliasPath}`,
      sourceDataMartId: `dm-${aliasPath}`,
      sourceDataMartTitle: displayName,
    });

  const withJoinedSource = (uniqueCountAvailability: JoinedUniqueCountAvailability) =>
    buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [joinedField('orders', 'Orders')],
      availableSources: [joinedSource('orders', 'Orders', uniqueCountAvailability)],
    });

  const withTwoJoinedSources = (
    first: JoinedUniqueCountAvailability,
    second: JoinedUniqueCountAvailability
  ) =>
    buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [joinedField('orders', 'Orders'), joinedField('products', 'Products')],
      availableSources: [
        joinedSource('orders', 'Orders', first),
        joinedSource('products', 'Products', second),
      ],
    });

  // A group already open (a selected field, or its Unique Count on) has no Expand button.
  const expandGroup = (name: string) => {
    const toggle = screen.queryByRole('button', { name: `Expand ${name}` });
    if (toggle) fireEvent.click(toggle);
  };

  it('shows a Unique Count row named after the source inside its joined group', () => {
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expandGroup('Orders');

    expect(joinedUniqueCountRowOf('Orders')).toBeInTheDocument();
  });

  it('shows a disabled Unique Count row with a hint when the joined source has no primary key', () => {
    renderPicker(withJoinedSource('no-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expandGroup('Orders');

    const row = joinedUniqueCountRowOf('Orders');
    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    // NOT the `disabled` attribute: a disabled control cannot take focus, so the hint would
    // never reach the keyboard and screen-reader users who most need it.
    expect(checkbox).not.toBeDisabled();
    expect(screen.getByText(hintNode(JOINED_NO_PK_HINT))).toBeInTheDocument();
  });

  // A business user will not go and set a primary key themselves, so the row sends them nowhere.
  // The trigger stays a focusable button, which is what keeps the hint reachable without a mouse.
  it('sends the user nowhere — no Data Setup link on either row', () => {
    renderPicker(withJoinedSource('no-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expandGroup('Orders');

    expect(screen.queryByRole('link')).toBeNull();
    expect(within(joinedUniqueCountRowOf('Orders')).getByRole('button')).toBeInTheDocument();
  });

  it("hints that a disconnected primary key can't be counted", () => {
    renderPicker(withJoinedSource('disconnected-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expandGroup('Orders');

    expect(
      screen.getByText(
        hintNode(
          "Part of the Primary Key of Orders is disconnected, so unique values can't be counted.\nReach your analyst to handle it"
        )
      )
    ).toBeInTheDocument();
  });

  it('hints that a nested primary key is unsupported', () => {
    renderPicker(withJoinedSource('nested-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expandGroup('Orders');

    expect(
      screen.getByText(
        hintNode(
          "Unique Count doesn't support the nested Primary Key of Orders.\nReach your analyst to handle it"
        )
      )
    ).toBeInTheDocument();
  });

  it('adds the source alias path to uniqueCountConfig when the row is checked', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    expandGroup('Orders');
    const row = joinedUniqueCountRowOf('Orders');
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: ['orders'] })
    );
  });

  it('removes only that source when its row is unchecked', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withTwoJoinedSources('available', 'available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'orders', 'products'],
      },
      onOutputConfigChange,
    });

    expandGroup('Orders');
    const row = joinedUniqueCountRowOf('Orders');
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'products'] })
    );
  });

  it('does not toggle a disabled joined Unique Count row', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withJoinedSource('no-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    expandGroup('Orders');
    const row = joinedUniqueCountRowOf('Orders');
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  // A naive "clear everything" passes the single-source case and silently wipes the rest.
  it('prunes only the source that lost its primary key', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withTwoJoinedSources('available', 'no-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'orders', 'products'],
      },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'orders'] }),
      { isRepair: true, changed: ['uniqueCountConfig'] }
    );
  });

  it('prunes a source that disappeared from the schema entirely', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders', 'deleted_source'] },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: ['orders'] }),
      { isRepair: true, changed: ['uniqueCountConfig'] }
    );
  });

  // Pruning is for a source the SCHEMA lost; an exclusion is reversible, so the selection must
  // outlive it — the row keeps rendering so the user can clear it instead (see row visibility).
  it('keeps a source that is merely excluded from reporting', () => {
    const onOutputConfigChange = vi.fn();
    const schema = buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [joinedField('orders', 'Orders')],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'orders',
          title: 'Orders',
          defaultAlias: 'Orders',
          relationshipId: 'rel-orders',
          dataMartId: 'dm-orders',
          isIncluded: false,
          uniqueCountAvailability: 'available',
        }),
      ],
    });

    renderPicker(schema, ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  // Opening a report must not stage a deletion behind the user's back. The repair still happens —
  // a stale rule genuinely cannot run — but it is flagged, so the form applies it without marking
  // itself dirty and raising an "unsaved changes" guard on a form nobody touched.
  describe('repair is not a user edit', () => {
    it('flags a pruned source as a repair', () => {
      const onOutputConfigChange = vi.fn();
      renderPicker(withJoinedSource('no-primary-key'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange,
      });

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: [] }),
        { isRepair: true, changed: ['uniqueCountConfig'] }
      );
    });

    it('flags a pruned stranded sort rule as a repair', () => {
      const onOutputConfigChange = vi.fn();
      renderPicker(withJoinedSource('no-primary-key'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: {
          ...baseOutputConfig,
          uniqueCountConfig: ['orders'],
          sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
        },
        onOutputConfigChange,
      });

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: [], sortConfig: [] }),
        { isRepair: true, changed: ['uniqueCountConfig', 'sortConfig'] }
      );
    });

    it('does NOT flag a real toggle, so a user edit still dirties the form', () => {
      const onOutputConfigChange = vi.fn();
      renderPicker(withJoinedSource('available'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig },
        onOutputConfigChange,
      });

      expandGroup('Orders');
      const row = joinedUniqueCountRowOf('Orders');
      fireEvent.click(within(row).getByRole('checkbox'));

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: ['orders'] })
      );
    });
  });

  it('leaves a fully available config alone (no update loop)', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withTwoJoinedSources('available', 'available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'orders', 'products'],
      },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  // A value this bundle cannot read is not evidence AGAINST the metric — it is most likely a state
  // added after the bundle shipped, and a stale cached payload is enough to serve one. Pruning on it
  // destroys a selection the user cannot get back, so only a RECOGNISED failure may remove one.
  describe('unrecognised availability', () => {
    const UNKNOWN = 'binary-primary-key' as JoinedUniqueCountAvailability;

    it('keeps a stored Unique Count whose availability value it cannot read', () => {
      const onOutputConfigChange = vi.fn();
      renderPicker(withJoinedSource(UNKNOWN), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: {
          ...baseOutputConfig,
          uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'orders'],
        },
        onOutputConfigChange,
      });

      expect(onOutputConfigChange).not.toHaveBeenCalled();
    });

    // The realistic trigger: a payload cached before the field existed, replayed after a deploy.
    it('keeps a stored Unique Count when the payload omits uniqueCountAvailability entirely', () => {
      const onOutputConfigChange = vi.fn();
      renderPicker(
        withJoinedSource(undefined as unknown as JoinedUniqueCountAvailability),
        ['id'],
        {
          storageType: DataStorageType.GOOGLE_BIGQUERY,
          outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
          onOutputConfigChange,
        }
      );

      expect(onOutputConfigChange).not.toHaveBeenCalled();
    });

    it('keeps the sort rule of a source whose availability value it cannot read', () => {
      const onOutputConfigChange = vi.fn();
      renderPicker(withJoinedSource(UNKNOWN), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: {
          ...baseOutputConfig,
          uniqueCountConfig: ['orders'],
          sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
        },
        onOutputConfigChange,
      });

      expect(onOutputConfigChange).not.toHaveBeenCalled();
    });

    // Neither an active row nor a disabled one is honest here: the client cannot promise the metric
    // will run, and cannot name a cause for withholding it. Making no offer is the only truthful
    // option — and it costs nothing, because a STORED selection still renders (next test).
    it('makes no offer on a source whose verdict it cannot read', () => {
      renderPicker(
        withJoinedSource(undefined as unknown as JoinedUniqueCountAvailability),
        ['id'],
        {
          storageType: DataStorageType.GOOGLE_BIGQUERY,
          outputConfig: { ...baseOutputConfig },
          onOutputConfigChange: vi.fn(),
        }
      );

      expandGroup('Orders');

      // By accessible name, which carries the source: the report's own Data Mart still offers its
      // own Unique Count, and that row must not be mistaken for this one.
      expect(
        screen.queryByRole('checkbox', { name: 'Unique Count (Orders)' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(hintNode(JOINED_NO_PK_HINT))).not.toBeInTheDocument();
    });

    it('still shows a stored Unique Count as checked', () => {
      renderPicker(withJoinedSource(UNKNOWN), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      expect(joinedUniqueCountCheckboxOf('Orders')).toBeChecked();
    });
  });

  // Each source's metric owns its own sort name, so losing one must not touch another's rule.
  it('keeps the main Unique Count sort rule when only a joined source is pruned', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withJoinedSource('no-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'orders'],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE],
        sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      }),
      { isRepair: true, changed: ['uniqueCountConfig'] }
    );
  });

  // Per-row icons reuse these accessible names, so scope to the FieldSearchPicker trigger —
  // it is the only one that opens a listbox.
  const openPicker = (name: RegExp) => {
    const trigger = screen
      .getAllByRole('button', { name })
      .find(b => b.getAttribute('aria-haspopup') === 'listbox');
    fireEvent.click(trigger!);
  };

  // Sort ONLY: the ORDER BY resolves to the outer SELECT alias the sleeve emits. A filter or an
  // aggregation on it has no column to bind to and the backend still rejects both.
  it('offers a joined Unique Count in the sort picker under its display label', async () => {
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Unique Count')).toBeInTheDocument();
  });

  it('stores the SQL-safe name, never the display label, in the sort rule', async () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Unique Count'));

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        sortConfig: [{ column: 'orders__unique_count', direction: 'asc' }],
      })
    );
  });

  // `a.b` and a top-level `a_b` build ONE SQL name. The backend refuses that save with
  // OUTPUT_COLUMN_NAME_COLLISION, but the picker renders first — and two entries under one
  // `key={item.value}` took FieldSearchPicker down through the error boundary before the user
  // could ever read the message.
  it('offers a colliding synthetic sort name once, not twice under the same key', async () => {
    const schema = buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [joinedField('a.b', 'Nested'), joinedField('a_b', 'Flat')],
      availableSources: [
        joinedSource('a.b', 'Nested', 'available'),
        joinedSource('a_b', 'Flat', 'available'),
      ],
    });
    renderPicker(schema, ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['a.b', 'a_b'] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    const offered = within(listbox)
      .queryAllByText(/Unique Count$/)
      .map(n => n.textContent);
    expect(offered).toEqual(['Unique Count']);
  });

  // `getBlendableSchema` CASTS its response, so a payload missing an array reaches the picker as
  // `undefined` and an unguarded `for…of` takes the whole editor down through the error boundary.
  // Rendered through the REAL query function — the normalization lives there, and pre-seeding the
  // cache the way `renderPicker` does would skip the very code under test.
  it('renders when the payload carries no availableSources at all', async () => {
    const schema = buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
    });
    delete (schema as Partial<BlendableSchema>).availableSources;
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReportColumnPicker
          dataMartId={DATA_MART_ID}
          value={['id']}
          onChange={vi.fn()}
          storageType={DataStorageType.GOOGLE_BIGQUERY}
          outputConfig={{ ...baseOutputConfig, uniqueCountConfig: ['orders'] }}
          onOutputConfigChange={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(await screen.findByText('id')).toBeInTheDocument();
  });

  // A dotted alias path must reach SQL as underscores; the free-form display prefix must not
  // reach it at all (`GA4.Events Unique Count` is not a legal identifier anywhere).
  it('derives a NESTED source’s sort name from its alias path, not its display prefix', async () => {
    const schema = buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [joinedField('orders.items', 'GA4.Events')],
      availableSources: [joinedSource('orders.items', 'GA4.Events', 'available')],
    });
    const onOutputConfigChange = vi.fn();
    renderPicker(schema, ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders.items'] },
      onOutputConfigChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Unique Count'));

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        sortConfig: [{ column: 'orders_items__unique_count', direction: 'asc' }],
      })
    );
  });

  // The group header already names the source, so repeating it on the row wastes the width the
  // label has. The casing stays `Unique Count` — it is the shipped main-mart metric, the SQL alias
  // and the sort chip, and renaming it would orphan saved sorts.
  describe('picker row label', () => {
    it('renders a bare Unique Count row inside the joined group', () => {
      renderPicker(withJoinedSource('available'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      expect(joinedUniqueCountRowOf('Orders')).toHaveTextContent(/^Unique Count$/);
      // Both rows — the main Data Mart's and the joined source's — under one bare label.
      expect(screen.getAllByLabelText('Unique Count')).toHaveLength(2);
    });
  });

  // Every other picker entry names its field on line 1 and its Data Mart on line 2, and carries its
  // full alias path in the hover tree. Two joins to the SAME Data Mart share a display alias, so
  // the path is the ONLY thing that tells their entries apart.
  describe('sort entry identity', () => {
    const sameDataMartTwice = () =>
      buildSchema({
        nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
        blendedFields: [joinedField('orders', 'Orders'), joinedField('refunds', 'Orders')],
        availableSources: [
          // Two joins to ONE Data Mart with one display alias: only the alias path separates them.
          buildAvailableSource({
            aliasPath: 'orders',
            title: 'Orders',
            defaultAlias: 'Orders',
            relationshipId: 'rel-orders',
            dataMartId: 'dm-orders',
            uniqueCountAvailability: 'available',
          }),
          buildAvailableSource({
            aliasPath: 'refunds',
            title: 'Orders',
            defaultAlias: 'Orders',
            relationshipId: 'rel-refunds',
            dataMartId: 'dm-orders',
            uniqueCountAvailability: 'available',
          }),
        ],
      });

    it('names the source Data Mart on the second line, like an ordinary joined field', async () => {
      renderPicker(withJoinedSource('available'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
      openPicker(/Add sort by/);

      const listbox = await screen.findByRole('listbox');
      const entry = within(listbox).getByText('Unique Count').closest('[role="option"]')!;
      expect(within(entry as HTMLElement).getByText('Orders')).toBeInTheDocument();
    });

    it('tells two joins to the same Data Mart apart by their alias path', async () => {
      renderPicker(sameDataMartTwice(), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders', 'refunds'] },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
      openPicker(/Add sort by/);

      const listbox = await screen.findByRole('listbox');
      // Both entries read the same two lines; only the hover tree separates them.
      const entries = within(listbox).getAllByText('Unique Count');
      expect(entries).toHaveLength(2);

      fireEvent.pointerMove(entries[1].parentElement!, { pointerType: 'mouse' });

      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent('refunds');
    });

    // A relationship saved without a display alias has no name to put on the second line; the
    // joined Data Mart's own title is what an ordinary joined field falls back to as well.
    it('falls back to the joined Data Mart title when the display alias is blank', async () => {
      const blankAlias = buildSchema({
        nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
        blendedFields: [joinedField('orders', 'Orders DM')],
        availableSources: [
          buildAvailableSource({
            aliasPath: 'orders',
            title: 'Orders DM',
            defaultAlias: '',
            relationshipId: 'rel-orders',
            dataMartId: 'dm-orders',
            uniqueCountAvailability: 'available',
          }),
        ],
      });

      renderPicker(blankAlias, ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
      openPicker(/Add sort by/);

      const listbox = await screen.findByRole('listbox');
      const entry = within(listbox).getByText('Unique Count').closest('[role="option"]')!;
      expect(within(entry as HTMLElement).getByText('Orders DM')).toBeInTheDocument();
    });
  });

  it('shows a stored joined Unique Count sort under its display label, not as disconnected', () => {
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: ['orders'],
        sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
      },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.queryByLabelText('Disconnected output controls')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));

    const sortRow = screen
      .getByRole('button', { name: 'Toggle direction (currently desc)' })
      .closest('div')!;
    expect(within(sortRow).getByText('Unique Count')).not.toHaveClass('line-through');
    expect(screen.queryByLabelText('Column not found in schema')).not.toBeInTheDocument();
  });

  it('flags a joined Unique Count sort as disconnected once its source is unticked', () => {
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: [],
        sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
      },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));

    expect(screen.getByLabelText('Column not found in schema')).toBeInTheDocument();
  });

  // The backend drops an EXCLUDED source's metric before rendering the SELECT, so a sort on it
  // would order by an alias that is not there — it must not be offered.
  it('does not offer the sort for an EXCLUDED source whose Unique Count is still stored', async () => {
    const schema = buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [joinedField('orders', 'Orders')],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'orders',
          title: 'Orders',
          defaultAlias: 'Orders',
          relationshipId: 'rel-orders',
          dataMartId: 'dm-orders',
          isIncluded: false,
          uniqueCountAvailability: 'available',
        }),
      ],
    });

    renderPicker(schema, ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByText('Unique Count')).not.toBeInTheDocument();
  });

  it('does NOT offer a joined Unique Count in the Add filter picker', async () => {
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add filter/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('id')).toBeInTheDocument();
    expect(within(listbox).queryByText('Unique Count')).not.toBeInTheDocument();
  });

  it('does NOT offer a joined Unique Count in the Add aggregation picker', async () => {
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aggregations' }));
    openPicker(/Add aggregation/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('id')).toBeInTheDocument();
    expect(within(listbox).queryByText('Unique Count')).not.toBeInTheDocument();
  });

  // `buildJoinedUniqueCountColumnName('orders')` is byte-identical to the unified name of a real
  // field called `unique_count` on `orders`; the real field owns it and the backend guards the
  // collision, so the synthetic must step aside exactly as it does for the main metric.
  it('suppresses the synthetic entry when a real field owns the source’s SQL name', async () => {
    const schema = buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'orders__unique_count',
          originalFieldName: 'unique_count',
          aliasPath: 'orders',
          targetAlias: 'orders',
          outputPrefix: 'Orders',
          sourceRelationshipId: 'rel-orders',
          sourceDataMartId: 'dm-orders',
          sourceDataMartTitle: 'Orders',
        }),
      ],
      availableSources: [joinedSource('orders', 'Orders', 'available')],
    });

    renderPicker(schema, ['id', 'orders__unique_count'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    openPicker(/Add sort by/);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('unique_count')).toBeInTheDocument();
    expect(within(listbox).queryByText('Unique Count')).not.toBeInTheDocument();
  });

  // Exclusion is reversible, and nothing downstream needs the rule gone: the validator adds every
  // CONFIGURED source to the selected set regardless of emittability, and the run path drops the
  // rule in memory per run without persisting. Pruning here would delete, on mere editor open and
  // with no dirty flag to warn anyone, a rule the user cannot restore by re-including the source.
  it('keeps the sort rule of a source that is excluded but still keyed', () => {
    const onOutputConfigChange = vi.fn();
    const schema = buildSchema({
      nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
      blendedFields: [joinedField('orders', 'Orders')],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'orders',
          title: 'Orders',
          defaultAlias: 'Orders',
          relationshipId: 'rel-orders',
          dataMartId: 'dm-orders',
          isIncluded: false,
          uniqueCountAvailability: 'available',
        }),
      ],
    });

    renderPicker(schema, ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: ['orders'],
        sortConfig: [
          { column: 'id', direction: 'asc' },
          { column: 'orders__unique_count', direction: 'desc' },
        ],
      },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  it('prunes a stranded joined Unique Count sort rule when its source loses its primary key', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(withJoinedSource('no-primary-key'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        ...baseOutputConfig,
        uniqueCountConfig: ['orders'],
        sortConfig: [
          { column: 'id', direction: 'asc' },
          { column: 'orders__unique_count', direction: 'desc' },
        ],
      },
      onOutputConfigChange,
    });

    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueCountConfig: [],
        sortConfig: [{ column: 'id', direction: 'asc' }],
      }),
      { isRepair: true, changed: ['uniqueCountConfig', 'sortConfig'] }
    );
  });

  it('does not count the joined Unique Count row as a selectable column', () => {
    const onCountChange = vi.fn();
    renderPicker(withJoinedSource('available'), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange: vi.fn(),
      onCountChange,
    });

    // native `id` selected out of native `id` + joined `orders__amount`.
    expect(onCountChange).toHaveBeenLastCalledWith({ selected: 1, total: 2 });
  });

  it('is NOT included in Select all', () => {
    const onOutputConfigChange = vi.fn();
    const { onChange } = renderPicker(withJoinedSource('available'), [], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all fields' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(['id', 'orders__amount']);
    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });

  // A brand-new report starts with columnConfig null ("all native columns"), which the blended
  // builder rejects — the report saved fine and then failed every run.
  describe('implicit column projection', () => {
    it('materializes the column list when a JOINED Unique Count is enabled on a null selection', () => {
      const onOutputConfigChange = vi.fn();
      const { onChange } = renderPicker(withJoinedSource('available'), null, {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig },
        onOutputConfigChange,
      });

      expandGroup('Orders');
      const row = joinedUniqueCountRowOf('Orders');
      fireEvent.click(within(row).getByRole('checkbox'));

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: ['orders'] })
      );
      expect(onChange).toHaveBeenCalledWith(['id']);
    });

    // The same state reaches the picker without anyone toggling anything: a report created through
    // the API or MCP with uniqueCountConfig ['orders'] and columnConfig null opens fine, and then
    // the save is refused with JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG — naming a projection the
    // user never saw and cannot produce from this editor (#6792).
    it('materializes the column list for a STORED joined Unique Count on open', async () => {
      const onOutputConfigChange = vi.fn();
      const { onChange } = renderPicker(withJoinedSource('available'), null, {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange,
      });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(['id'], { isRepair: true });
      });
      // The repair is the projection alone — the stored selection is valid and must not be rewritten.
      expect(onOutputConfigChange).not.toHaveBeenCalled();
    });

    it('leaves a stored MAIN-only Unique Count on a null selection untouched', async () => {
      const onOutputConfigChange = vi.fn();
      const { onChange } = renderPicker(withJoinedSource('available'), null, {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] },
        onOutputConfigChange,
      });

      await waitFor(() => {
        expect(screen.getByText('Unique Count')).toBeInTheDocument();
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    // A source pruned for losing its key takes the requirement with it: materializing a projection
    // for a metric that is about to be dropped would stage a change the report does not need.
    it('does not materialize for a stored source the repair is dropping anyway', async () => {
      const onOutputConfigChange = vi.fn();
      const { onChange } = renderPicker(withJoinedSource('no-primary-key'), null, {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange,
      });

      await waitFor(() => {
        expect(onOutputConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({ uniqueCountConfig: [] }),
          { isRepair: true, changed: ['uniqueCountConfig'] }
        );
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaves the null selection alone for the MAIN Unique Count (it needs no projection)', () => {
      const onOutputConfigChange = vi.fn();
      const { onChange } = renderPicker(withJoinedSource('available'), null, {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig },
        onOutputConfigChange,
      });

      const row = uniqueCountRowOf('Unique Count');
      fireEvent.click(within(row).getByRole('checkbox'));

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE] })
      );
      expect(onChange).not.toHaveBeenCalled();
    });

    // Turning one OFF adds no projection of its own. The single `onChange` here is the repair the
    // stored source already triggered on open — a report in this state cannot be saved without it,
    // and it is flagged `isRepair`, so it neither dirties the form nor stages an edit.
    it('adds no further projection when a joined Unique Count is turned OFF', async () => {
      const onOutputConfigChange = vi.fn();
      const { onChange } = renderPicker(withJoinedSource('available'), null, {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange,
      });
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(1);
      });

      expandGroup('Orders');
      const row = joinedUniqueCountRowOf('Orders');
      fireEvent.click(within(row).getByRole('checkbox'));

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: [] })
      );
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(['id'], { isRepair: true });
    });
  });

  // The row belongs to the SOURCE, not to a field of it, so it must not vanish with the field list.
  describe('row visibility', () => {
    it('stays visible under "Show selected only" with no selected field from that source', () => {
      renderPicker(withJoinedSource('available'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('switch', { name: /Show selected only/i }));

      expandGroup('Orders');
      expect(joinedUniqueCountRowOf('Orders')).toBeInTheDocument();
      expect(screen.queryByText('amount')).not.toBeInTheDocument();
    });

    it('is matchable in search by its own label', () => {
      renderPicker(withJoinedSource('available'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
        target: { value: 'unique count' },
      });

      expect(joinedUniqueCountRowOf('Orders')).toBeInTheDocument();
      expect(screen.queryByText('amount')).not.toBeInTheDocument();
    });

    it('is dropped from a group the search matched by field name only', () => {
      renderPicker(withJoinedSource('available'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
        target: { value: 'amount' },
      });

      expect(screen.getByText('amount')).toBeInTheDocument();
      expect(queryJoinedUniqueCountRowOf('Orders')).toBeNull();
    });

    // An excluded source contributes no field row, so without this the stored selection has
    // nothing to clear it with while the backend silently drops the metric.
    it('renders a clearable row for an EXCLUDED source whose Unique Count is still stored', () => {
      const onOutputConfigChange = vi.fn();
      const schema = buildSchema({
        nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
        blendedFields: [joinedField('orders', 'Orders')],
        availableSources: [
          buildAvailableSource({
            aliasPath: 'orders',
            title: 'Orders',
            defaultAlias: 'Orders',
            relationshipId: 'rel-orders',
            dataMartId: 'dm-orders',
            isIncluded: false,
            uniqueCountAvailability: 'available',
          }),
        ],
      });

      renderPicker(schema, ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange,
      });

      const row = joinedUniqueCountRowOf('Orders');
      fireEvent.click(within(row).getByRole('checkbox'));

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: [] })
      );
    });

    it('offers no row for an EXCLUDED source that has no stored Unique Count', () => {
      const schema = buildSchema({
        nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
        blendedFields: [joinedField('orders', 'Orders')],
        availableSources: [
          buildAvailableSource({
            aliasPath: 'orders',
            title: 'Orders',
            defaultAlias: 'Orders',
            relationshipId: 'rel-orders',
            dataMartId: 'dm-orders',
            isIncluded: false,
            uniqueCountAvailability: 'available',
          }),
        ],
      });

      renderPicker(schema, ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig },
        onOutputConfigChange: vi.fn(),
      });

      expect(queryJoinedUniqueCountRowOf('Orders')).toBeNull();
    });
  });

  // Keeping the config entry of an excluded source is deliberate (the exclusion is reversible),
  // but the backend drops its sleeve — so the row must not read as a live selection. Rendered as
  // a normal ticked row it promises a column the next scheduled run will not write.
  describe('a source whose metric is not emitted', () => {
    const NOT_EMITTED_NOTE =
      'This Data Mart is not allowed for reporting, so this column is not generated. Allow it for reporting again, or clear this row.';

    const excludedSchema = () =>
      buildSchema({
        nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }] as unknown[],
        blendedFields: [joinedField('orders', 'Orders')],
        availableSources: [
          buildAvailableSource({
            aliasPath: 'orders',
            title: 'Orders',
            defaultAlias: 'Orders',
            relationshipId: 'rel-orders',
            dataMartId: 'dm-orders',
            isIncluded: false,
            uniqueCountAvailability: 'available',
          }),
        ],
      });

    const renderExcluded = () =>
      renderPicker(excludedSchema(), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

    it('describes the checked row as not generated instead of leaving it unexplained', () => {
      renderExcluded();

      const checkbox = joinedUniqueCountCheckboxOf('Orders');
      expect(checkbox).toBeChecked();
      expect(checkbox).toHaveAccessibleDescription(NOT_EMITTED_NOTE);
    });

    it('marks the row visually instead of styling it like a live selection', () => {
      renderExcluded();

      const row = joinedUniqueCountRowOf('Orders');
      expect(row.querySelector('.text-destructive')).not.toBeNull();
      // The Σ badge claims an auto-generated column; nothing is generated here.
      expect(row.querySelector('.text-blue-500')).toBeNull();
    });

    it('explains itself on hover as well as to a screen reader', async () => {
      renderExcluded();

      const trigger = within(joinedUniqueCountRowOf('Orders')).getByRole('button');
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' });

      expect(await screen.findByRole('tooltip')).toHaveTextContent(NOT_EMITTED_NOTE);
    });

    it('stays clearable — the row is the only way out of the stored selection', () => {
      const onOutputConfigChange = vi.fn();
      renderPicker(excludedSchema(), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange,
      });

      const row = joinedUniqueCountRowOf('Orders');
      const checkbox = within(row).getByRole('checkbox');
      expect(checkbox).not.toHaveAttribute('aria-disabled');
      fireEvent.click(checkbox);

      expect(onOutputConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCountConfig: [] })
      );
    });

    it('leaves an INCLUDED source’s row as a normal live selection', () => {
      renderPicker(withJoinedSource('available'), ['id'], {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
        onOutputConfigChange: vi.fn(),
      });

      const row = joinedUniqueCountRowOf('Orders');
      expect(row.querySelector('.text-blue-500')).not.toBeNull();
      expect(row.querySelector('.text-destructive')).toBeNull();
      expect(within(row).getByRole('checkbox')).not.toHaveAccessibleDescription();
    });
  });
});

describe('ReportColumnPicker search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects only the visible search results when Select all is clicked', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'country', type: 'STRING' },
        { name: 'city', type: 'STRING' },
      ] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
        buildBlendedField({
          name: 'b__sessions',
          originalFieldName: 'sessions',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    const { onChange } = renderPicker(schema, []);

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
      target: { value: 'city' },
    });

    expect(screen.getByText('city')).toBeInTheDocument();
    expect(screen.queryByText('country')).not.toBeInTheDocument();
    expect(screen.queryByText('revenue')).not.toBeInTheDocument();
    expect(screen.queryByText('sessions')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all fields' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['city']);
  });

  it('shows a message when no columns match the search', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'country', type: 'STRING' },
        { name: 'city', type: 'STRING' },
      ] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, []);

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
      target: { value: 'does-not-exist' },
    });

    expect(screen.getByText('No matching columns found.')).toBeInTheDocument();

    expect(screen.queryByText('country')).not.toBeInTheDocument();
    expect(screen.queryByText('city')).not.toBeInTheDocument();
    expect(screen.queryByText('revenue')).not.toBeInTheDocument();
  });

  it('restores all columns after clearing the search', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'country', type: 'STRING' },
        { name: 'city', type: 'STRING' },
      ] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, []);

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    const input = screen.getByRole('textbox', { name: 'Search columns' });

    fireEvent.change(input, {
      target: { value: 'city' },
    });

    expect(screen.queryByText('country')).not.toBeInTheDocument();

    fireEvent.change(input, {
      target: { value: '' },
    });

    expect(screen.getByText('country')).toBeInTheDocument();
    expect(screen.getByText('city')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Joined DM' })).toBeInTheDocument();
  });

  it('filters blended fields by the search query', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
        buildBlendedField({
          name: 'b__sessions',
          originalFieldName: 'sessions',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, []);

    expect(screen.getByRole('button', { name: 'Expand Joined DM' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
      target: { value: 'revenue' },
    });

    expect(screen.getByRole('button', { name: 'Collapse Joined DM' })).toBeInTheDocument();

    expect(screen.getByText('revenue')).toBeInTheDocument();
    expect(screen.queryByText('sessions')).not.toBeInTheDocument();
  });
});

// Both rows explain themselves the same way — the metric is the same metric, and two adjacent rows
// that behaved differently would read as two different features.
describe('ReportColumnPicker Unique Count description', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseOutputConfig: OutputConfig = {
    filterConfig: [],
    sortConfig: [],
    limitConfig: null,
    aggregationConfig: [],
    dateTruncConfig: [],
    uniqueCountConfig: [],
  };

  const schemaWithKeys = () =>
    buildSchema({
      nativeFields: [
        { name: 'user_id', type: 'STRING', isPrimaryKey: true },
        { name: 'name', type: 'STRING' },
      ] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'orders__amount',
          originalFieldName: 'amount',
          aliasPath: 'orders',
          targetAlias: 'orders',
          outputPrefix: 'Users Fanout Demo',
          sourceRelationshipId: 'rel-orders',
          sourceDataMartId: 'dm-orders',
          sourceDataMartTitle: 'Users Fanout Demo',
        }),
      ],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'orders',
          title: 'Users Fanout Demo',
          defaultAlias: 'Users Fanout Demo',
          relationshipId: 'rel-orders',
          dataMartId: 'dm-orders',
          uniqueCountAvailability: 'available',
          uniqueCountKeyFields: ['date', 'source', 'medium', 'campaign'],
        }),
      ],
    });

  async function tooltipOf(row: HTMLElement): Promise<HTMLElement> {
    fireEvent.pointerMove(
      row.querySelector('[data-slot="unique-count-info"] [data-slot="tooltip-trigger"]')!,
      { pointerType: 'mouse' }
    );
    return screen.findByRole('tooltip');
  }

  it('names the joined Data Mart and every column of its key', async () => {
    renderPicker(schemaWithKeys(), ['user_id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: ['orders'] },
      onOutputConfigChange: vi.fn(),
    });

    expect(await tooltipOf(joinedUniqueCountRowOf('Users Fanout Demo'))).toHaveTextContent(
      'Unique Users Fanout Demo records, counted by its Primary Key: date, source, medium, campaign'
    );
  });

  it('describes the main Data Mart’s row by its own key', async () => {
    renderPicker(schemaWithKeys(), ['user_id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: baseOutputConfig,
      onOutputConfigChange: vi.fn(),
    });

    expect(await tooltipOf(uniqueCountRowOf('Unique Count'))).toHaveTextContent(
      "Unique records, counted by this Data Mart's Primary Key: user_id"
    );
  });
});
