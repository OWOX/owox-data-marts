import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JoinSettingsForm } from './JoinSettingsForm';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

vi.mock('../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({
    navigate: vi.fn(),
    scope: (path: string) => path,
    projectId: 'project-1',
  }),
}));

vi.mock('../../../shared', () => ({
  dataMartService: {
    getDataMartById: vi.fn(() =>
      Promise.resolve({ id: 'dm', title: 'DM', schema: { fields: [] } })
    ),
  },
}));

vi.mock('../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    // The alias autosaves on blur/debounce; echo the patch back like the server would.
    updateRelationship: vi.fn((_dataMartId: string, _id: string, patch: object) =>
      Promise.resolve({ targetAlias: 'customers', joinConditions: [], ...patch })
    ),
  },
}));

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

function renderForm(relationship: DataMartRelationship) {
  return render(
    <JoinSettingsForm
      relationship={relationship}
      dataMartId='source-dm-1'
      siblingAliases={[]}
      inheritedFrom={null}
      onSaved={vi.fn()}
    />
  );
}

const getAliasInput = () => screen.getByPlaceholderText<HTMLInputElement>('e.g. orders');

describe('JoinSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps an in-progress edit when the relationship object is replaced with the same settings', async () => {
    const relationship = buildRelationship();
    const { rerender } = renderForm(relationship);
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });

    fireEvent.change(getAliasInput(), { target: { value: 'cust' } });
    expect(getAliasInput().value).toBe('cust');

    // A description autosave replaces the row's relationship in place: same alias and join
    // conditions, new object identity. The half-typed alias must survive it.
    rerender(
      <JoinSettingsForm
        relationship={{ ...relationship, description: 'Customers who placed the order' }}
        dataMartId='source-dm-1'
        siblingAliases={[]}
        inheritedFrom={null}
        onSaved={vi.fn()}
      />
    );
    expect(getAliasInput().value).toBe('cust');
  });

  it('keeps what was typed while its own save was on the wire', async () => {
    const relationship = buildRelationship();
    let resolveSave: (saved: DataMartRelationship) => void = () => undefined;
    vi.mocked(dataMartRelationshipService.updateRelationship).mockImplementationOnce(
      () =>
        new Promise<DataMartRelationship>(resolve => {
          resolveSave = resolve;
        })
    );
    const renderWith = (
      current: DataMartRelationship,
      onSaved: (u: DataMartRelationship) => void
    ) => (
      <JoinSettingsForm
        relationship={current}
        dataMartId='source-dm-1'
        siblingAliases={[]}
        inheritedFrom={null}
        onSaved={onSaved}
      />
    );
    const onSaved = vi.fn();
    const { rerender } = render(renderWith(relationship, onSaved));
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });

    fireEvent.change(getAliasInput(), { target: { value: 'cust' } });
    await waitFor(
      () => {
        expect(dataMartRelationshipService.updateRelationship).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 }
    );
    // Typed on while the save is on the wire.
    fireEvent.change(getAliasInput(), { target: { value: 'custo' } });

    // The parent hands back the saved relationship, as the Models canvas sheet does.
    const saved = { ...relationship, targetAlias: 'cust' };
    resolveSave(saved);
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(saved, { afterUnmount: false });
    });
    rerender(renderWith(saved, onSaved));

    expect(getAliasInput().value).toBe('custo');
    await waitFor(
      () => {
        expect(dataMartRelationshipService.updateRelationship).toHaveBeenLastCalledWith(
          'source-dm-1',
          'rel-1',
          { targetAlias: 'custo' },
          expect.anything()
        );
      },
      { timeout: 2000 }
    );
  });

  it('saves a change still waiting for its typing pause when it unmounts', async () => {
    const onSaved = vi.fn();
    const { unmount } = render(
      <JoinSettingsForm
        relationship={buildRelationship()}
        dataMartId='source-dm-1'
        siblingAliases={[]}
        inheritedFrom={null}
        onSaved={onSaved}
      />
    );
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });

    fireEvent.change(getAliasInput(), { target: { value: 'buyers' } });
    // The panel closes, or the row collapses, before the pause is over.
    unmount();

    await waitFor(() => {
      expect(dataMartRelationshipService.updateRelationship).toHaveBeenCalledWith(
        'source-dm-1',
        'rel-1',
        { targetAlias: 'buyers' },
        expect.anything()
      );
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    // The parent hears it came after the form was gone, so it can update quietly.
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ targetAlias: 'buyers' }), {
      afterUnmount: true,
    });
  });

  it('sends the unmount save only after its own save still on the wire', async () => {
    let resolveFirst: (saved: DataMartRelationship) => void = () => undefined;
    vi.mocked(dataMartRelationshipService.updateRelationship).mockImplementationOnce(
      () =>
        new Promise<DataMartRelationship>(resolve => {
          resolveFirst = resolve;
        })
    );
    const { unmount } = renderForm(buildRelationship());
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });
    fireEvent.change(getAliasInput(), { target: { value: 'cust' } });
    await waitFor(
      () => {
        expect(dataMartRelationshipService.updateRelationship).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 }
    );

    fireEvent.change(getAliasInput(), { target: { value: 'custo' } });
    unmount();
    await new Promise(resolve => setTimeout(resolve, 0));
    // Sent side by side, the older PATCH could land last and win.
    expect(dataMartRelationshipService.updateRelationship).toHaveBeenCalledTimes(1);

    resolveFirst(buildRelationship({ targetAlias: 'cust' }));
    await waitFor(() => {
      expect(dataMartRelationshipService.updateRelationship).toHaveBeenCalledTimes(2);
    });
    expect(dataMartRelationshipService.updateRelationship).toHaveBeenLastCalledWith(
      'source-dm-1',
      'rel-1',
      { targetAlias: 'custo' },
      expect.anything()
    );
  });

  it('sends nothing on unmount for an alias the form would not save', async () => {
    const { unmount } = renderForm(buildRelationship());
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });

    fireEvent.change(getAliasInput(), { target: { value: 'Not Valid!' } });
    await waitFor(() => {
      expect(screen.getByText(/Field prefix must contain only/)).toBeInTheDocument();
    });
    unmount();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dataMartRelationshipService.updateRelationship).not.toHaveBeenCalled();
  });

  it('sends nothing on unmount for an incomplete join field row', async () => {
    const { unmount } = renderForm(buildRelationship());
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Join Field' }));
    unmount();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dataMartRelationshipService.updateRelationship).not.toHaveBeenCalled();
  });

  it('sends nothing on unmount when read-only', async () => {
    const { unmount } = render(
      <JoinSettingsForm
        relationship={buildRelationship()}
        dataMartId='source-dm-1'
        readOnly
        siblingAliases={[]}
        inheritedFrom={null}
        onSaved={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });

    fireEvent.change(getAliasInput(), { target: { value: 'buyers' } });
    unmount();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dataMartRelationshipService.updateRelationship).not.toHaveBeenCalled();
  });

  it('sends nothing on unmount when nothing changed', async () => {
    const { unmount } = renderForm(buildRelationship());
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });

    unmount();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dataMartRelationshipService.updateRelationship).not.toHaveBeenCalled();
  });

  it('resets to the saved settings when they change on the server', async () => {
    const relationship = buildRelationship();
    const { rerender } = renderForm(relationship);
    await waitFor(() => {
      expect(getAliasInput().value).toBe('customers');
    });
    fireEvent.change(getAliasInput(), { target: { value: 'cust' } });

    rerender(
      <JoinSettingsForm
        relationship={{ ...relationship, targetAlias: 'buyers' }}
        dataMartId='source-dm-1'
        siblingAliases={[]}
        inheritedFrom={null}
        onSaved={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(getAliasInput().value).toBe('buyers');
    });
  });
});
