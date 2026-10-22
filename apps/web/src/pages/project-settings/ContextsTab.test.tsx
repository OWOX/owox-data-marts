import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router';
import { useState } from 'react';
import { UnsavedChangesConfirmationDialog } from '../../shared/components/UnsavedChangesConfirmationDialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextDto } from '../../features/contexts/types/context.types';
import { ContextsTab } from './ContextsTab';

const context: ContextDto = {
  id: 'context-1',
  name: 'Revenue',
  description: 'Net revenue after refunds.',
  icon: null,
  createdById: null,
  createdByUser: null,
  createdAt: '',
  modifiedAt: '',
};
const state = vi.hoisted(() => ({
  contexts: [] as ContextDto[],
  members: [],
  isAdmin: true,
  loading: false,
  hasLoadError: false,
  refresh: vi.fn(),
  openAddContextSheet: vi.fn(),
}));
vi.mock('../../features/project-settings/members/model/members-settings.context', () => ({
  useMembersSettings: () => state,
}));
vi.mock('../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project${path}` }),
}));
vi.mock('../../features/contexts/components/ContextsTable/ContextsTable', () => ({
  ContextsTable: ({ onRowClick }: { onRowClick: (value: ContextDto) => void }) => (
    <button
      onClick={() => {
        onRowClick(context);
      }}
    >
      Open Revenue
    </button>
  ),
}));
vi.mock('../../features/contexts/components/ContextDetailsSheet/ContextDetailsSheet', () => ({
  ContextDetailsSheet: function MockSheet({
    context: selected,
    readOnly,
    onClose,
    onSaved,
    onDirtyChange,
    navigationGuard,
  }: {
    context: ContextDto | null;
    readOnly: boolean;
    onClose: () => void;
    onSaved: () => void;
    onDirtyChange: (dirty: boolean) => void;
    navigationGuard: { blocked: boolean; onConfirm: () => void; onCancel: () => void };
  }) {
    const [draft, setDraft] = useState('');
    return selected ? (
      <div role='dialog' aria-label={selected.name}>
        <span>{readOnly ? 'Read only' : 'Editable'}</span>
        <input
          aria-label='Draft'
          value={draft}
          onChange={event => {
            setDraft(event.target.value);
            onDirtyChange(true);
          }}
        />
        <button onClick={onClose}>Close context</button>
        <button onClick={onSaved}>Save context</button>
        <UnsavedChangesConfirmationDialog
          open={navigationGuard.blocked}
          onOpenChange={open => {
            if (!open) navigationGuard.onCancel();
          }}
          onConfirm={navigationGuard.onConfirm}
        />
      </div>
    ) : null;
  },
}));

function Harness() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label='Current URL'>
        {location.pathname}
        {location.search}
      </output>
      <button
        onClick={() => {
          void navigate(-1);
        }}
      >
        Back
      </button>
      <button
        onClick={() => {
          void navigate(1);
        }}
      >
        Forward
      </button>
      <ContextsTab />
    </>
  );
}
const renderAt = (search = '', previous?: string) => {
  const current = '/ui/project/project-settings/contexts' + search;
  const router = createMemoryRouter([{ path: '*', element: <Harness /> }], {
    initialEntries: previous ? [previous, current] : [current],
  });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router };
};

describe('Context permanent links', () => {
  beforeEach(() => {
    state.contexts = [context];
    state.isAdmin = true;
    state.loading = false;
    state.hasLoadError = false;
    vi.clearAllMocks();
  });

  it('opens the linked context after loading without a false unavailable message', async () => {
    state.loading = true;
    state.contexts = [];
    const view = renderAt('?context=context-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Context unavailable')).not.toBeInTheDocument();
    state.loading = false;
    state.contexts = [context];
    await act(() =>
      view.router.navigate('/ui/project/project-settings/contexts?context=context-1', {
        replace: true,
      })
    );
    expect(screen.getByRole('dialog', { name: 'Revenue' })).toBeInTheDocument();
  });

  it('keeps the URL and sheet synchronized with Back and Forward', async () => {
    renderAt('?keep=value');
    fireEvent.click(screen.getByRole('button', { name: 'Open Revenue' }));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('?keep=value&context=context-1');
    expect(screen.getByText('Editable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    await screen.findByRole('dialog', { name: 'Revenue' });
    fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current URL')).toHaveTextContent('/contexts?keep=value');
    });
    expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('context=');
  });

  it('shows an unavailable message for a deleted or other-project context', async () => {
    renderAt('?context=missing&keep=value');
    expect(screen.getByText('Context unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to contexts' }));
    await waitFor(() => {
      expect(screen.queryByText('Context unavailable')).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/contexts?keep=value');
  });

  it('does not mistake a load failure for a deleted context', () => {
    state.hasLoadError = true;
    state.contexts = [];
    renderAt('?context=context-1');
    expect(screen.queryByText('Context unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens shared links for non-admin members in read-only mode', () => {
    state.isAdmin = false;
    renderAt('?context=context-1');
    expect(screen.getByRole('dialog', { name: 'Revenue' })).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.queryByText('Editable')).not.toBeInTheDocument();
  });

  it('returns to the previous page with one Back after opening and closing a context', async () => {
    renderAt('?keep=value', '/ui/project/data-marts');
    fireEvent.click(screen.getByRole('button', { name: 'Open Revenue' }));
    await screen.findByRole('dialog', { name: 'Revenue' });
    fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current URL')).toHaveTextContent('/ui/project/data-marts');
    });
  });

  it('holds Back with unsaved edits, retains the draft on stay, and leaves after confirmation', async () => {
    const { router } = renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Open Revenue' }));
    const input = await screen.findByRole('textbox', { name: 'Draft' });
    fireEvent.change(input, { target: { value: 'Unsaved definition' } });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('dialog', { name: 'Unsaved Changes' });
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('context=context-1');
    fireEvent.click(screen.getByRole('button', { name: 'No, stay here' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Unsaved Changes' })).not.toBeInTheDocument();
    });
    expect(input).toHaveValue('Unsaved definition');
    fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
    await screen.findByRole('dialog', { name: 'Unsaved Changes' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, leave now' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('context=');
    });
    await act(() => router.navigate('/ui/project/data-marts'));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/ui/project/data-marts');
  });

  it('closes after a successful save without warning about the saved edits', async () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Open Revenue' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Draft' }), {
      target: { value: 'Saved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save context' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('context=');
    });
    expect(screen.queryByRole('dialog', { name: 'Unsaved Changes' })).not.toBeInTheDocument();
  });
});
