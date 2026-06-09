import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ReportColumnPicker } from './ReportColumnPicker';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  AvailableSource,
  BlendableSchema,
  BlendedField,
} from '../../../shared/types/relationship.types';

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

function renderPicker(schema: BlendableSchema, value: string[] | null) {
  vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const onChange = vi.fn();
  const utils = render(
    <ReportColumnPicker dataMartId={DATA_MART_ID} value={value} onChange={onChange} />,
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
