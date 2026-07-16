// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataQualityFieldPicker } from './DataQualityFieldPicker';

describe('DataQualityFieldPicker', () => {
  it('adds only the selected check for the selected field', async () => {
    const onAdd = vi.fn();
    render(
      <DataQualityFieldPicker
        fields={[
          {
            id: 'account_id',
            label: 'account_id',
            checks: [
              {
                key: 'column_uniqueness:field:account_id',
                label: 'Column uniqueness',
              },
            ],
          },
          {
            id: 'email',
            label: 'email',
            checks: [
              { key: 'null_rate:field:email', label: 'Null rate' },
              { key: 'constant_column:field:email', label: 'Constant column' },
            ],
          },
        ]}
        disabled={false}
        onAdd={onAdd}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Select check' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    fireEvent.click(screen.getByRole('combobox', { name: 'Select field' }));
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'email' },
    });

    expect(screen.queryByText('account_id')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'email' }));

    fireEvent.click(await screen.findByRole('combobox', { name: 'Select check' }));
    fireEvent.click(screen.getByRole('option', { name: 'Constant column' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith('constant_column:field:email');
  });

  it('resets the selected check when the field changes', async () => {
    render(
      <DataQualityFieldPicker
        fields={[
          {
            id: 'account_id',
            label: 'account_id',
            checks: [
              {
                key: 'column_uniqueness:field:account_id',
                label: 'Column uniqueness',
              },
            ],
          },
          {
            id: 'email',
            label: 'email',
            checks: [{ key: 'null_rate:field:email', label: 'Null rate' }],
          },
        ]}
        disabled={false}
        onAdd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Select field' }));
    fireEvent.click(screen.getByRole('option', { name: 'email' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Select check' }));
    fireEvent.click(screen.getByRole('option', { name: 'Null rate' }));
    expect(await screen.findByRole('button', { name: 'Add' })).toBeEnabled();

    fireEvent.click(screen.getByRole('combobox', { name: 'Select field' }));
    fireEvent.click(screen.getByRole('option', { name: 'account_id' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });
  });

  it('disables field selection when editing is unavailable', () => {
    render(
      <DataQualityFieldPicker
        fields={[
          {
            id: 'email',
            label: 'email',
            checks: [{ key: 'null_rate:field:email', label: 'Null rate' }],
          },
        ]}
        disabled
        onAdd={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Select field' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Select check' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
