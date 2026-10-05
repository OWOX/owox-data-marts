import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TableFilters, TableFiltersContent, TableFiltersTrigger } from './index';
import type { FilterConfigItem } from './types';

const config: FilterConfigItem[] = [
  {
    id: 'title',
    label: 'Title',
    dataType: 'string',
    operators: ['contains', 'not_contains', 'eq', 'neq'],
    options: [{ value: 'Sessions table', label: 'Sessions table' }],
  },
];

async function pickOption(trigger: HTMLElement, name: string) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(await within(document.body).findByRole('option', { name }));
}

describe('TableFilters', () => {
  it('applies a contains filter typed after switching from the default operator', async () => {
    const onApply = vi.fn();
    render(
      <TableFilters onApply={onApply}>
        <TableFiltersTrigger />
        <TableFiltersContent config={config} />
      </TableFilters>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const [fieldTrigger, operatorTrigger] = await screen.findAllByRole('combobox');
    await pickOption(fieldTrigger, 'Title');
    await pickOption(operatorTrigger, 'contains');

    const applyButton = screen.getByRole('button', { name: 'Apply filters' });
    const valueInput = await screen.findByPlaceholderText('Value');

    fireEvent.change(valueInput, { target: { value: 'table' } });
    expect(applyButton).toBeEnabled();

    fireEvent.change(valueInput, { target: { value: '' } });
    expect(applyButton).toBeDisabled();

    fireEvent.change(valueInput, { target: { value: 'sessions' } });
    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith({
      version: 1,
      filters: [{ fieldId: 'title', operator: 'contains', value: ['sessions'] }],
    });
  });
});
