import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextDto } from '../../types/context.types';
import { AddContextSheet } from './AddContextSheet';

const { contextServiceMock, trackEventMock } = vi.hoisted(() => ({
  contextServiceMock: {
    createContext: vi.fn(),
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
  DescriptionEditor: ({
    value,
    onChange,
    startEditing,
  }: {
    value: string;
    onChange: (v: string) => void;
    startEditing?: boolean;
  }) => (
    <textarea
      aria-label='Description'
      data-start-editing={startEditing}
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
    />
  ),
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const created: ContextDto = {
  id: 'ctx-new',
  name: 'Marketing',
  description: null,
  icon: 'purchases',
  createdById: null,
  createdByUser: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
};

const renderSheet = (onCreated = vi.fn()) =>
  render(<AddContextSheet isOpen members={[]} onClose={vi.fn()} onCreated={onCreated} />);

describe('AddContextSheet icon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextServiceMock.createContext.mockResolvedValue(created);
  });

  it('opens the description for typing while keeping initial focus on Name', async () => {
    renderSheet();
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveAttribute(
      'data-start-editing',
      'true'
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Marketing')).toHaveFocus();
    });
  });

  it('creates the context with the picked icon', async () => {
    const onCreated = vi.fn();
    renderSheet(onCreated);

    fireEvent.change(screen.getByPlaceholderText('Marketing'), { target: { value: 'Marketing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change context icon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Purchases' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(created);
    });
    expect(contextServiceMock.createContext).toHaveBeenCalledWith({
      name: 'Marketing',
      icon: 'purchases',
    });
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'context_created', label: 'ctx-new', value: 'purchases' })
    );
  });

  it('creates the context without an icon when none is picked', async () => {
    const onCreated = vi.fn();
    renderSheet(onCreated);

    fireEvent.change(screen.getByPlaceholderText('Marketing'), { target: { value: 'Finance' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
    expect(contextServiceMock.createContext).toHaveBeenCalledWith({ name: 'Finance' });
  });
});
