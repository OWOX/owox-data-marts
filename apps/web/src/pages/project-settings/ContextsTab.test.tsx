import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextDto } from '../../features/contexts/types/context.types';
import { ContextsTab } from './ContextsTab';

const context: ContextDto = {
  id: 'context-1',
  name: 'Revenue',
  description: 'Net revenue after refunds.',
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
  ContextDetailsSheet: ({
    context: selected,
    readOnly,
    onClose,
  }: {
    context: ContextDto | null;
    readOnly: boolean;
    onClose: () => void;
  }) =>
    selected ? (
      <div role='dialog' aria-label={selected.name}>
        <span>{readOnly ? 'Read only' : 'Editable'}</span>
        <button onClick={onClose}>Close context</button>
      </div>
    ) : null,
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
const renderAt = (search = '') =>
  render(
    <MemoryRouter initialEntries={['/ui/project/project-settings/contexts' + search]}>
      <Harness />
    </MemoryRouter>
  );

describe('Context permanent links', () => {
  beforeEach(() => {
    state.contexts = [context];
    state.isAdmin = true;
    state.loading = false;
    state.hasLoadError = false;
    vi.clearAllMocks();
  });

  it('opens the linked context after loading without a false unavailable message', () => {
    state.loading = true;
    state.contexts = [];
    const view = renderAt('?context=context-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Context unavailable')).not.toBeInTheDocument();
    state.loading = false;
    state.contexts = [context];
    view.rerender(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
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
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/contexts?keep=value');
    expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('context=');
  });

  it('shows an unavailable message for a deleted or other-project context', () => {
    renderAt('?context=missing&keep=value');
    expect(screen.getByText('Context unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to contexts' }));
    expect(screen.queryByText('Context unavailable')).not.toBeInTheDocument();
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
});
