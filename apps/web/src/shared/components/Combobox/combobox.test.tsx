import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
