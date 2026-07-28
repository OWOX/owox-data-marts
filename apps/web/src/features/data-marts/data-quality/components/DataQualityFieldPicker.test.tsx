// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataQualityFieldPicker } from './DataQualityFieldPicker';

const fields = [
  {
    fieldPath: ['account_id'],
    fieldPathKey: '["account_id"]',
    label: 'account_id',
    type: 'INTEGER',
    checks: [
      {
        key: 'column_uniqueness:field:["account_id"]',
        label: 'Column uniqueness',
        description: 'Finds repeated non-null values in this field.',
        isAdded: false,
      },
    ],
  },
  {
    fieldPath: ['email'],
    fieldPathKey: '["email"]',
    label: 'email',
    type: 'STRING',
    checks: [
      {
        key: 'null_rate:field:["email"]',
        label: 'Null rate',
        description: 'Checks whether the share of null values exceeds the configured threshold.',
        isAdded: true,
      },
      {
        key: 'constant_column:field:["email"]',
        label: 'Constant column',
        description: 'Finds fields that contain only one distinct value.',
        isAdded: false,
      },
    ],
  },
];

describe('DataQualityFieldPicker', () => {
  it('searches for a field, then adds exactly one selected check', () => {
    const onAdd = vi.fn();
    render(<DataQualityFieldPicker fields={fields} disabled={false} onAdd={onAdd} />);

    expect(screen.queryByPlaceholderText('Search fields…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add checks' }));
    expect(screen.getByRole('dialog', { name: 'Add field check' })).toHaveAttribute(
      'data-align',
      'end'
    );

    const search = screen.getByPlaceholderText('Search fields…');
    fireEvent.change(search, { target: { value: 'email' } });
    expect(screen.queryByRole('option', { name: /account_id/ })).not.toBeInTheDocument();
    expect(screen.getByText('1 added')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /email/ }));

    expect(screen.getByText('Choose one check to add')).toBeInTheDocument();
    const checkDescription = screen.getByText(
      'Checks whether the share of null values exceeds the configured threshold.'
    );
    expect(checkDescription).toHaveClass('whitespace-normal');
    expect(checkDescription).not.toHaveClass('truncate');
    expect(screen.getByRole('option', { name: /Null rate.*Added/ })).toHaveAttribute(
      'data-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('option', { name: /Constant column/ }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith('constant_column:field:["email"]');
    expect(screen.queryByRole('dialog', { name: 'Add field check' })).not.toBeInTheDocument();
  });

  it('opens directly on the check list from a field-level add button', () => {
    render(
      <DataQualityFieldPicker
        fields={fields}
        disabled={false}
        initialFieldPathKey='["email"]'
        triggerLabel='Add a check to email'
        onAdd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add a check to email' }));

    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('Choose one check to add')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search fields…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another field' })).toBeInTheDocument();
  });

  it('keeps literal dotted and nested paths selectable as different fields', () => {
    const onAdd = vi.fn();
    render(
      <DataQualityFieldPicker
        fields={[
          {
            fieldPath: ['customer.id'],
            fieldPathKey: '["customer.id"]',
            label: 'customer.id',
            type: 'STRING',
            checks: [
              {
                key: 'null_rate:field:["customer.id"]',
                label: 'Null rate',
                description: 'Checks literal dotted field values.',
                isAdded: false,
              },
            ],
          },
          {
            fieldPath: ['customer', 'id'],
            fieldPathKey: '["customer","id"]',
            label: 'customer.id',
            type: 'STRING',
            checks: [
              {
                key: 'null_rate:field:["customer","id"]',
                label: 'Null rate',
                description: 'Checks nested field values.',
                isAdded: false,
              },
            ],
          },
        ]}
        disabled={false}
        onAdd={onAdd}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add checks' }));
    fireEvent.click(screen.getAllByRole('option', { name: /customer\.id/ })[1]);
    fireEvent.click(screen.getByRole('option', { name: /Null rate/ }));

    expect(onAdd).toHaveBeenCalledWith('null_rate:field:["customer","id"]');
  });

  it('disables the trigger when editing is unavailable', () => {
    render(<DataQualityFieldPicker fields={fields} disabled onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Add checks' })).toBeDisabled();
  });
});
