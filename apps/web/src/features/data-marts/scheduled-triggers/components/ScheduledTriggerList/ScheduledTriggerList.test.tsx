import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduledTriggerList } from './ScheduledTriggerList';

const triggers = [{ id: 't1' }, { id: 't2' }];

const mocks = vi.hoisted(() => ({ toastError: vi.fn(), useScheduledTrigger: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() }),
}));
vi.mock('../../model', () => ({ useScheduledTrigger: mocks.useScheduledTrigger }));
vi.mock('../ScheduledTriggerTable', () => ({
  ScheduledTriggerTable: ({ onEditTrigger }: { onEditTrigger: (id: string) => void }) => (
    <button
      onClick={() => {
        onEditTrigger('t1');
      }}
    >
      Edit t1
    </button>
  ),
}));
vi.mock('../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet', () => ({
  ScheduledTriggerFormSheet: ({
    isOpen,
    trigger,
    link,
    onClose,
  }: {
    isOpen: boolean;
    trigger?: { id: string } | null;
    link?: string | null;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid='editSheet'>
        {trigger?.id}
        <span data-testid='editLink'>{link}</span>
        <button onClick={onClose}>Close sheet</button>
      </div>
    ) : null,
}));

function Search() {
  return <div data-testid='search'>{useLocation().search}</div>;
}

function ui(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <ScheduledTriggerList dataMartId='dm1' />
      <Search />
    </MemoryRouter>
  );
}

function state(overrides: Record<string, unknown> = {}) {
  mocks.useScheduledTrigger.mockReturnValue({
    triggers,
    hasLoaded: true,
    isLoading: false,
    error: null,
    deleteScheduledTrigger: vi.fn(),
    ...overrides,
  });
}

const path = '/dm?trigger=';

describe('ScheduledTriggerList', () => {
  beforeEach(() => {
    mocks.toastError.mockClear();
  });

  it('opens the linked trigger once the first load ends, with a link', async () => {
    state({ triggers: [], hasLoaded: false, isLoading: true });
    const { rerender } = render(ui(`${path}t2`));
    expect(screen.queryByTestId('editSheet')).toBeNull();

    state();
    rerender(ui(`${path}t2`));

    expect(await screen.findByTestId('editSheet')).toHaveTextContent('t2');
    expect(screen.getByTestId('editLink').textContent).toContain('/dm?trigger=t2');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('does not judge the link before the load starts or while it runs', () => {
    state({ triggers: [], hasLoaded: false });
    const { rerender } = render(ui(`${path}t2`));
    state({ triggers: [], hasLoaded: false, isLoading: true });
    rerender(ui(`${path}t2`));

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('?trigger=t2');
  });

  it('keeps the sheet open when a save reloads the list', async () => {
    state({ triggers: [], hasLoaded: false, isLoading: true });
    const { rerender } = render(ui(`${path}t2`));
    state();
    rerender(ui(`${path}t2`));
    await screen.findByTestId('editSheet');

    state({ isLoading: true });
    rerender(ui(`${path}t2`));

    expect(screen.getByTestId('editSheet')).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('?trigger=t2');
  });

  it('shows a toast and drops the parameter for an unknown trigger', async () => {
    state({ triggers: [], hasLoaded: false, isLoading: true });
    const { rerender } = render(ui(`${path}gone`));
    state();
    rerender(ui(`${path}gone`));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'This trigger was deleted or is not available.',
        {
          id: 'trigger-not-found',
        }
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  it('writes the trigger to the URL on edit and drops it on close', async () => {
    state({ triggers: [], hasLoaded: false, isLoading: true });
    const { rerender } = render(ui('/dm'));
    state();
    rerender(ui('/dm'));

    fireEvent.click(screen.getByText('Edit t1'));
    expect(await screen.findByTestId('editSheet')).toHaveTextContent('t1');
    expect(screen.getByTestId('search').textContent).toBe('?trigger=t1');

    fireEvent.click(screen.getByText('Close sheet'));
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });
});
