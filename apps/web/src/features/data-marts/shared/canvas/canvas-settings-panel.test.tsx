import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasSettingsPanel, type CanvasSettingsPanelProps } from './canvas-settings-panel';
import {
  ALL_HIDDEN,
  NOTHING_HIDDEN,
  type ObjectLabelOption,
  type ObjectLabelsHidden,
} from './object-labels';
import type { CanvasViewMode } from './view-mode';

const OPTIONS: readonly ObjectLabelOption[] = [
  { part: 'source', label: 'Input source', helper: 'Source badge' },
  { part: 'triggers', label: 'Triggers', helper: 'Trigger count' },
  { part: 'fieldAlias', label: 'Field aliases', helper: 'Alias in place of the name' },
  { part: 'fieldDescription', label: 'Field descriptions', helper: 'Description under the field' },
];

function renderPanel(
  objectLabels: ObjectLabelsHidden = NOTHING_HIDDEN,
  viewMode: CanvasViewMode = 'erd'
) {
  const props: CanvasSettingsPanelProps = {
    viewMode,
    onViewModeChange: vi.fn(),
    direction: 'horizontal',
    onDirectionChange: vi.fn(),
    showJoinFields: false,
    onShowJoinFieldsChange: vi.fn(),
    joinFieldsSwitchId: 'join-fields',
    objectLabels,
    onObjectLabelsChange: vi.fn(),
    objectLabelOptions: OPTIONS,
  };
  render(<CanvasSettingsPanel {...props} />);
  return props;
}

describe('CanvasSettingsPanel object labels', () => {
  it('offers exactly the options the canvas passes, each toggling its own part only', () => {
    const props = renderPanel();

    const card = screen.getByRole('group', { name: 'Card content' });
    expect(
      within(card)
        .getAllByRole('checkbox')
        .map(box => box.closest('label')?.textContent)
    ).toEqual(['Input source', 'Triggers']);

    fireEvent.click(screen.getByRole('checkbox', { name: /^Triggers/ }));
    expect(props.onObjectLabelsChange).toHaveBeenLastCalledWith({
      ...NOTHING_HIDDEN,
      triggers: true,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /^Field descriptions/ }));
    expect(props.onObjectLabelsChange).toHaveBeenLastCalledWith({
      ...NOTHING_HIDDEN,
      fieldDescription: true,
    });
  });

  it('reflects each part in its checkbox state', () => {
    renderPanel({ ...NOTHING_HIDDEN, fieldDescription: true });

    expect(screen.getByRole('checkbox', { name: /^Field aliases/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('checkbox', { name: /^Field descriptions/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('enables the field-row options in the Detailed view', () => {
    renderPanel(NOTHING_HIDDEN, 'erd');
    expect(screen.getByRole('checkbox', { name: /^Field aliases/ })).toBeEnabled();
    expect(screen.queryByText('Detailed only')).not.toBeInTheDocument();
  });

  it('keeps the field-row options visible but disabled in the Compact view', () => {
    renderPanel(NOTHING_HIDDEN, 'compact');
    expect(screen.getByRole('group', { name: 'Field rows' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Field aliases/ })).toBeDisabled();
    expect(screen.getByText('Detailed only')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Input source/ })).toBeEnabled();
  });

  it('shows every part, or strips the cards to their titles, from the shortcuts', () => {
    const props = renderPanel({ ...NOTHING_HIDDEN, triggers: true });
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(props.onObjectLabelsChange).toHaveBeenLastCalledWith(NOTHING_HIDDEN);
    fireEvent.click(screen.getByRole('button', { name: 'Title only' }));
    expect(props.onObjectLabelsChange).toHaveBeenLastCalledWith(ALL_HIDDEN);
  });

  it('picks the view mode and the layout algorithm from their radio groups', () => {
    const props = renderPanel(NOTHING_HIDDEN, 'compact');
    expect(screen.getByRole('radio', { name: 'Compact' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Detailed' }));
    expect(props.onViewModeChange).toHaveBeenLastCalledWith('erd');
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    expect(props.onDirectionChange).toHaveBeenLastCalledWith('vertical');
    fireEvent.click(screen.getByRole('switch', { name: 'Show join fields' }));
    expect(props.onShowJoinFieldsChange).toHaveBeenLastCalledWith(true);
  });
});
