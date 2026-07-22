// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataQualityFieldPicker } from './DataQualityFieldPicker';

const fields = [
  {
    id: 'account_id',
    label: 'account_id',
    type: 'INTEGER',
    checks: [
      {
        key: 'column_uniqueness:field:account_id',
        label: 'Column uniqueness',
        description: 'Finds repeated non-null values in this field.',
        isAdded: false,
      },
    ],
  },
  {
    id: 'email',
    label: 'email',
    type: 'STRING',
    checks: [
      {
        key: 'null_rate:field:email',
        label: 'Null rate',
        description: 'Checks whether the share of null values exceeds the configured threshold.',
        isAdded: true,
      },
      {
        key: 'constant_column:field:email',
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
    expect(onAdd).toHaveBeenCalledWith('constant_column:field:email');
    expect(screen.queryByRole('dialog', { name: 'Add field check' })).not.toBeInTheDocument();
  });

  it('opens directly on the check list from a field-level add button', () => {
    render(
      <DataQualityFieldPicker
        fields={fields}
        disabled={false}
        initialFieldId='email'
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

  it('disables the trigger when editing is unavailable', () => {
    render(<DataQualityFieldPicker fields={fields} disabled onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Add checks' })).toBeDisabled();
  });
});
