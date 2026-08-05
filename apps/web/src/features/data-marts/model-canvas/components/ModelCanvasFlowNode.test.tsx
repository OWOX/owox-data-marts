import type { NodeProps } from '@xyflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import type { CanvasNodeField } from '../model/types';
import ModelCanvasFlowNode, { type ModelCanvasFlowNodeType } from './ModelCanvasFlowNode';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
}));

const DEFAULT_FIELDS: CanvasNodeField[] = [
  {
    name: 'order_id',
    alias: 'Order ID',
    type: 'STRING',
    isPrimaryKey: true,
    isHidden: false,
  },
  {
    name: 'customer_id',
    alias: 'Customer ID',
    type: 'INTEGER',
    isPrimaryKey: false,
    isHidden: false,
  },
  { name: 'status', alias: 'Status', type: 'STRING', isPrimaryKey: false, isHidden: false },
];

function renderNode(
  onOpenExternal = vi.fn(),
  fields: CanvasNodeField[] = DEFAULT_FIELDS,
  onOpenQuality = vi.fn(),
  onRunQuality = vi.fn().mockResolvedValue(undefined),
  onParentClick = vi.fn(),
  objectLabels?: { source: boolean; fields: boolean; status: boolean }
) {
  const props = {
    id: 'orders',
    type: 'modelCanvasNode',
    data: {
      title: 'Orders',
      isDraft: false,
      dataLastUpdated: null,
      fieldCount: fields.length,
      description: 'Customer order facts',
      definitionType: DataMartDefinitionType.VIEW,
      fields,
      viewMode: 'erd',
      objectLabels,
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

  it('shows all field rows without an expand toggle when they fit the collapsed cap', () => {
    renderNode();

    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more field/ })).not.toBeInTheDocument();
  });

  it('collapses long field lists and expands them in place', () => {
    const manyFields: CanvasNodeField[] = Array.from({ length: 6 }, (_, i) => ({
      name: `field_${String(i)}`,
      alias: `Field ${String(i)}`,
      type: 'STRING',
      isPrimaryKey: i === 0,
      isHidden: false,
    }));
    renderNode(vi.fn(), manyFields);

    expect(screen.getByText('Field 3')).toBeInTheDocument();
    expect(screen.queryByText('Field 4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+2 more fields' }));
    expect(screen.getByText('Field 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Field 5')).not.toBeInTheDocument();
  });

  it('hides the badge, field count and status dot when all object labels are hidden', () => {
    const { container } = renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, undefined, {
      source: true,
      fields: true,
      status: true,
    });

    expect(screen.queryByText('View')).not.toBeInTheDocument();
    expect(screen.queryByText('3 fields')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Published')).not.toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    // Title-only mode also drops the quality indicators row.
    expect(screen.queryByLabelText('Data Quality checks for Orders')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Data Last Updated for Orders/)).not.toBeInTheDocument();
    // The ERD body (field rows) is a view-mode concern and stays visible.
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(container.querySelector('[title="Orders"]')).toBeInTheDocument();
  });

  it('hides only the field count when the fields label is unticked', () => {
    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, undefined, {
      source: false,
      fields: true,
      status: false,
    });

    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.queryByText('3 fields')).not.toBeInTheDocument();
    expect(screen.getByTitle('Published')).toBeInTheDocument();
  });

  it('orders primary keys first in the field list', () => {
    const fields: CanvasNodeField[] = [
      { name: 'b', alias: 'B', type: 'STRING', isPrimaryKey: false, isHidden: false },
      { name: 'a', alias: 'A', type: 'STRING', isPrimaryKey: true, isHidden: false },
    ];
    const { container } = renderNode(vi.fn(), fields);

    const rowTexts = [...container.querySelectorAll('[title]')]
      .map(el => el.getAttribute('title'))
      .filter(title => title === 'A' || title === 'B');
    expect(rowTexts).toEqual(['A', 'B']);
  });

  it('opens the Quality tab from the status details without bubbling to the node', async () => {
    const onOpenQuality = vi.fn();
    const parentClick = vi.fn();
    renderNode(vi.fn(), DEFAULT_FIELDS, onOpenQuality, undefined, parentClick);

    fireEvent.click(
      screen.getByRole('button', { name: /^Open Data Quality for Orders: Issues found/ })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Data Quality page for Orders' })
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

  it('renders Data Quality indicators and the field count on one row below the badge', () => {
    renderNode();

    const qualityRow = screen.getByRole('button', {
      name: /^Open Data Quality for Orders: Issues found/,
    }).parentElement;
    const metadataRow = screen.getByText('View').parentElement;

    expect(qualityRow).not.toBe(metadataRow);
    // The field count shares the status row with the quality indicators, so
    // cards stay one row shorter than with a dedicated field-count line.
    expect(screen.getByText('3 fields').parentElement).toBe(qualityRow);
  });

  it('provides the non-bubbling run action inside the quality details', async () => {
    const onRunQuality = vi.fn().mockResolvedValue(undefined);
    const parentClick = vi.fn();
    renderNode(vi.fn(), DEFAULT_FIELDS, vi.fn(), onRunQuality, parentClick);

    expect(
      screen.queryByRole('button', { name: 'Run Quality for Orders' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /^Open Data Quality for Orders: Issues found/ })
    );
    const runAction = await screen.findByRole('button', { name: 'Run Quality for Orders' });
    fireEvent.click(runAction);

    await waitFor(() => {
      expect(onRunQuality).toHaveBeenCalledOnce();
    });
    expect(parentClick).not.toHaveBeenCalled();
  });
});
