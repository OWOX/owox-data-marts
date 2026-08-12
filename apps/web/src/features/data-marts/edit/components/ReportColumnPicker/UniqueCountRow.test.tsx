import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { UniqueCountRow, type UniqueCountRowProps } from './UniqueCountRow';
import {
  mainUniqueCountState,
  readJoinedUniqueCountState,
} from '../../../shared/utils/unique-count-availability';

function renderRow(props: Partial<UniqueCountRowProps> = {}) {
  const onCheckedChange = vi.fn();
  render(
    <TooltipProvider>
      <UniqueCountRow
        label='Unique Count'
        state={mainUniqueCountState('available')}
        checked={false}
        onCheckedChange={onCheckedChange}
        {...props}
      />
    </TooltipProvider>
  );
  const row = screen
    .getByText(props.label ?? 'Unique Count')
    .closest('[data-slot="unique-count-row"]');
  return { onCheckedChange, row: row as HTMLElement };
}

describe('UniqueCountRow — HTML structure', () => {
  // The Σ badge is taller than the row's text, so rendering its slot only when ticked grew the row
  // from 24px to 32px and shifted every row below it — measured in the browser, unmeasurable here.
  it('reserves the same trailing boxes whether or not the row is ticked', () => {
    const boxCount = (checked: boolean) => {
      const { row } = renderRow({ checked });
      const boxes = row.querySelectorAll('.h-6.w-6').length;
      cleanup();
      return boxes;
    };

    expect(boxCount(true)).toBe(boxCount(false));
    expect(boxCount(false)).toBeGreaterThan(0);
  });

  // A <label> may own exactly ONE labelable control, and the Radix Checkbox is a <button>. The
  // tooltip trigger is a second one, so the two must never share a label: browsers pick the first
  // labelable descendant as the labeled control and the pairing becomes undefined.
  it('never puts two labelable controls inside one label', () => {
    const { row } = renderRow({ state: mainUniqueCountState('primary-key-unavailable') });

    for (const label of row.querySelectorAll('label')) {
      expect(label.querySelectorAll('button, input, select, textarea')).toHaveLength(1);
    }
  });

  it('keeps the plain row a real label, so its text still toggles the checkbox', () => {
    const { onCheckedChange, row } = renderRow();

    const label = within(row).getByText('Unique Count').closest('label');
    expect(label).not.toBeNull();
    fireEvent.click(label!);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  // A <span> is not interactive content, so inside the label every click on it reached the
  // checkbox — the badge silently cleared the metric it was describing.
  it('does not toggle the row when the Σ badge is clicked', () => {
    const { onCheckedChange, row } = renderRow({ checked: true });

    const badge = row.querySelector('.text-blue-500')!;
    expect(badge.closest('label')).toBeNull();
    fireEvent.click(badge);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  // A bare `group` with no `group-hover:` consumer inside it still participates in an ancestor's
  // hover (FormItem carries one), so an unrelated hover can style this row.
  it('declares no anonymous tailwind group', () => {
    const { row } = renderRow();

    expect(row.className.split(/\s+/)).not.toContain('group');
  });
});

describe('UniqueCountRow — unavailable source', () => {
  const HINT =
    "No Primary Key is available for reporting in this Data Mart, so unique values can't be counted.\nReach your analyst to handle it";

  it('marks the checkbox aria-disabled and never uses the disabled attribute', () => {
    const { row } = renderRow({ state: mainUniqueCountState('primary-key-unavailable') });

    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    // `disabled` drops the control out of the tab order, taking the explanation with it.
    expect(checkbox).not.toBeDisabled();
    expect(checkbox.className).toMatch(/cursor-not-allowed/);
    expect(checkbox.className).toMatch(/opacity-50/);
  });

  it('announces the hint as the description, not as part of the name', () => {
    const { row } = renderRow({ state: mainUniqueCountState('primary-key-unavailable') });

    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toHaveAccessibleName('Unique Count');
    expect(checkbox).toHaveAccessibleDescription(HINT);
  });

  it('opens the hint on keyboard focus of a tab-reachable trigger', async () => {
    renderRow({ state: mainUniqueCountState('primary-key-unavailable') });

    const trigger = screen.getByRole('button', { name: 'Unique Count' });
    expect(trigger).not.toBeDisabled();
    expect(trigger).not.toHaveAttribute('tabindex', '-1');

    fireEvent.focusIn(trigger);

    // Not `toHaveTextContent`: it normalizes whitespace, which would hide a lost line break.
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe(HINT);
    expect(tooltip.className).toMatch(/whitespace-pre-line/);
  });

  it('refuses to toggle', () => {
    const { onCheckedChange, row } = renderRow({
      state: mainUniqueCountState('primary-key-unavailable'),
    });

    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  // A business user will not go and set a primary key themselves, so the row sends them nowhere —
  // the hint tells them who can. The trigger stays a focusable button, which is what keeps the
  // explanation reachable without a mouse.
  it('sends the user nowhere — the trigger is a button, never a link', () => {
    const { row } = renderRow({ state: mainUniqueCountState('primary-key-unavailable') });

    expect(within(row).queryByRole('link')).toBeNull();
    expect(within(row).getByRole('button', { name: 'Unique Count' })).toBeInTheDocument();
  });

  // Each joined verdict IS diagnosed on the backend from the raw schema, so it keeps its own cause
  // — and every one of them names the Data Mart whose key has to be fixed, since the row itself no
  // longer does. The call to action goes on its own line, after the cause.
  it.each([
    [
      'no-primary-key',
      'Primary Key is not set for Users Fanout Demo.\nReach your analyst to handle it',
    ],
    [
      'disconnected-primary-key',
      "Part of the Primary Key of Users Fanout Demo is disconnected, so unique values can't be counted.\nReach your analyst to handle it",
    ],
    [
      'nested-primary-key',
      "Unique Count doesn't support the nested Primary Key of Users Fanout Demo.\nReach your analyst to handle it",
    ],
    [
      'nested-and-disconnected-primary-key',
      "The Primary Key of Users Fanout Demo is a nested field, which Unique Count doesn't support, and part of it is disconnected.\nBoth need fixing — reach your analyst to handle it",
    ],
  ])('explains the joined verdict %s in its own words', (availability, hint) => {
    const { row } = renderRow({
      dataMartName: 'Users Fanout Demo',
      state: readJoinedUniqueCountState(availability),
    });

    expect(within(row).getByRole('checkbox')).toHaveAccessibleDescription(hint);
  });

  // Without a name there is still a sentence to write — never `Primary Key is not set for .`
  it('falls back to naming no Data Mart when it has none to name', () => {
    const { row } = renderRow({ state: readJoinedUniqueCountState('no-primary-key') });

    expect(within(row).getByRole('checkbox')).toHaveAccessibleDescription(
      'Primary Key is not set for this Data Mart.\nReach your analyst to handle it'
    );
  });

  // Inventing a cause for a state this bundle cannot read is a lie the user would act on; the
  // backend stays the authority that rejects a bad save.
  it('leaves an unreadable verdict as an ordinary enabled row', () => {
    const { onCheckedChange, row } = renderRow({
      state: readJoinedUniqueCountState('some-future-reason'),
    });

    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).not.toHaveAttribute('aria-disabled');
    expect(checkbox).not.toHaveAccessibleDescription();
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

// A selection is KEPT on a verdict this bundle cannot read, and used to render byte-identical to a
// confirmed one — so a metric already failing server-side looked live until the next save or run.
describe('UniqueCountRow — checked on an unreadable verdict', () => {
  const renderUnverified = () =>
    renderRow({
      label: 'Orders Unique Count',
      state: readJoinedUniqueCountState('a-verdict-this-bundle-predates'),
      checked: true,
    });

  it('does not render as a confirmed selection', () => {
    const { row } = renderUnverified();

    expect(within(row).getByRole('checkbox')).toHaveAccessibleDescription(/can't confirm/);
    expect(row.querySelector('.text-blue-500')).toBeNull();
  });

  it('stays clearable and re-tickable — the verdict is unknown, not refused', () => {
    const { onCheckedChange, row } = renderUnverified();

    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).not.toHaveAttribute('aria-disabled');
    fireEvent.click(checkbox);

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  // An unchecked row on an unknown verdict is never offered (canOfferUniqueCount), so the only
  // state left to keep quiet is the one nothing is wrong with.
  it('says nothing on a verdict it CAN read', () => {
    const { row } = renderRow({
      label: 'Orders Unique Count',
      state: readJoinedUniqueCountState('available'),
      checked: true,
    });

    expect(within(row).getByRole('checkbox')).not.toHaveAccessibleDescription();
    expect(row.querySelector('.text-blue-500')).not.toBeNull();
  });
});

describe('UniqueCountRow — checked but not emitted', () => {
  const NOT_EMITTED =
    'This Data Mart is not allowed for reporting, so this column is not generated. Allow it for reporting again, or clear this row.';

  const renderExcluded = () =>
    renderRow({
      label: 'Orders Unique Count',
      state: readJoinedUniqueCountState('available'),
      checked: true,
      isEmitted: false,
    });

  it('says so instead of rendering as a live selection', () => {
    const { row } = renderExcluded();

    expect(within(row).getByRole('checkbox')).toHaveAccessibleDescription(NOT_EMITTED);
    // The Σ badge claims an auto-generated column; nothing is generated here.
    expect(row.querySelector('.text-blue-500')).toBeNull();
    expect(row.querySelector('.text-destructive')).not.toBeNull();
  });

  it('stays clearable — the row is the only way out of the stored selection', () => {
    const { onCheckedChange, row } = renderExcluded();

    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).not.toHaveAttribute('aria-disabled');
    fireEvent.click(checkbox);

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  // This row renders its label as a tooltip trigger rather than a <label>, so without an explicit
  // handler the row TEXT was dead while every other row's text toggles it.
  it('clears the stale selection when the row text is clicked, like every other row', () => {
    const { onCheckedChange, row } = renderExcluded();

    fireEvent.click(within(row).getByText('Orders Unique Count'));

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  // A row withheld for a schema reason must stay inert: its checkbox already refuses, and the
  // trigger is the tooltip/Data Setup affordance, not a second way in.
  it('does not toggle when the label is a hint trigger', () => {
    const { onCheckedChange, row } = renderRow({
      label: 'Orders Unique Count',
      state: readJoinedUniqueCountState('nested-primary-key'),
      checked: false,
    });

    fireEvent.click(within(row).getByText('Orders Unique Count'));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

// The metric's own explanation rides the same ⓘ every field row uses, so two adjacent rows behave
// the same way. It is NOT the unavailable hint: that one replaces the row's affordance, this one
// sits beside a fully working row.
describe('UniqueCountRow — description', () => {
  it('shows the description through the standard info tooltip', async () => {
    const description = 'Unique Orders records, counted by its Primary Key: order_id';
    const { row } = renderRow({ description });

    const trigger = row.querySelector(
      '[data-slot="unique-count-info"] [data-slot="tooltip-trigger"]'
    )!;
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent(description);
  });

  it('renders no info affordance when there is nothing to describe', () => {
    const { row } = renderRow();

    expect(row.querySelector('[data-slot="unique-count-info"]')).toBeNull();
  });
});

// The ⓘ opens on pointer only, and the visible label is the bare `Unique Count` on every source —
// so without these two, every metric in the picker announces identically and none of them says
// what it counts.
describe('UniqueCountRow — accessibility', () => {
  it('names the Data Mart in the accessible name, keeping two rows apart', () => {
    renderRow({ dataMartName: 'Orders' });

    expect(screen.getByRole('checkbox', { name: 'Unique Count (Orders)' })).toBeInTheDocument();
  });

  it('falls back to the bare label when no Data Mart name is supplied', () => {
    renderRow();

    expect(screen.getByRole('checkbox', { name: 'Unique Count' })).toBeInTheDocument();
  });

  it('reaches a screen reader with the description of a fully working row', () => {
    const description = 'Unique Orders records, counted by its Primary Key: order_id';
    renderRow({ description, dataMartName: 'Orders' });

    const checkbox = screen.getByRole('checkbox', { name: 'Unique Count (Orders)' });
    const describedBy = checkbox.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)).toHaveTextContent(description);
  });

  it('carries both the not-generated note and the description when both apply', () => {
    const description = 'Unique Orders records, counted by its Primary Key: order_id';
    renderRow({ description, dataMartName: 'Orders', checked: true, isEmitted: false });

    const checkbox = screen.getByRole('checkbox', { name: 'Unique Count (Orders)' });
    const note = document.getElementById(checkbox.getAttribute('aria-describedby')!);
    expect(note).toHaveTextContent('not generated');
    expect(note).toHaveTextContent(description);
  });
});
