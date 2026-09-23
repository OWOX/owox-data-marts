import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorManualRunButton } from './ConnectorManualRunButton';
import { DataMartDefinitionType, DataMartStatus } from '../../../shared';
import { RunType } from '../../../../connectors/shared/enums/run-type.enum';

const harness = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  runDataMart: vi.fn(),
}));

vi.mock('../../model', () => ({
  useDataMartContext: () => harness.context,
}));

// The real run sheet loads connector specs; the stub only exposes its trigger and a submit.
vi.mock('../../../../connectors/edit/components/ConnectorRunSheet/ConnectorRunView', () => ({
  ConnectorRunView: ({
    children,
    onManualRun,
  }: {
    children: ReactNode;
    onManualRun: (data: { runType: string; data: Record<string, unknown> }) => void;
  }) => (
    <div>
      {children}
      <button
        type='button'
        onClick={() => {
          onManualRun({ runType: 'INCREMENTAL', data: {} });
        }}
      >
        Submit run
      </button>
    </div>
  ),
}));

const configuredConnector = {
  connector: {
    source: {
      name: 'CriteoAds',
      title: 'Criteo Ads',
      node: 'statistics',
      fields: ['date', 'clicks'],
      configuration: [{}],
    },
    storage: { fullyQualifiedName: 'dataset.table' },
  },
};

function setContext({
  definitionType = DataMartDefinitionType.CONNECTOR,
  status = DataMartStatus.PUBLISHED,
  definition = configuredConnector as unknown,
  hasActiveRuns = false,
} = {}) {
  harness.context = {
    dataMart: {
      id: 'dm-1',
      definitionType,
      definition,
      status: { code: status, displayName: status, description: '' },
    },
    runDataMart: harness.runDataMart,
    hasActiveRuns,
  };
}

describe('ConnectorManualRunButton', () => {
  beforeEach(() => {
    harness.runDataMart.mockReset();
    setContext();
  });

  it('starts a manual run of a published connector Data Mart', () => {
    render(<ConnectorManualRunButton />);

    expect(screen.getByRole('button', { name: 'Manual Run' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));

    expect(harness.runDataMart).toHaveBeenCalledWith({
      id: 'dm-1',
      payload: { runType: RunType.INCREMENTAL, data: {} },
    });
  });

  it('is disabled while a run is in progress', () => {
    setContext({ hasActiveRuns: true });
    render(<ConnectorManualRunButton />);

    expect(screen.getByRole('button', { name: 'Manual Run' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit run' })).not.toBeInTheDocument();
  });

  it('is disabled for a draft Data Mart', () => {
    setContext({ status: DataMartStatus.DRAFT });
    render(<ConnectorManualRunButton />);

    expect(screen.getByRole('button', { name: 'Manual Run' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit run' })).not.toBeInTheDocument();
  });

  it.each([
    ['a non-connector Data Mart', { definitionType: DataMartDefinitionType.SQL }],
    ['a connector without a definition', { definition: null }],
    [
      'a connector that is not configured',
      {
        definition: {
          connector: { ...configuredConnector.connector, source: { name: '', fields: [] } },
        },
      },
    ],
  ])('renders nothing for %s', (_, overrides) => {
    setContext(overrides);
    const { container } = render(<ConnectorManualRunButton />);

    expect(container).toBeEmptyDOMElement();
  });
});
