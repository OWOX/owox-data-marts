import type { NodeProps } from '@xyflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelCanvasFlowNode, {
  NODE_HEIGHT,
  type ModelCanvasFlowNodeType,
} from './ModelCanvasFlowNode';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
}));

function renderNode(
  onOpenExternal = vi.fn(),
  onOpenQuality = vi.fn(),
  onRunQuality = vi.fn().mockResolvedValue(undefined),
  onParentClick = vi.fn()
) {
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
      onOpenQuality,
      onRunQuality,
      qualitySummary: {
        state: 'ISSUES',
        enabledChecks: 3,
        totalChecks: 3,
        passedChecks: 2,
        failedChecks: 1,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 1,
        errorFindings: 0,
        violationCount: 7,
        highestSeverity: 'warning',
        dataMartRunId: 'run-1',
        lastRunAt: '2026-07-15T12:00:00.000Z',
      },
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

  return render(
    <div onClick={onParentClick}>
      <ModelCanvasFlowNode {...props} />
    </div>
  );
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

  it('opens the Quality tab from the status icon without bubbling to the node', () => {
    const onOpenQuality = vi.fn();
    const parentClick = vi.fn();
    renderNode(vi.fn(), onOpenQuality, undefined, parentClick);

    fireEvent.click(
      screen.getByRole('button', { name: /^Open Data Quality for Orders: Issues found/ })
    );

    expect(onOpenQuality).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('aligns the quality glyph with the start of the node title', () => {
    renderNode();

    expect(
      screen.getByRole('button', { name: /^Open Data Quality for Orders: Issues found/ })
    ).toHaveClass('-ml-0.5');
  });

  it('shows the Data Quality checks details when the icon is hovered', async () => {
    renderNode();

    const qualityAction = screen.getByRole('button', {
      name: /^Open Data Quality for Orders: Issues found/,
    });
    fireEvent.pointerEnter(qualityAction, { pointerType: 'mouse' });

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: 'Data Quality checks for Orders' })
      ).toBeInTheDocument();
    });
    const details = screen.getByRole('region', { name: 'Data Quality checks for Orders' });
    expect(screen.getByRole('heading', { name: 'Data Quality checks' })).toBeInTheDocument();
    expect(details).toHaveTextContent('Issues found');
    expect(details).toHaveTextContent('3 enabled');
  });

  it('provides the non-bubbling run action inside the quality details', async () => {
    const onRunQuality = vi.fn().mockResolvedValue(undefined);
    const parentClick = vi.fn();
    renderNode(vi.fn(), vi.fn(), onRunQuality, parentClick);

    expect(
      screen.queryByRole('button', { name: 'Run Quality for Orders' })
    ).not.toBeInTheDocument();
    fireEvent.pointerEnter(
      screen.getByRole('button', { name: /^Open Data Quality for Orders: Issues found/ }),
      { pointerType: 'mouse' }
    );
    const runAction = await screen.findByRole('button', { name: 'Run Quality for Orders' });
    fireEvent.click(runAction);

    await waitFor(() => {
      expect(onRunQuality).toHaveBeenCalledOnce();
    });
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('reserves enough layout height for the quality controls', () => {
    expect(NODE_HEIGHT).toBe(74);
  });
});
