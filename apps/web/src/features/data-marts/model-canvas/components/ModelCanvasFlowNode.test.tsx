import type { NodeProps } from '@xyflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import {
  ALL_HIDDEN,
  NOTHING_HIDDEN,
  type ObjectLabelsHidden,
} from '../../shared/canvas/object-labels';
import type { CanvasNodeField } from '../model/types';
import ModelCanvasFlowNode, { type ModelCanvasFlowNodeType } from './ModelCanvasFlowNode';

// A fixed 6 px per character pins the line breaks (canvas text metrics vary by environment).
vi.mock('../../shared/canvas/measure-badge-text', () => ({
  measureBadgeText: (text: string) => text.length * 6,
}));

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => () => undefined,
  Handle: () => null,
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
}));

// A fixed 6 px per character, so line breaks do not depend on the fallback width or the view mode.
vi.mock('../../shared/canvas/measure-badge-text', () => ({
  CARD_BADGE_FONT_SIZE_PX: 11,
  measureBadgeText: (text: string) => text.length * 6,
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
  objectLabels?: ObjectLabelsHidden,
  dataOverrides: Partial<ModelCanvasFlowNodeType['data']> = {}
) {
  const props = {
    id: 'orders',
    type: 'modelCanvasNode',
    data: {
      title: 'Orders',
      isDraft: false,
      dataLastUpdated: null,
      fieldCount: fields.length,
      triggersCount: 2,
      reportsCount: 3,
      relationshipCount: 1,
      relationships: [
        {
          id: 'edge-1',
          direction: 'outgoing',
          otherDataMartId: 'customers',
          otherTitle: 'Customers',
          joinFields: [{ field: 'customer_id', otherField: 'id' }],
        },
      ],
      availableForReporting: true,
      availableForMaintenance: false,
      description: 'Customer order facts',
      icon: null,
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
  } as NodeProps<ModelCanvasFlowNodeType>;

  const view = render(
    <div onClick={onParentClick}>
      <ModelCanvasFlowNode {...props} />
    </div>
  );
  return {
    ...view,
    /** Re-renders the same card with some data changed, keeping its local state. */
    rerenderData: (changes: Partial<ModelCanvasFlowNodeType['data']>) => {
      view.rerender(
        <div onClick={onParentClick}>
          <ModelCanvasFlowNode {...props} data={{ ...props.data, ...changes }} />
        </div>
      );
    },
  };
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

  it('draws the default icon until one is picked, then the picked one', () => {
    const { container, unmount } = renderNode();
    expect(container.querySelector('.lucide-box')).not.toBeNull();
    unmount();

    const picked = renderNode(
      vi.fn(),
      DEFAULT_FIELDS,
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      vi.fn(),
      undefined,
      { icon: 'purchases' }
    );
    expect(picked.container.querySelector('.lucide-shopping-cart')).not.toBeNull();
    expect(picked.container.querySelector('.lucide-box')).toBeNull();
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

  it('leads each row with the alias, keeps the technical name on hover, and adds the description', () => {
    const fields: CanvasNodeField[] = [
      {
        name: 'order_id',
        alias: 'Order ID',
        type: 'STRING',
        description: 'Unique order key',
        isPrimaryKey: true,
        isHidden: false,
      },
      { name: 'status', alias: 'status', type: 'STRING', isPrimaryKey: false, isHidden: false },
    ];
    const { container } = renderNode(vi.fn(), fields);

    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(screen.queryByText('order_id')).not.toBeInTheDocument();
    expect(container.querySelector('[title="Order ID · order_id"]')).toBeInTheDocument();
    expect(screen.getByText('Unique order key')).toBeInTheDocument();
    // The full description is reachable on hover even when the line truncates.
    expect(container.querySelector('[title="Unique order key"]')).toBeInTheDocument();
    // A field without a distinct alias just shows its name.
    expect(screen.getByText('status')).toBeInTheDocument();
  });

  it('swaps in the technical name or drops the description when its label is unticked', () => {
    const fields: CanvasNodeField[] = [
      {
        name: 'order_id',
        alias: 'Order ID',
        type: 'STRING',
        description: 'Unique order key',
        isPrimaryKey: true,
        isHidden: false,
      },
    ];
    const { unmount, container } = renderNode(vi.fn(), fields, undefined, undefined, undefined, {
      ...NOTHING_HIDDEN,
      fieldAlias: true,
    });
    expect(screen.getByText('order_id')).toBeInTheDocument();
    expect(screen.queryByText('Order ID')).not.toBeInTheDocument();
    // …and the alias moves to the tooltip, after the (possibly truncated) row text.
    expect(container.querySelector('[title="order_id · Order ID"]')).toBeInTheDocument();
    expect(screen.getByText('Unique order key')).toBeInTheDocument();
    unmount();

    renderNode(vi.fn(), fields, undefined, undefined, undefined, {
      ...NOTHING_HIDDEN,
      fieldDescription: true,
    });
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(screen.queryByText('Unique order key')).not.toBeInTheDocument();
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

  it('hides the badges, counts and sharing when all object labels are hidden', () => {
    const { container } = renderNode(
      vi.fn(),
      DEFAULT_FIELDS,
      undefined,
      undefined,
      undefined,
      ALL_HIDDEN
    );

    expect(screen.queryByText('View')).not.toBeInTheDocument();
    expect(screen.queryByText('3 fields')).not.toBeInTheDocument();
    expect(screen.queryByText('2 triggers')).not.toBeInTheDocument();
    expect(screen.queryByText('1 relationship')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Shared for reporting')).not.toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    // The footer label drops the quality indicators row too.
    expect(screen.queryByLabelText('Data Quality checks for Orders')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Data Last Updated for Orders/)).not.toBeInTheDocument();
    // The ERD body (field rows) is a view-mode concern and stays visible —
    // only the alias swaps back to the technical name.
    expect(screen.getByText('order_id')).toBeInTheDocument();
    expect(screen.queryByText('Order ID')).not.toBeInTheDocument();
    expect(container.querySelector('[title="Orders"]')).toBeInTheDocument();
  });

  it('hides only the triggers badge when the triggers label is unticked', () => {
    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, undefined, {
      ...NOTHING_HIDDEN,
      triggers: true,
    });

    expect(screen.queryByText('2 triggers')).not.toBeInTheDocument();
    expect(screen.getByText('3 fields')).toBeInTheDocument();
    expect(screen.getByText('1 relationship')).toBeInTheDocument();
    expect(screen.getByLabelText('Shared for reporting')).toBeInTheDocument();
  });

  it('hides only the footer when the quality and sharing label is unticked', () => {
    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, undefined, {
      ...NOTHING_HIDDEN,
      footer: true,
    });

    expect(screen.queryByLabelText('Data Quality checks for Orders')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Shared for reporting')).not.toBeInTheDocument();
    expect(screen.getByText('2 triggers')).toBeInTheDocument();
    expect(screen.getByText('1 relationship')).toBeInTheDocument();
  });

  it('hides only the field count when the fields label is unticked', () => {
    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, undefined, {
      ...NOTHING_HIDDEN,
      fields: true,
    });

    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.queryByText('3 fields')).not.toBeInTheDocument();
    expect(screen.getByText('2 triggers')).toBeInTheDocument();
  });

  it('shows a Draft pill only for drafts and only while the status label is ticked', () => {
    const { unmount } = renderNode();
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
    unmount();

    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, undefined, undefined, {
      isDraft: true,
    });
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('shows the triggers and relationships counts and the sharing flags that are on', () => {
    renderNode();

    expect(screen.getByText('2 triggers')).toBeInTheDocument();
    expect(screen.getByText('1 relationship')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shared for reporting' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Shared for maintenance' })
    ).not.toBeInTheDocument();
  });

  it('hides the badges whose count is zero and drops the emptied row', () => {
    renderNode(vi.fn(), [], undefined, undefined, undefined, undefined, {
      triggersCount: 0,
      reportsCount: 0,
      relationshipCount: 0,
    });

    expect(screen.queryByText(/field/)).not.toBeInTheDocument();
    expect(screen.queryByText(/trigger/)).not.toBeInTheDocument();
    expect(screen.queryByText(/report/)).not.toBeInTheDocument();
    expect(screen.queryByText(/relationship/)).not.toBeInTheDocument();
    // The source badge still shows, and the footer keeps the indicators.
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shared for reporting' })).toBeInTheDocument();
  });

  it('packs the badges onto as few lines as fit the card', () => {
    renderNode();

    // ERD line: 256 − 26 = 230 px; each badge is its text (6 px/char) + 30 px.
    // View (54) + 3 fields (78) + 2 triggers (90) = 230 fits; 3 reports + 1 relationship wrap.
    const firstLine = screen.getByText('View').parentElement;
    expect(screen.getByText('2 triggers').parentElement).toBe(firstLine);
    const secondLine = screen.getByText('3 reports').parentElement;
    expect(secondLine).not.toBe(firstLine);
    expect(screen.getByRole('button', { name: 'Show relationships of Orders' }).parentElement).toBe(
      secondLine
    );
  });

  it('opens the relationships list from its badge without selecting the card', () => {
    const parentClick = vi.fn();
    const onRaisedChange = vi.fn();
    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, parentClick, undefined, {
      onRaisedChange,
    });

    const badge = screen.getByRole('button', { name: 'Show relationships of Orders' });
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    // Same link icon as the Joinable Data Marts section.
    expect(badge.querySelector('svg.lucide-link2')).toBeInTheDocument();
    fireEvent.click(badge);

    const list = screen.getByRole('list', { name: 'Relationships of Orders' });
    expect(list).toHaveTextContent('Customers');
    expect(list).toHaveTextContent('customer_id = id');
    expect(screen.getByRole('button', { name: 'Hide relationships of Orders' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(parentClick).not.toHaveBeenCalled();

    // The open list may run over the card below, so the card asks to be lifted meanwhile.
    expect(onRaisedChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Hide relationships of Orders' }));
    expect(screen.queryByRole('list', { name: 'Relationships of Orders' })).not.toBeInTheDocument();
    expect(onRaisedChange).toHaveBeenLastCalledWith(false);
  });

  it('opens a relationship picked in the list without selecting the card', () => {
    const parentClick = vi.fn();
    const onOpenRelationship = vi.fn();
    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, parentClick, undefined, {
      onOpenRelationship,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show relationships of Orders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the relationship with Customers' }));

    expect(onOpenRelationship).toHaveBeenCalledWith('edge-1');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('hides an open list, and drops the lift, once its badge is hidden', () => {
    const onRaisedChange = vi.fn();
    const { rerenderData } = renderNode(
      vi.fn(),
      DEFAULT_FIELDS,
      undefined,
      undefined,
      undefined,
      undefined,
      { viewMode: 'compact', onRaisedChange }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show relationships of Orders' }));
    expect(screen.getByRole('list', { name: 'Relationships of Orders' })).toBeInTheDocument();

    // Unticking the relationships label removes the badge, so the list goes with it.
    rerenderData({ objectLabels: { ...NOTHING_HIDDEN, relationships: true } });
    expect(screen.queryByRole('list', { name: 'Relationships of Orders' })).not.toBeInTheDocument();
    expect(onRaisedChange).toHaveBeenLastCalledWith(false);

    // The same holds for the field list when the field count label is unticked.
    rerenderData({ objectLabels: NOTHING_HIDDEN });
    fireEvent.click(screen.getByRole('button', { name: 'Show fields of Orders' }));
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    rerenderData({ objectLabels: { ...NOTHING_HIDDEN, fields: true } });
    expect(screen.queryByText('Order ID')).not.toBeInTheDocument();
  });

  it('opens the field list from the field count in the Compact view only', () => {
    const { unmount } = renderNode(
      vi.fn(),
      DEFAULT_FIELDS,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        viewMode: 'compact',
      }
    );

    expect(screen.queryByText('Order ID')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show fields of Orders' }));
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    // Opening one section closes the other.
    fireEvent.click(screen.getByRole('button', { name: 'Show relationships of Orders' }));
    expect(screen.queryByText('Order ID')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Relationships of Orders' })).toBeInTheDocument();
    unmount();

    // The ERD view already lists the fields, so there the count is a plain badge.
    renderNode();
    expect(screen.queryByRole('button', { name: 'Show fields of Orders' })).not.toBeInTheDocument();
    expect(screen.getByText('3 fields')).toBeInTheDocument();
  });

  it('explains a sharing flag in a tooltip with the Share Data Mart wording', async () => {
    renderNode();

    const flag = screen.getByRole('button', { name: 'Shared for reporting' });
    act(() => {
      flag.focus();
    });

    await waitFor(() => {
      expect(flag).toHaveAttribute('aria-describedby');
    });
    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
      'All project members can see this Data Mart and build reports on it'
    );
  });

  it('waits for enrichment before showing the triggers count', () => {
    renderNode(vi.fn(), DEFAULT_FIELDS, undefined, undefined, undefined, undefined, {
      triggersCount: undefined,
    });

    expect(screen.queryByText(/trigger/)).not.toBeInTheDocument();
    expect(screen.getByText('1 relationship')).toBeInTheDocument();
  });

  it('orders primary keys first in the field list', () => {
    const fields: CanvasNodeField[] = [
      { name: 'b', alias: 'B', type: 'STRING', isPrimaryKey: false, isHidden: false },
      { name: 'a', alias: 'A', type: 'STRING', isPrimaryKey: true, isHidden: false },
    ];
    const { container } = renderNode(vi.fn(), fields);

    const rowTexts = [...container.querySelectorAll('[title]')]
      .map(el => el.getAttribute('title'))
      .filter(title => title === 'A · a' || title === 'B · b');
    // Rows lead with the alias and add the technical name to the tooltip.
    expect(rowTexts).toEqual(['A · a', 'B · b']);
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

  it('renders the Data Quality indicators in the footer, below the count badges', () => {
    renderNode();

    const qualityRow = screen.getByRole('button', {
      name: /^Open Data Quality for Orders: Issues found/,
    }).parentElement;

    expect(screen.getByText('View').closest('div')).not.toBe(qualityRow);
    expect(screen.getByText('3 fields').closest('div')).not.toBe(qualityRow);
    expect(qualityRow).toContainElement(
      screen.getByRole('button', { name: 'Shared for reporting' })
    );
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
