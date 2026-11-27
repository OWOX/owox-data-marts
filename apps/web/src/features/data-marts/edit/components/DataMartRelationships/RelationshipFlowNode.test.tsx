import type { NodeProps } from '@xyflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ErdCardField } from '../../../shared/canvas/erd-fields';
import { ALL_HIDDEN, NOTHING_HIDDEN } from '../../../shared/canvas/object-labels';
import { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import { RelationshipFlowNode, type RelationshipFlowNodeType } from './RelationshipCanvas';
import {
  aliasBadgeTitle,
  hasRelationshipCardFooter,
  relationshipCardBadgeLines,
  type RelationshipCardDetails,
} from './relationship-card';

vi.mock('../../../shared/canvas/measure-badge-text', () => ({
  measureBadgeText: (text: string) => text.length * 6,
}));

vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    // The real hook needs a mounted ReactFlow store; the node renders bare here.
    useUpdateNodeInternals: () => () => undefined,
  };
});

function renderNode(
  onOpenExternal = vi.fn(),
  dataOverrides: Partial<RelationshipFlowNodeType['data']> = {}
) {
  const base = {
    isSource: false,
    label: 'Customers',
    targetAlias: 'customers',
    fieldCount: 3,
    description: 'Customer dimension',
    definitionType: null,
    isDraft: false,
    isBlocked: false,
    isJoinNotConfigured: false,
    isCycleStub: false,
    isMissingPrimaryKey: false,
    userHasAccess: true,
    hasOutgoing: false,
    highlighted: false,
    dimmed: false,
    fields: [],
    viewMode: 'compact' as const,
    objectLabels: NOTHING_HIDDEN,
    direction: 'horizontal' as const,
    onOpenExternal,
    onOpenQuality: vi.fn(),
    onRunQuality: vi.fn(() => Promise.resolve()),
    ...dataOverrides,
  };
  // The canvas packs the pills and decides the footer before rendering — do the same here.
  const data = {
    ...base,
    badgeLines:
      dataOverrides.badgeLines ??
      relationshipCardBadgeLines(
        {
          definitionType: base.definitionType,
          targetAlias: base.targetAlias,
          fieldCount: base.fieldCount,
          triggersCount: base.details?.triggersCount,
          reportsCount: base.details?.reportsCount,
          relationshipCount: base.details?.relationshipCount,
        },
        base.isSource ? 'compact' : base.viewMode,
        base.objectLabels
      ),
    withFooter:
      dataOverrides.withFooter ?? hasRelationshipCardFooter(base.details, base.objectLabels),
  };
  const props = {
    id: 'customers',
    type: 'relationshipNode',
    data,
    dragging: false,
    zIndex: 0,
    selectable: false,
    deletable: false,
    selected: false,
    draggable: false,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as NodeProps<RelationshipFlowNodeType>;

  return render(<RelationshipFlowNode {...props} />);
}

describe('RelationshipFlowNode', () => {
  it('shows the description tooltip from a keyboard-focusable trigger', async () => {
    renderNode();

    const descriptionHelp = screen.getByRole('button', { name: 'Description for Customers' });
    act(() => {
      descriptionHelp.focus();
    });

    expect(descriptionHelp).toHaveFocus();
    await waitFor(() => {
      expect(descriptionHelp).toHaveAttribute('aria-describedby');
    });
    const descriptionId = descriptionHelp.getAttribute('aria-describedby');
    expect(document.getElementById(descriptionId ?? '')).toHaveTextContent('Customer dimension');
  });

  it('includes the data mart title in the external action name', () => {
    const onOpenExternal = vi.fn();
    renderNode(onOpenExternal);

    fireEvent.click(screen.getByRole('button', { name: 'Open Customers in new tab' }));

    expect(onOpenExternal).toHaveBeenCalledOnce();
  });

  it('renders the missing-primary-key attention marker (amber triangle), not a warning badge', () => {
    renderNode(vi.fn(), { isMissingPrimaryKey: true });

    // A no-PK join still works, so it is an "attention" (amber triangle), never a Draft-style warning badge.
    expect(screen.getByText('No primary key')).toBeInTheDocument();
    expect(document.querySelector('.lucide-triangle-alert')).toBeTruthy();
  });

  it('does not render an attention marker when the target has a primary key', () => {
    renderNode();

    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
    expect(document.querySelector('.lucide-triangle-alert')).toBeNull();
  });

  it('shows the Draft warning badge with precedence over a missing primary key', () => {
    renderNode(vi.fn(), { isDraft: true, isMissingPrimaryKey: true });

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('No primary key')).not.toBeInTheDocument();
    expect(document.querySelector('.lucide-triangle-alert')).toBeNull();
  });

  it('renders collapsed field rows in the ERD view and expands them in place', () => {
    renderNode(vi.fn(), { viewMode: 'erd', fields: buildFields(6) });

    expect(screen.getByText('field_0')).toBeInTheDocument();
    expect(screen.getByText('field_3')).toBeInTheDocument();
    expect(screen.queryByText('field_4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+2 more fields/ }));

    expect(screen.getByText('field_5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show less/ })).toBeInTheDocument();
  });

  it('leads with the blend alias and adds the description under it in the ERD view', () => {
    const [aliased, plain] = buildFields(2);
    const { container } = renderNode(vi.fn(), {
      viewMode: 'erd',
      fields: [{ ...aliased, alias: 'Customer key', description: 'Joins to orders' }, plain],
    });

    expect(screen.getByText('Customer key')).toBeInTheDocument();
    expect(screen.queryByText('field_0')).not.toBeInTheDocument();
    expect(container.querySelector('[title="Customer key · field_0"]')).toBeInTheDocument();
    expect(screen.getByText('Joins to orders')).toBeInTheDocument();
    // An alias equal to the name just shows the name.
    expect(screen.getByText('field_1')).toBeInTheDocument();
  });

  it('shows the technical name and no description when their object labels are unticked', () => {
    const [aliased] = buildFields(1);
    renderNode(vi.fn(), {
      viewMode: 'erd',
      fields: [{ ...aliased, alias: 'Customer key', description: 'Joins to orders' }],
      objectLabels: { ...NOTHING_HIDDEN, fieldAlias: true, fieldDescription: true },
    });

    expect(screen.getByText('field_0')).toBeInTheDocument();
    expect(screen.queryByText('Customer key')).not.toBeInTheDocument();
    expect(screen.queryByText('Joins to orders')).not.toBeInTheDocument();
  });

  it('renders no field rows in Compact view even when fields exist', () => {
    renderNode(vi.fn(), { viewMode: 'compact', fields: buildFields(3) });

    expect(screen.queryByText('field_0')).not.toBeInTheDocument();
  });

  it('hides the object labels when all are unchecked but keeps the alias badge', () => {
    renderNode(vi.fn(), { objectLabels: ALL_HIDDEN });

    // The alias badge is join configuration, not an object label — it stays.
    expect(screen.getByText('customers')).toBeInTheDocument();
    expect(screen.queryByText('3 fields')).not.toBeInTheDocument();
  });

  it('shows the field count when the fields object label is checked', () => {
    renderNode(vi.fn(), { objectLabels: NOTHING_HIDDEN });

    expect(screen.getByText('3 fields')).toBeInTheDocument();
  });

  it('shows the Models card pills: input source, alias, fields and the Data Mart counts', () => {
    renderNode(vi.fn(), {
      definitionType: DataMartDefinitionType.VIEW,
      details: { triggersCount: 2, reportsCount: 1, relationshipCount: 4 },
    });

    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('customers')).toHaveAttribute('title', aliasBadgeTitle('customers'));
    expect(screen.getByText('3 fields')).toBeInTheDocument();
    expect(screen.getByText('2 triggers')).toBeInTheDocument();
    expect(screen.getByText('1 report')).toBeInTheDocument();
    expect(screen.getByText('4 relationships')).toBeInTheDocument();
  });

  it('shows no pill for a count of zero or a count still unknown', () => {
    renderNode(vi.fn(), { fieldCount: 0, details: { triggersCount: 0 } });

    expect(screen.queryByText(/field/)).not.toBeInTheDocument();
    expect(screen.queryByText(/trigger/)).not.toBeInTheDocument();
    expect(screen.queryByText(/report/)).not.toBeInTheDocument();
  });

  it('shows the quality, freshness and sharing footer once the details are known', () => {
    const details: RelationshipCardDetails = {
      dataLastUpdated: null,
      availableForReporting: true,
      availableForMaintenance: false,
    };
    renderNode(vi.fn(), { details });

    expect(screen.getByRole('button', { name: /Data Last Updated/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shared for reporting' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Shared for maintenance' })
    ).not.toBeInTheDocument();
  });

  it('drops the footer when its object label is unticked or the details are unknown', () => {
    const details: RelationshipCardDetails = { availableForReporting: true };
    renderNode(vi.fn(), { details, objectLabels: { ...NOTHING_HIDDEN, footer: true } });
    expect(screen.queryByRole('button', { name: 'Shared for reporting' })).not.toBeInTheDocument();

    renderNode(vi.fn(), { details: undefined });
    expect(screen.queryByRole('button', { name: /Data Last Updated/ })).not.toBeInTheDocument();
  });

  it('gives the root card no "open in new tab" action and no alias', () => {
    renderNode(vi.fn(), { isSource: true, targetAlias: undefined, fieldCount: undefined });

    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Customers in new tab' })
    ).not.toBeInTheDocument();
  });

  it('names a draft once, in the warning above the card', () => {
    renderNode(vi.fn(), { isDraft: true });

    expect(screen.getAllByText('Draft')).toHaveLength(1);
  });
});

function buildFields(count: number): ErdCardField[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `field_${String(index)}`,
    alias: `field_${String(index)}`,
    type: 'STRING',
    isPrimaryKey: false,
    isHidden: false,
  }));
}
