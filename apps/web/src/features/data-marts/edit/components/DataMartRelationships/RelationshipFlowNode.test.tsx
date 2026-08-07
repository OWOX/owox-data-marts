import type { NodeProps } from '@xyflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ErdCardField } from '../../../shared/canvas/erd-fields';
import { ALL_HIDDEN, NOTHING_HIDDEN } from '../../../shared/canvas/object-labels';
import { RelationshipFlowNode, type RelationshipFlowNodeType } from './RelationshipCanvas';

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
  const props = {
    id: 'customers',
    type: 'relationshipNode',
    data: {
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
      ...dataOverrides,
    },
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

  it('renders collapsed field rows in Detailed view and expands them in place', () => {
    renderNode(vi.fn(), { viewMode: 'erd', fields: buildFields(6) });

    expect(screen.getByText('field_0')).toBeInTheDocument();
    expect(screen.getByText('field_3')).toBeInTheDocument();
    expect(screen.queryByText('field_4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+2 more fields/ }));

    expect(screen.getByText('field_5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show less/ })).toBeInTheDocument();
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
