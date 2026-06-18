import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FilterRule, OutputConfig } from '../../../shared/types/output-config';

// The change is presentation-only: a picker shows a business label but must hand
// back — and store — the RAW identifier. Stub the picker + editor so the test
// drives the add-path wiring directly, without Radix/cmdk portals.
vi.mock('./FieldSearchPicker', () => ({
  FieldSearchPicker: ({
    items,
    placeholder,
    onSelect,
  }: {
    items: { value: string; label: string }[];
    placeholder: string;
    onSelect: (value: string) => void;
  }) => (
    <div>
      {items.map(item => (
        <button
          key={item.value}
          onClick={() => {
            onSelect(item.value);
          }}
        >
          {`${placeholder}: ${item.label}`}
        </button>
      ))}
    </div>
  ),
}));

// Stand in for the value editor: emit a rule carrying the `column` prop it was
// given. If the wiring leaked a label into `column`, this rule would carry it.
vi.mock('./FilterEditorPopover', () => ({
  FilterEditorPopover: ({
    column,
    onApply,
  }: {
    column: string;
    onApply: (rule: FilterRule) => void;
  }) => (
    <button
      onClick={() => {
        onApply({ column, operator: 'eq', value: 'x' });
      }}
    >
      {`apply:${column}`}
    </button>
  ),
}));

import {
  OutputSettingsDropdown,
  type OutputSettingsDropdownColumn,
} from './OutputSettingsDropdown';

const EMPTY: OutputConfig = { filterConfig: [], sortConfig: [], limitConfig: null };

// Alias differs from the raw name on purpose — that's where a leak would show.
const productId: OutputSettingsDropdownColumn = {
  name: 'orders.product_id',
  type: 'STRING',
  label: 'Product ID',
};

describe('OutputSettingsDropdown stored-identifier invariant', () => {
  it('adding a filter stores the raw column name, not the business label', () => {
    const onChange = vi.fn();
    render(
      <OutputSettingsDropdown
        value={EMPTY}
        onChange={onChange}
        allColumns={[productId]}
        selectedColumns={[]}
        joinedSources={[]}
      />
    );

    fireEvent.click(screen.getByText('Add filter: Product ID'));
    fireEvent.click(screen.getByText('apply:orders.product_id'));

    const cfg = onChange.mock.lastCall?.[0] as OutputConfig | undefined;
    expect(cfg?.filterConfig).toHaveLength(1);
    expect(cfg?.filterConfig[0].column).toBe('orders.product_id');
    expect(cfg?.filterConfig[0].column).not.toBe('Product ID');
  });

  it('adding a slice stores the unified column id, not the label', () => {
    const onChange = vi.fn();
    render(
      <OutputSettingsDropdown
        value={EMPTY}
        onChange={onChange}
        allColumns={[]}
        selectedColumns={[]}
        joinedSources={[
          {
            aliasPath: 'orders',
            title: 'Orders',
            dataMartName: 'Orders',
            columns: [
              { id: 'orders__product_id', name: 'product_id', type: 'STRING', alias: 'Product ID' },
            ],
          },
        ]}
      />
    );

    fireEvent.click(screen.getByText('Add slice: Product ID'));
    fireEvent.click(screen.getByText('apply:orders__product_id'));

    const cfg = onChange.mock.lastCall?.[0] as OutputConfig | undefined;
    expect(cfg?.filterConfig).toHaveLength(1);
    const rule = cfg?.filterConfig[0];
    expect(rule?.column).toBe('orders__product_id');
    expect(rule?.placement).toBe('pre-join');
    expect(rule?.column).not.toBe('Product ID');
  });

  it('adding a sort stores the raw column name, not the business label', () => {
    const onChange = vi.fn();
    render(
      <OutputSettingsDropdown
        value={EMPTY}
        onChange={onChange}
        allColumns={[]}
        selectedColumns={[productId]}
        joinedSources={[]}
      />
    );

    fireEvent.click(screen.getByText('Add sort by: Product ID'));

    const cfg = onChange.mock.lastCall?.[0] as OutputConfig | undefined;
    expect(cfg?.sortConfig).toHaveLength(1);
    expect(cfg?.sortConfig[0].column).toBe('orders.product_id');
    expect(cfg?.sortConfig[0].column).not.toBe('Product ID');
  });
});
