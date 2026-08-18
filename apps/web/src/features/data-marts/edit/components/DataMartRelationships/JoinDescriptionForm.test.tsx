import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { JoinDescriptionForm } from './JoinDescriptionForm';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

vi.mock('../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({
    navigate: vi.fn(),
    scope: (path: string) => path,
    projectId: 'project-1',
  }),
}));

vi.mock('../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    updateRelationship: vi.fn(),
  },
}));

import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';

const updateRelationship = vi.mocked(dataMartRelationshipService.updateRelationship);

function buildRelationship(overrides: Partial<DataMartRelationship> = {}): DataMartRelationship {
  return {
    id: 'rel-1',
    dataStorageId: 'storage-1',
    sourceDataMart: {
      id: 'source-dm-1',
      title: 'Orders',
      status: 'PUBLISHED',
      userHasAccess: true,
      hasPrimaryKey: true,
    },
    targetDataMart: {
      id: 'target-dm-1',
      title: 'Customers',
      status: 'PUBLISHED',
      userHasAccess: true,
      hasPrimaryKey: true,
    },
    targetAlias: 'customers',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
    createdById: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function renderForm(props: Partial<Parameters<typeof JoinDescriptionForm>[0]> = {}) {
  const relationship = props.relationship ?? buildRelationship();
  return render(
    <JoinDescriptionForm
      relationship={relationship}
      dataMartId='source-dm-1'
      onSaved={vi.fn()}
      {...props}
    />
  );
}

const getTextarea = () =>
  screen.getByPlaceholderText<HTMLTextAreaElement>(/visitors from the website/i);

describe('JoinDescriptionForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateRelationship.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('autosaves the typed description after the debounce settles', async () => {
    updateRelationship.mockResolvedValue(buildRelationship({ description: 'Buyers of orders' }));
    renderForm();

    fireEvent.change(getTextarea(), { target: { value: 'Buyers of orders' } });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(updateRelationship).toHaveBeenCalledTimes(1);
    expect(updateRelationship).toHaveBeenCalledWith(
      'source-dm-1',
      'rel-1',
      { description: 'Buyers of orders' },
      { skipErrorToast: true, skipLoadingIndicator: true }
    );
  });

  it('sends null for a whitespace-only description (clear)', async () => {
    updateRelationship.mockResolvedValue(buildRelationship({ description: undefined }));
    renderForm({ relationship: buildRelationship({ description: 'old meaning' }) });

    fireEvent.change(getTextarea(), { target: { value: '   ' } });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(updateRelationship).toHaveBeenCalledWith(
      'source-dm-1',
      'rel-1',
      { description: null },
      expect.anything()
    );
  });

  it('keeps text typed during a slow save and retries it afterwards (no silent revert)', async () => {
    let resolveSave: (value: DataMartRelationship) => void = () => undefined;
    updateRelationship.mockImplementationOnce(
      () =>
        new Promise<DataMartRelationship>(resolve => {
          resolveSave = resolve;
        })
    );
    updateRelationship.mockResolvedValueOnce(buildRelationship({ description: 'AB' }));
    renderForm();

    // First edit reaches the debounce and starts a (slow) save.
    fireEvent.change(getTextarea(), { target: { value: 'A' } });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(updateRelationship).toHaveBeenCalledTimes(1);

    // User keeps typing while the save is in flight.
    fireEvent.change(getTextarea(), { target: { value: 'AB' } });

    // The slow save resolves with the STALE server value...
    await act(async () => {
      resolveSave(buildRelationship({ description: 'A' }));
    });

    // ...but the textarea must keep the newer text, and the newer text must be saved.
    expect(getTextarea().value).toBe('AB');
    expect(updateRelationship).toHaveBeenCalledTimes(2);
    expect(updateRelationship).toHaveBeenLastCalledWith(
      'source-dm-1',
      'rel-1',
      { description: 'AB' },
      expect.anything()
    );
  });

  it('flushes a pending edit when the form unmounts before the debounce fires', async () => {
    updateRelationship.mockResolvedValue(buildRelationship({ description: 'typed then left' }));
    const { unmount } = renderForm();

    fireEvent.change(getTextarea(), { target: { value: 'typed then left' } });
    // No debounce advance — switching tabs unmounts the form with the edit pending.
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(updateRelationship).toHaveBeenCalledWith(
      'source-dm-1',
      'rel-1',
      { description: 'typed then left' },
      expect.anything()
    );
  });

  it('queues the unmount flush behind an in-flight save instead of racing it', async () => {
    let resolveSave: (value: DataMartRelationship) => void = () => undefined;
    updateRelationship.mockImplementationOnce(
      () =>
        new Promise<DataMartRelationship>(resolve => {
          resolveSave = resolve;
        })
    );
    updateRelationship.mockResolvedValueOnce(buildRelationship({ description: 'B' }));
    const { unmount } = renderForm();

    // Slow save A starts...
    fireEvent.change(getTextarea(), { target: { value: 'A' } });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(updateRelationship).toHaveBeenCalledTimes(1);

    // ...user types B and leaves the tab while A is still on the wire.
    fireEvent.change(getTextarea(), { target: { value: 'B' } });
    unmount();

    // The flush must NOT fire a concurrent PATCH — with no server-side versioning,
    // out-of-order processing would let stale A overwrite B.
    expect(updateRelationship).toHaveBeenCalledTimes(1);

    // Once A settles, the queued flush sends B.
    await act(async () => {
      resolveSave(buildRelationship({ description: 'A' }));
    });
    expect(updateRelationship).toHaveBeenCalledTimes(2);
    expect(updateRelationship).toHaveBeenLastCalledWith(
      'source-dm-1',
      'rel-1',
      { description: 'B' },
      expect.anything()
    );
  });

  it('renders the inherited banner and disables the textarea for transient joins', () => {
    renderForm({
      readOnly: true,
      inheritedFrom: { id: 'parent-dm-1', title: 'Customers' },
    });

    expect(screen.getByText(/inherited from/i)).toBeInTheDocument();
    expect(getTextarea()).toBeDisabled();
  });

  it('does not save while read-only', async () => {
    renderForm({ readOnly: true });

    fireEvent.change(getTextarea(), { target: { value: 'attempt' } });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(updateRelationship).not.toHaveBeenCalled();
  });
});
