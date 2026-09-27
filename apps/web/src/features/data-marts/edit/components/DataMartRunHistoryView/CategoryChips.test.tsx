import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CategoryChips } from './CategoryChips';
import { countChipsThatFit } from './chips-fit';
import { LogCategory } from './log-category';

const FILTERS = [
  { category: LogCategory.LOG, label: 'Log', count: 12 },
  { category: LogCategory.WARNING, label: 'Warning', count: 2 },
  { category: LogCategory.TRACE, label: 'Trace', count: 40 },
  { category: LogCategory.ANALYTICS, label: 'Analytics', count: 5 },
  { category: LogCategory.LIFECYCLE, label: 'Lifecycle', count: 3 },
];

describe('countChipsThatFit', () => {
  it('fits every chip when they all fit, with no room kept for the overflow button', () => {
    expect(countChipsThatFit([50, 50, 50], 166, 8, 40)).toBe(3);
  });

  it('keeps room for the overflow button once they do not all fit', () => {
    // 40 (button) + 8 + 50 + 8 + 50 = 156; a third chip would need 214.
    expect(countChipsThatFit([50, 50, 50], 165, 8, 40)).toBe(2);
  });

  it('fits none when even one chip beside the overflow button is too wide', () => {
    expect(countChipsThatFit([80, 80], 100, 8, 40)).toBe(0);
  });
});

describe('CategoryChips', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows every chip where nothing measures the row', () => {
    render(<CategoryChips filters={FILTERS} onToggle={vi.fn()} />);

    for (const { label } of FILTERS) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /more log types/ })).toBeNull();
  });

  // On a narrow screen the chips scrolled sideways out of sight, under a scrollbar that
  // covered half of them.
  it('moves the chips that do not fit into a menu, where they still toggle', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe() {
          this.callback([], this as unknown as ResizeObserver);
        }
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    const onToggle = vi.fn();

    render(
      <CategoryChips
        filters={FILTERS}
        activeCategories={new Set([LogCategory.LOG, LogCategory.TRACE])}
        onToggle={onToggle}
      />
    );

    expect(screen.getByRole('button', { name: /Log/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Warning/ })).toBeNull();
    const more = screen.getByRole('button', { name: '4 more log types' });
    expect(more).toHaveTextContent('+4');

    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    const trace = await within(document.body).findByRole('menuitemcheckbox', { name: 'Trace' });
    expect(trace).toHaveAttribute('aria-checked', 'true');
    expect(
      within(document.body).getByRole('menuitemcheckbox', { name: 'Warning' })
    ).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(trace);
    expect(onToggle).toHaveBeenCalledWith(LogCategory.TRACE);
  });
});
