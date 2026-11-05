import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from './combobox';

async function search(options: ComboboxOption[], text: string) {
  render(<Combobox options={options} value='' onValueChange={() => undefined} ariaLabel='Pick' />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Pick' }));
  const input = await screen.findByPlaceholderText('Search...');
  fireEvent.change(input, { target: { value: text } });
}

const listed = () =>
  within(document.body)
    .queryAllByRole('option')
    .map(o => o.textContent);

describe('Combobox search', () => {
  it('matches the value and the label when an option has no keywords', async () => {
    await search([{ value: 'id-77', label: 'Alpha' }], 'id-77');

    await waitFor(() => {
      expect(listed()).toEqual(['Alpha']);
    });
  });

  it('matches only the keywords when an option has them', async () => {
    await search(
      [
        { value: 'id-77', label: 'Alpha', keywords: ['Beta'] },
        { value: 'id-88', label: 'Gamma', keywords: ['Beta'] },
      ],
      'id-77'
    );

    await waitFor(() => {
      expect(listed()).toEqual([]);
    });
  });

  it('keeps a forced option listed when the search matches nothing', async () => {
    await search(
      [
        { value: 'id-77', label: 'Alpha' },
        { value: 'new', label: '+ Create', forceMount: true },
      ],
      'zzz'
    );

    await waitFor(() => {
      expect(listed()).toEqual(['+ Create']);
    });
  });
});

describe('Combobox options', () => {
  it('a disabled option cannot be selected', async () => {
    const onValueChange = vi.fn();
    render(
      <Combobox
        options={[{ value: 'off', label: 'Off', disabled: true }]}
        value=''
        onValueChange={onValueChange}
        ariaLabel='Pick'
      />
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Pick' }));
    const option = await screen.findByRole('option', { name: 'Off' });

    fireEvent.click(option);

    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
