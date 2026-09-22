import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JoinSettingsForm } from './JoinSettingsForm';
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
