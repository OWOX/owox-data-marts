import { afterEach, describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { trackEvent } from '../../../../utils/data-layer';
import { BuilderProvider } from '../../shared/model/context/BuilderProvider';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { ConnectorBuilderApiService } from '../../shared/api/connector-builder-api.service';
import { createEmptyManifest, createEmptyNode } from '../../shared/model/manifest.types';
import {
  ResultsDock,
  displayRecords,
  deriveColumns,
  followNode,
  testFailureMessage,
} from './ResultsDock';

vi.mock('../../../../utils/data-layer', async importActual => ({
  ...(await importActual<typeof import('../../../../utils/data-layer')>()),
  trackEvent: vi.fn(),
}));

vi.mock('../../../credentials', () => ({
  ConsumerCredentialField: (props: {
    onChange: (id: string) => void;
    onCreated?: (credential: { id: string }) => void;
  }) => (
    <>
      <button
        onClick={() => {
          props.onChange('c1');
        }}
      >
        Pick Credential
      </button>
      <button
        onClick={() => {
          props.onCreated?.({ id: 'c2' });
          props.onChange('c2');
        }}
      >
        Create Credential
      </button>
      <button
        onClick={() => {
          props.onCreated?.({ id: 'c2' });
        }}
      >
        Refresh list
      </button>
    </>
  ),
}));

function Seed() {
  const { setManifest } = useBuilder();
  useEffect(() => {
    setManifest({
      ...createEmptyManifest(),
      name: 'MyApi',
      parameters: {
        Token: { requiredType: 'string', isRequired: true, attributes: ['SECRET'] },
        Region: { requiredType: 'string', isRequired: false },
      },
      nodes: { items: createEmptyNode() },
    });
  }, [setManifest]);
  return null;
}

const builderTests = () =>
  vi
    .mocked(trackEvent)
    .mock.calls.map(([payload]) => payload)
    .filter(payload => payload.event === 'connector_builder_test');

describe('ResultsDock test with a Credential', () => {
  afterEach(() => {
    vi.mocked(trackEvent).mockClear();
    vi.restoreAllMocks();
  });

  it('a test with a Credential sends credentialId and no key values', async () => {
    vi.spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials').mockResolvedValue([
      { id: 'c1', title: 'Key', hosts: [], fieldKeys: [] },
    ]);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue({
      hosts: ['api.example.com'],
      fieldList: [],
      keyParameters: ['Token'],
    });
    const test = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'test')
      .mockResolvedValue({ rows: [], logs: [], error: null });
    render(
      <BuilderProvider>
        <Seed />
        <ResultsDock open onToggleOpen={vi.fn()} />
      </BuilderProvider>
    );
    fireEvent.click(await screen.findByTestId('test-settings-gear'));
    fireEvent.change(await screen.findByTestId('test-param-Token'), {
      target: { value: 'typed-key' },
    });
    fireEvent.change(screen.getByTestId('test-param-Region'), { target: { value: 'eu' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Use a Credential' }));
    fireEvent.click(await screen.findByText('Pick Credential'));
    fireEvent.click(screen.getByTestId('run-test-settings'));
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });
    expect(test.mock.calls[0][0]).toMatchObject({
      credentialId: 'c1',
      node: 'items',
      configuration: { Region: 'eu' },
    });
    expect(test.mock.calls[0][0].configuration).not.toHaveProperty('Token');
  });

  it('runs from the dock with the chosen Credential after the settings close', async () => {
    vi.spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials').mockResolvedValue([
      { id: 'c1', title: 'Key', hosts: [], fieldKeys: [] },
    ]);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue({
      hosts: [],
      fieldList: [],
      keyParameters: ['Token'],
    });
    const test = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'test')
      .mockResolvedValue({ rows: [], logs: [], error: null });
    render(
      <BuilderProvider>
        <Seed />
        <ResultsDock open onToggleOpen={vi.fn()} />
      </BuilderProvider>
    );
    fireEvent.click(await screen.findByTestId('test-settings-gear'));
    fireEvent.change(await screen.findByTestId('test-param-Token'), {
      target: { value: 'typed-key' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Use a Credential' }));
    fireEvent.click(await screen.findByText('Pick Credential'));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('test-settings')).not.toBeInTheDocument();
    });
    const run = screen.getByTestId('run-test');
    expect(run).toBeEnabled();
    fireEvent.click(run);
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });
    expect(test.mock.calls[0][0]).toMatchObject({ credentialId: 'c1' });
    expect(test.mock.calls[0][0].configuration).not.toHaveProperty('Token');
    expect(builderTests()).toEqual([expect.objectContaining({ action: 'credential' })]);
  });

  const item = (id: string) => ({ id, title: id, hosts: [], fieldKeys: [] });
  const renderDockWithLists = (...lists: string[][]) => {
    const fitting = vi.spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials');
    lists.forEach((ids, index) => {
      if (index === lists.length - 1) fitting.mockResolvedValue(ids.map(item));
      else fitting.mockResolvedValueOnce(ids.map(item));
    });
    vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue({
      hosts: [],
      fieldList: [],
      keyParameters: ['Token'],
    });
    const test = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'test')
      .mockResolvedValue({ rows: [], logs: [], error: null });
    render(
      <BuilderProvider>
        <Seed />
        <ResultsDock open onToggleOpen={vi.fn()} />
      </BuilderProvider>
    );
    return { fitting, test };
  };
  const closeSettings = async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('test-settings')).not.toBeInTheDocument();
    });
  };

  it('keeps a Credential created from the builder once the refreshed list holds it', async () => {
    const { test } = renderDockWithLists(['c1'], ['c1', 'c2']);
    fireEvent.click(await screen.findByTestId('test-settings-gear'));
    fireEvent.click(screen.getByRole('tab', { name: 'Use a Credential' }));
    fireEvent.click(await screen.findByText('Create Credential'));
    await closeSettings();
    const run = screen.getByTestId('run-test');
    await waitFor(() => {
      expect(run).toBeEnabled();
    });
    fireEvent.click(run);
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });
    expect(test.mock.calls[0][0]).toMatchObject({ credentialId: 'c2' });
  });

  it('drops a created choice the refreshed list lacks and does not bring it back', async () => {
    const { fitting } = renderDockWithLists(['c1'], ['c1'], ['c1', 'c2']);
    fireEvent.click(await screen.findByTestId('test-settings-gear'));
    fireEvent.click(screen.getByRole('tab', { name: 'Use a Credential' }));
    fireEvent.click(await screen.findByText('Create Credential'));
    await waitFor(() => {
      expect(fitting).toHaveBeenCalledTimes(2);
    });
    // The third list holds c2, but the choice was cleared by the second one.
    fireEvent.click(screen.getByText('Refresh list'));
    await waitFor(() => {
      expect(fitting).toHaveBeenCalledTimes(3);
    });
    // Nothing to await: the choice must stay cleared, so give a late restore time to show.
    await new Promise(resolve => setTimeout(resolve, 50));
    await closeSettings();
    expect(screen.getByTestId('run-test')).toBeDisabled();
  });

  it('Enter values sends the typed values and no credentialId', async () => {
    const test = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'test')
      .mockResolvedValue({ rows: [], logs: [], error: null });
    render(
      <BuilderProvider>
        <Seed />
        <ResultsDock open onToggleOpen={vi.fn()} />
      </BuilderProvider>
    );
    fireEvent.click(await screen.findByTestId('test-settings-gear'));
    fireEvent.change(await screen.findByTestId('test-param-Token'), {
      target: { value: 'typed-key' },
    });
    fireEvent.click(screen.getByTestId('run-test-settings'));
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });
    expect(test.mock.calls[0][0].configuration).toEqual({ Token: 'typed-key' });
    expect(test.mock.calls[0][0]).not.toHaveProperty('credentialId');
    expect(builderTests()).toEqual([
      {
        event: 'connector_builder_test',
        category: 'Connector',
        action: 'values',
        label: null,
        context: null,
        value: null,
      },
    ]);
  });
});

