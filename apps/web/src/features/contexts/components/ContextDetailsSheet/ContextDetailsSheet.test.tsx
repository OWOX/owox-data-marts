import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextDto } from '../../types/context.types';
import { ContextDetailsSheet } from './ContextDetailsSheet';

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => '/ui/p1' + path }),
}));
vi.mock('../../../../shared/components/DescriptionEditor/useDescriptionPreview', () => ({
  useDescriptionPreview: () => ({ html: '<h1>Revenue</h1>', loading: false, error: null }),
}));

const { contextServiceMock, trackEventMock } = vi.hoisted(() => ({
  contextServiceMock: {
    updateContext: vi.fn(),
    updateContextMembers: vi.fn(),
  },
  trackEventMock: vi.fn(),
}));

vi.mock('../../services/context.service', () => ({ contextService: contextServiceMock }));
vi.mock('../../../../utils', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../utils')>()),
  trackEvent: trackEventMock,
}));
vi.mock('../../../idp/hooks/useAuthState', () => ({ useUser: () => ({ projectId: 'p1' }) }));
vi.mock('../../../../shared/components/DescriptionEditor/DescriptionEditor', () => ({
  DescriptionEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      aria-label='Description'
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
    />
  ),
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const makeContext = (icon: ContextDto['icon']): ContextDto => ({
  id: 'ctx-1',
  name: 'Marketing',
  description: null,
  icon,
  createdById: null,
  createdByUser: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
});

const renderSheet = (context: ContextDto, onSaved = vi.fn()) =>
  render(
    <ContextDetailsSheet
      isOpen
      context={context}
      members={[]}
      onClose={vi.fn()}
      onSaved={onSaved}
    />
  );

describe('ContextDetailsSheet icon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextServiceMock.updateContext.mockResolvedValue(makeContext(null));
  });

  it('focuses Name on opening instead of the icon or copy-link button', async () => {
    renderSheet(makeContext(null));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveFocus();
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('saves a picked icon in the same request as the name and description', async () => {
    const onSaved = vi.fn();
    renderSheet(makeContext(null), onSaved);

    fireEvent.click(screen.getByRole('button', { name: 'Change context icon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Purchases' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(contextServiceMock.updateContext).toHaveBeenCalledTimes(1);
    expect(contextServiceMock.updateContext).toHaveBeenCalledWith('ctx-1', {
      name: 'Marketing',
      description: '',
      icon: 'purchases',
    });
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'context_updated',
        action: 'UpdateIcon',
        label: 'ctx-1',
        value: 'purchases',
      })
    );
  });

  it('resets the icon to the default', async () => {
    const onSaved = vi.fn();
    renderSheet(makeContext('purchases'), onSaved);

    fireEvent.click(screen.getByRole('button', { name: 'Change context icon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(contextServiceMock.updateContext).toHaveBeenCalledWith('ctx-1', {
      name: 'Marketing',
      description: '',
      icon: null,
    });
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'context_updated', action: 'ResetIcon' })
    );
  });

  it('leaves the icon alone when only the name changes', async () => {
    const onSaved = vi.fn();
    renderSheet(makeContext('purchases'), onSaved);

    fireEvent.change(screen.getByDisplayValue('Marketing'), { target: { value: 'Growth' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    // No `icon` key: the backend keeps the current icon.
    expect(contextServiceMock.updateContext).toHaveBeenCalledWith('ctx-1', {
      name: 'Growth',
      description: '',
    });
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});

describe('Context read-only sharing', () => {
  it('shows the description and sharing actions without edit or membership controls', async () => {
    render(
      <ContextDetailsSheet
        isOpen
        readOnly
        members={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        context={{
          id: 'context-1',
          name: 'Revenue',
          description: '# Revenue',
          icon: null,
          createdAt: '',
          modifiedAt: '',
          createdById: null,
          createdByUser: null,
        }}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Revenue' })).toBeInTheDocument();
    expect(screen.getByTitle('Description')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('<h1>Revenue</h1>')
    );
    expect(screen.getByRole('button', { name: 'Copy link to context' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy as Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand description' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Assigned members')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Revenue' })).toHaveFocus();
    });
  });
});
