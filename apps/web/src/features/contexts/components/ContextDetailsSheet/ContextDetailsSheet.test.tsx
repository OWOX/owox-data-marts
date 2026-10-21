import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextDto } from '../../types/context.types';
import { ContextDetailsSheet } from './ContextDetailsSheet';

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
