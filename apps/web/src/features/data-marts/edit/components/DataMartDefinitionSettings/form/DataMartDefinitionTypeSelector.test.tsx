import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartDefinitionTypeSelector } from './DataMartDefinitionTypeSelector';

// Radix Select renders its items in a portal only while open; a plain <select> keeps the
// option content in the tree so the hint of each option can be asserted.
vi.mock('@owox/ui/components/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <select aria-label='Definition Type'>{children}</select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

describe('DataMartDefinitionTypeSelector', () => {
  it('names the popular connectors by logo and keeps their names for screen readers', () => {
    render(<DataMartDefinitionTypeSelector onTypeSelect={vi.fn()} />);

    const connectorOption = screen.getByRole('option', { name: /Connector/ });
    const names = within(connectorOption)
      .getAllByText(/Ads|Sheets/)
      .map(element => element.textContent);
    expect(names).toEqual([
      'Facebook Ads',
      'Google Ads',
      'TikTok Ads',
      'LinkedIn Ads',
      'Google Sheets',
    ]);
    expect(connectorOption.querySelectorAll('svg')).toHaveLength(5);
    expect(connectorOption).toHaveTextContent('and others');
  });

  it('keeps the plain description for the other definition types', () => {
    render(<DataMartDefinitionTypeSelector onTypeSelect={vi.fn()} />);

    expect(screen.getByRole('option', { name: /SQL/ })).toHaveTextContent('SQL query');
    expect(screen.getByRole('option', { name: /Pattern/ })).toHaveTextContent('Table pattern');
  });
});
