import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasSettingsPanel, type CanvasSettingsPanelProps } from './canvas-settings-panel';
import { ALL_HIDDEN, NOTHING_HIDDEN, type ObjectLabelsHidden } from './object-labels';

function renderPanel(objectLabels: ObjectLabelsHidden = NOTHING_HIDDEN) {
  const props: CanvasSettingsPanelProps = {
    viewMode: 'erd',
    onViewModeChange: vi.fn(),
    direction: 'horizontal',
    onDirectionChange: vi.fn(),
    showJoinFields: false,
    onShowJoinFieldsChange: vi.fn(),
    joinFieldsSwitchId: 'join-fields',
    objectLabels,
    onObjectLabelsChange: vi.fn(),
  };
  render(<CanvasSettingsPanel {...props} />);
  return props;
}

const HEADER_ONLY_HIDDEN: ObjectLabelsHidden = {
  ...NOTHING_HIDDEN,
  source: true,
  fields: true,
  status: true,
};

describe('CanvasSettingsPanel object labels', () => {
  it('lists the field-row labels as checkboxes that toggle their own part only', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('checkbox', { name: /^Field aliases/ }));
    expect(props.onObjectLabelsChange).toHaveBeenLastCalledWith({
      ...NOTHING_HIDDEN,
      fieldAlias: true,
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

  it('marks "Uncheck all" pressed only when every part is hidden, matching what it sets', () => {
    const props = renderPanel(HEADER_ONLY_HIDDEN);
    const uncheckAll = screen.getByRole('button', { name: /^Uncheck all/ });

    // Header parts alone hidden: the cards are title-only, but the field-row
    // labels are still ticked — clicking still changes state, so not pressed.
    expect(uncheckAll).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(uncheckAll);
    expect(props.onObjectLabelsChange).toHaveBeenCalledWith(ALL_HIDDEN);
  });

  it('marks the shortcuts pressed at their own extremes', () => {
    renderPanel(ALL_HIDDEN);
    expect(screen.getByRole('button', { name: /^Uncheck all/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /^Check all/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
