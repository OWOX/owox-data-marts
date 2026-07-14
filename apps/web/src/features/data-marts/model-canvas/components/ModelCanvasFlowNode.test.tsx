import type { NodeProps } from '@xyflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelCanvasFlowNode, { type ModelCanvasFlowNodeType } from './ModelCanvasFlowNode';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
}));

function renderNode(onOpenExternal = vi.fn()) {
  const props = {
    id: 'orders',
    type: 'modelCanvasNode',
    data: {
      title: 'Orders',
      isDraft: false,
      fieldCount: 3,
      description: 'Customer order facts',
      hasIncoming: true,
      hasOutgoing: true,
      highlighted: false,
      dimmed: false,
      direction: 'horizontal',
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
  } as NodeProps<ModelCanvasFlowNodeType>;

  return render(<ModelCanvasFlowNode {...props} />);
}

describe('ModelCanvasFlowNode', () => {
  it('shows the description tooltip when its accessible trigger receives focus', async () => {
    renderNode();

    const descriptionHelp = screen.getByRole('button', { name: 'Description for Orders' });
    act(() => {
      descriptionHelp.focus();
    });

    expect(descriptionHelp).toHaveFocus();
    await waitFor(() => {
      expect(descriptionHelp).toHaveAttribute('aria-describedby');
    });
    const descriptionId = descriptionHelp.getAttribute('aria-describedby');
    expect(document.getElementById(descriptionId ?? '')).toHaveTextContent('Customer order facts');
    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
      'Customer order facts'
    );
  });

  it('includes the data mart title in the external action name', () => {
    const onOpenExternal = vi.fn();
    renderNode(onOpenExternal);

    fireEvent.click(screen.getByRole('button', { name: 'Open Orders in new tab' }));

    expect(onOpenExternal).toHaveBeenCalledOnce();
  });

  it('uses a non-submit external action button', () => {
    renderNode();

    expect(screen.getByRole('button', { name: 'Open Orders in new tab' })).toHaveAttribute(
      'type',
      'button'
    );
  });

  it('hides the decorative external-link icon from assistive technology', () => {
    renderNode();

    const externalAction = screen.getByRole('button', { name: 'Open Orders in new tab' });

    expect(externalAction.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
