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

function renderNode(onOpenExternal = vi.fn(), fields: CanvasNodeField[] = DEFAULT_FIELDS) {
  const props = {
    id: 'orders',
    type: 'modelCanvasNode',
    data: {
      title: 'Orders',
      isDraft: false,
      fieldCount: fields.length,
      description: 'Customer order facts',
      definitionType: DataMartDefinitionType.VIEW,
      fields,
      viewMode: 'erd',
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
});
