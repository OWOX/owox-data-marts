import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasSettingsPanel, type CanvasSettingsPanelProps } from './canvas-settings-panel';
import { NOTHING_HIDDEN, type ObjectLabelOption, type ObjectLabelsHidden } from './object-labels';
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
        .map(box => box.textContent)
    ).toEqual(['Input sourceSource badge', 'TriggersTrigger count']);

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

  it('offers the field-row options in the Detailed view only', () => {
    renderPanel(NOTHING_HIDDEN, 'erd');
    expect(screen.getByRole('group', { name: 'Field rows' })).toBeInTheDocument();
  });

  it('leaves the field-row options out of the Compact view', () => {
    renderPanel(NOTHING_HIDDEN, 'compact');
    expect(screen.queryByRole('group', { name: 'Field rows' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Field aliases/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Input source/ })).toBeInTheDocument();
  });

  it('has no Check all / Uncheck all shortcuts', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /Check all/i })).not.toBeInTheDocument();
  });
});
