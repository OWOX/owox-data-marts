import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelationshipAccordionItem } from './RelationshipAccordionItem';
import type {
  DataMartRelationship,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';

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
  it('renders the "No primary key" badge when the target data mart has no primary key', () => {
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
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
      />
    );

    expect(screen.getByText('No primary key')).toBeInTheDocument();
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
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
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
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
      />
    );

    expect(screen.getByText('Draft')).toBeInTheDocument();
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
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
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
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
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
        onAliasChange={noop}
        onHideForReportingChange={noop}
        onFieldOverrideChange={noop}
      />
    );

    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
  });
});
