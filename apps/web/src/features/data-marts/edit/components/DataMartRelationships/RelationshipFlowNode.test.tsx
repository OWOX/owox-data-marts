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

function renderNode(onOpenExternal = vi.fn()) {
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
      userHasAccess: true,
      hasOutgoing: false,
      highlighted: false,
      dimmed: false,
      onOpenExternal,
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
});
