import type { NodeProps } from '@xyflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RelationshipFlowNode, type RelationshipFlowNodeType } from './RelationshipCanvas';

vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
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
      isDraft: false,
      isBlocked: false,
      isJoinNotConfigured: false,
      isCycleStub: false,
      isMissingPrimaryKey: false,
      userHasAccess: true,
      hasOutgoing: false,
      highlighted: false,
      dimmed: false,
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
});