describe('displayRecords', () => {
  it('returns the cast rows when present', () => {
    expect(
      displayRecords({ rows: [{ a: 1 }], logs: [], error: null, sample: [{ raw: true }] })
    ).toEqual([{ a: 1 }]);
  });
  it('falls back to the raw sample when there are no cast rows', () => {
    expect(displayRecords({ rows: [], logs: [], error: null, sample: [{ id: 1 }] })).toEqual([
      { id: 1 },
    ]);
  });
  it('returns [] when there are neither rows nor a sample', () => {
    expect(displayRecords({ rows: [], logs: [], error: null })).toEqual([]);
  });
});

describe('testFailureMessage', () => {
  it('shows the backend refusal instead of the axios status line', () => {
    // What the connector-test concurrency limit actually looks like to the dock.
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        data: {
          statusCode: 400,
          code: 'CONNECTOR_TEST_CONCURRENCY_LIMIT',
          message:
            'This project already has 3 connector tests running. Wait for one to finish, then try again.',
          errorDetails: { scope: 'project', limit: 3, retryAfterSeconds: 20 },
        },
      },
    });
    expect(testFailureMessage(axiosError)).toBe(
      'This project already has 3 connector tests running. Wait for one to finish, then try again.'
    );
  });

  it('falls back to the thrown message when the body carries none', () => {
    expect(testFailureMessage(new Error('Network Error'))).toBe('Network Error');
  });

  it('falls back to a generic sentence when there is nothing to show', () => {
    expect(testFailureMessage({})).toBe('Test failed');
    expect(testFailureMessage(new Error('   '))).toBe('Test failed');
  });
});

describe('deriveColumns', () => {
  it('unions top-level keys across object records', () => {
    expect(deriveColumns([{ a: 1 }, { b: 2, c: 3 }])).toEqual({
      columns: ['a', 'b', 'c'],
      primitive: false,
    });
  });
  it('uses a single "value" column for primitive records', () => {
    expect(deriveColumns(['x', 'y'] as unknown as Record<string, unknown>[])).toEqual({
      columns: ['value'],
      primitive: true,
    });
  });
});

describe('followNode', () => {
  it('keeps a node that is still there', () => {
    expect(followNode(['a', 'b'], 'b', ['a', 'b', 'c'])).toBe('b');
  });

  it('follows a renamed node to the name at its position', () => {
    expect(followNode(['a', 'b', 'c'], 'b', ['a', 'renamed', 'c'])).toBe('renamed');
  });

  it('falls back to the first node when the node was removed from the end', () => {
    expect(followNode(['a', 'b'], 'b', ['a'])).toBe('a');
  });

  it('is empty when no node is left', () => {
    expect(followNode(['a'], 'a', [])).toBe('');
  });
});
