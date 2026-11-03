import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';
import type { ConnectorFieldOptionsState } from '../../../../../../shared/model/hooks/useConnectorFieldOptions';
import { ConfigurationDynamicOptionsField, type DynamicOptionsAction } from './index';

const fieldOptions = vi.hoisted(() => ({
  state: null as unknown as ConnectorFieldOptionsState,
}));
vi.mock('../../../../../../shared/model/hooks/useConnectorFieldOptions', () => ({
  useConnectorFieldOptions: () => fieldOptions.state,
}));

const specification = {
  name: 'SpreadsheetId',
  title: 'Spreadsheet ID or URL',
  optionsDependsOn: ['AuthType'],
} as ConnectorSpecificationResponseApiDto;

const reload = vi.fn();
const DENIED =
  'Google denied access to the spreadsheet list. Reconnect the Credential and try again.';

function setState(state: Partial<ConnectorFieldOptionsState>) {
  fieldOptions.state = {
    status: 'loaded',
    options: [],
    error: null,
    loadedKey: null,
    reload,
    ...state,
  };
}

function renderField(
  props: {
    value?: string;
    action?: DynamicOptionsAction;
    onLabelChange?: (label: string | undefined) => void;
  } = {}
) {
  return render(
    <ConfigurationDynamicOptionsField
      specification={specification}
      configuration={{ SpreadsheetId: props.value ?? '' }}
      onValueChange={vi.fn()}
      connectorName='GoogleSheets'
      action={props.action}
      onLabelChange={props.onLabelChange}
    />
  );
}

describe('ConfigurationDynamicOptionsField', () => {
  beforeEach(() => {
    reload.mockReset();
  });

  it('shows one sentence for a list that cannot load', () => {
    setState({ status: 'error', error: DENIED });
    renderField();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(`Could not load the list of spreadsheets. ${DENIED}`);
    expect(alert.textContent).not.toMatch(/\.\./);
    expect(alert.textContent).not.toMatch(/Enter the value manually/);
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ends a source message without a full stop with one', () => {
    setState({ status: 'error', error: 'Network down' });
    renderField();

    expect(screen.getByRole('alert').textContent).toBe(
      'Could not load the list of spreadsheets. Network down.'
    );
  });

  it('offers the action as the last list item and reloads the list after it', async () => {
    setState({ options: [{ value: 'id-1', label: 'Budget 2026' }] });
    const onSelect = vi.fn().mockResolvedValue(undefined);
    renderField({ action: { label: '+ Add spreadsheet', onSelect } });

    fireEvent.click(screen.getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Budget 2026', '+ Add spreadsheet']);

    fireEvent.click(options[1]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the action reachable when the list fails or is empty', async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    const action = { label: '+ Add spreadsheet', onSelect };

    setState({ status: 'error', error: DENIED });
    const { unmount } = renderField({ action });
    fireEvent.click(screen.getByRole('button', { name: '+ Add spreadsheet' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    unmount();

    setState({ status: 'loaded', options: [] });
    renderField({ action });
    expect(screen.getByRole('button', { name: '+ Add spreadsheet' })).toBeEnabled();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('ignores clicks on the action while it runs', async () => {
    setState({ status: 'loaded', options: [] });
    let finish!: () => void;
    const onSelect = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    renderField({ action: { label: '+ Add spreadsheet', onSelect } });
    const button = screen.getByRole('button', { name: '+ Add spreadsheet' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    finish();
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('cannot pick the action from the list again while it runs', async () => {
    setState({ options: [{ value: 'id-1', label: 'Budget 2026' }] });
    const onSelect = vi.fn(() => new Promise<void>(() => undefined));
    renderField({ action: { label: '+ Add spreadsheet', onSelect } });

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click((await screen.findAllByRole('option'))[1]);
    fireEvent.click(screen.getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    fireEvent.click(options[options.length - 1]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(options[options.length - 1]).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows a disabled action with its hint', () => {
    setState({ status: 'loaded', options: [] });
    const hint = 'Reconnect this Credential to add spreadsheets.';
    renderField({
      action: { label: '+ Add spreadsheet', onSelect: vi.fn(), disabled: true, hint },
    });

    const button = screen.getByRole('button', { name: '+ Add spreadsheet' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(hint);
    expect(screen.getByText(hint)).toBeVisible();
  });

  it('shows the hint under a disabled action in the list, which cannot be picked', async () => {
    setState({ options: [{ value: 'id-1', label: 'Budget 2026' }] });
    const onSelect = vi.fn();
    const hint = 'Reconnect this Credential to add spreadsheets.';
    renderField({ action: { label: '+ Add spreadsheet', onSelect, disabled: true, hint } });

    fireEvent.click(screen.getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    const item = options[options.length - 1];
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item.textContent).toBe(`+ Add spreadsheet${hint}`);

    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps Retry a ghost button on its own row under the text', () => {
    setState({ status: 'error', error: DENIED });
    renderField({ action: { label: '+ Add spreadsheet', onSelect: vi.fn() } });

    const retry = screen.getByRole('button', { name: 'Retry' });
    // Ghost is the only variant without a border or a background.
    expect(retry.className).not.toMatch(/(^|\s)border(\s|$)|bg-background/);
    expect(screen.getByRole('alert')).not.toContainElement(retry);
  });

  it('describes the combobox with the hint of a disabled action', () => {
    setState({ options: [{ value: 'id-1', label: 'Budget 2026' }] });
    const hint = 'Reconnect this Credential to add spreadsheets.';
    renderField({
      action: { label: '+ Add spreadsheet', onSelect: vi.fn(), disabled: true, hint },
    });

    expect(screen.getByText(hint)).toBeVisible();
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(hint);
  });

  it('reports the label of the selected option once the list loads', () => {
    const onLabelChange = vi.fn();
    setState({ status: 'loading' });
    const { rerender } = renderField({ value: 'id-1', onLabelChange });
    expect(onLabelChange).not.toHaveBeenCalled();

    const renderWith = (value: string) => {
      rerender(
        <ConfigurationDynamicOptionsField
          specification={specification}
          configuration={{ SpreadsheetId: value }}
          onValueChange={vi.fn()}
          connectorName='GoogleSheets'
          onLabelChange={onLabelChange}
        />
      );
    };

    setState({ options: [{ value: 'id-1', label: 'Budget 2026' }] });
    renderWith('id-1');
    expect(onLabelChange).toHaveBeenLastCalledWith('Budget 2026');

    renderWith('unknown');
    expect(onLabelChange).toHaveBeenLastCalledWith(undefined);
  });
});
