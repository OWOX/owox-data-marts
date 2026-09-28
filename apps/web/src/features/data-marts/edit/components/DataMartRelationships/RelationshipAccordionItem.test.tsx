import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RelationshipAccordionItem } from './RelationshipAccordionItem';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  DataMartRelationship,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';

vi.mock('../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    updateRelationship: vi.fn(),
  },
}));

vi.mock('../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({
    navigate: vi.fn(),
    scope: (path: string) => path,
    projectId: 'project-1',
  }),
}));

function buildRelationship(overrides: Partial<DataMartRelationship> = {}): DataMartRelationship {
  return {
    id: 'rel-1',
    dataStorageId: 'storage-1',
    sourceDataMart: {
      id: 'source-dm-1',
      title: 'Source DM',
      status: 'PUBLISHED',
      userHasAccess: true,
      hasPrimaryKey: true,
    },
    targetDataMart: {
      id: 'target-dm-1',
      title: 'Target DM',
      status: 'PUBLISHED',
      userHasAccess: true,
      hasPrimaryKey: true,
    },
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
    createdById: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function buildRow(overrides: Partial<TransientRelationshipRow> = {}): TransientRelationshipRow {
  const relationship = overrides.relationship ?? buildRelationship();
  return {
    relationship,
    depth: 1,
    parentDataMartTitle: 'Root DM',
    sourceDmId: relationship.sourceDataMart.id,
    isBlocked: false,
    aliasPath: 'orders',
    rowKey: 'rel-1',
    isCycleStub: false,
    ...overrides,
  };
}

const noopAsync = () => Promise.resolve();
const noop = () => {
  /* no-op */
};

describe('RelationshipAccordionItem — No primary key badge', () => {
  it('renders the "No primary key" badge as the amber AttentionBadge, not the orange WarningBadge', () => {
    const row = buildRow({
      relationship: buildRelationship({
        targetDataMart: {
          id: 'target-dm-1',
          title: 'Target DM',
          status: 'PUBLISHED',
          userHasAccess: true,
          hasPrimaryKey: false,
        },
      }),
    });

    render(
      <RelationshipAccordionItem
        row={row}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        onDelete={noopAsync}
        onRelationshipUpdated={noop}
        onRelationshipDescriptionSaved={noop}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    const badge = screen.getByText('No primary key');
    expect(badge).toBeInTheDocument();
    const badgeEl = badge.closest('[class*="border-amber"]');
    expect(badgeEl).toBeTruthy();
    expect(badgeEl?.className).not.toContain('border-orange');
    expect(badgeEl?.querySelector('.lucide-triangle-alert')).toBeTruthy();
  });

  it('does not render the badge when the target data mart has a primary key', () => {
    const row = buildRow();

    render(
      <RelationshipAccordionItem
        row={row}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        onDelete={noopAsync}
        onRelationshipUpdated={noop}
        onRelationshipDescriptionSaved={noop}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
  });

  it('does not render the badge when the target data mart is a Draft (Draft badge takes precedence)', () => {
    const row = buildRow({
      relationship: buildRelationship({
        targetDataMart: {
          id: 'target-dm-1',
          title: 'Target DM',
          status: 'DRAFT',
          userHasAccess: true,
          hasPrimaryKey: false,
        },
      }),
    });

    render(
      <RelationshipAccordionItem
        row={row}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        onDelete={noopAsync}
        onRelationshipUpdated={noop}
        onRelationshipDescriptionSaved={noop}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    const draftBadge = screen.getByText('Draft');
    expect(draftBadge).toBeInTheDocument();
    expect(draftBadge.className).toContain('border-orange');
    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
  });

  it('does not render the badge when the relationship is Blocked (Blocked badge takes precedence)', () => {
    const row = buildRow({
      isBlocked: true,
      relationship: buildRelationship({
        targetDataMart: {
          id: 'target-dm-1',
          title: 'Target DM',
          status: 'PUBLISHED',
          userHasAccess: true,
          hasPrimaryKey: false,
        },
      }),
    });

    render(
      <RelationshipAccordionItem
        row={row}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        onDelete={noopAsync}
        onRelationshipUpdated={noop}
        onRelationshipDescriptionSaved={noop}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    // A non-functional (Blocked) join must not also raise the "works, heads up"
    // attention — matches the canvas single-indicator precedence.
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
  });

  it('does not render the badge when the relationship has no join conditions', () => {
    const row = buildRow({
      relationship: buildRelationship({
        joinConditions: [],
        targetDataMart: {
          id: 'target-dm-1',
          title: 'Target DM',
          status: 'PUBLISHED',
          userHasAccess: true,
          hasPrimaryKey: false,
        },
      }),
    });

    render(
      <RelationshipAccordionItem
        row={row}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        onDelete={noopAsync}
        onRelationshipUpdated={noop}
        onRelationshipDescriptionSaved={noop}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    expect(screen.getByText('Join not configured')).toBeInTheDocument();
    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
  });

  it('renders the badge when the relationship has join conditions and the target has no primary key', () => {
    const row = buildRow({
      relationship: buildRelationship({
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
        targetDataMart: {
          id: 'target-dm-1',
          title: 'Target DM',
          status: 'PUBLISHED',
          userHasAccess: true,
          hasPrimaryKey: false,
        },
      }),
    });

    render(
      <RelationshipAccordionItem
        row={row}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        onDelete={noopAsync}
        onRelationshipUpdated={noop}
        onRelationshipDescriptionSaved={noop}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    expect(screen.getByText('No primary key')).toBeInTheDocument();
  });

  it('does not render the badge for a cycle-stub row', () => {
    const row = buildRow({
      isCycleStub: true,
      relationship: buildRelationship({
        targetDataMart: {
          id: 'target-dm-1',
          title: 'Target DM',
          status: 'PUBLISHED',
          userHasAccess: true,
          hasPrimaryKey: false,
        },
      }),
    });

    render(
      <RelationshipAccordionItem
        row={row}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        onDelete={noopAsync}
        onRelationshipUpdated={noop}
        onRelationshipDescriptionSaved={noop}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
  });
});

describe('RelationshipAccordionItem — save callbacks', () => {
  beforeAll(() => {
    // jsdom has no scrollIntoView; the item scrolls itself into view after opening by default.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('routes a Description autosave to onRelationshipDescriptionSaved, not onRelationshipUpdated', async () => {
    const relationship = buildRelationship();
    const saved = { ...relationship, description: 'Product where run was occurring' };
    vi.mocked(dataMartRelationshipService.updateRelationship).mockResolvedValue(saved);
    const onRelationshipUpdated = vi.fn();
    const onRelationshipDescriptionSaved = vi.fn();

    render(
      <RelationshipAccordionItem
        row={buildRow({ relationship })}
        source={null}
        dataMartId='dm-1'
        storageId='storage-1'
        siblingAliases={[]}
        defaultOpenTab='description'
        onDelete={noopAsync}
        onRelationshipUpdated={onRelationshipUpdated}
        onRelationshipDescriptionSaved={onRelationshipDescriptionSaved}
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
        onDescriptionOverrideChange={noop}
      />
    );

    const textarea = await screen.findByPlaceholderText(/visitors from the website/i);
    fireEvent.change(textarea, { target: { value: 'Product where run was occurring' } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(onRelationshipDescriptionSaved).toHaveBeenCalledWith(saved);
    });
    expect(onRelationshipUpdated).not.toHaveBeenCalled();
    // The reload-free path must not unmount the field the user is typing in.
    expect(screen.getByPlaceholderText(/visitors from the website/i)).toBe(textarea);
  });
});
