import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../data-storage';
import type { DataStorage } from '../../../data-storage/shared/model/types/data-storage.ts';
import { DataStorageHealthStatus } from '../../../data-storage/shared/services/data-storage-health-status.service.ts';
import { DataMartDataStorageView } from './DataMartDataStorageView';

const mocks = vi.hoisted(() => ({
  promoHook: vi.fn((storage?: { id: string }) => (storage ? 'AI assistant block' : undefined)),
  health: {
    status: 'valid' as string,
    errorMessage: undefined as string | undefined,
    isFetched: true,
  },
  mcpServerUrl: 'https://mcp.example.com' as string | undefined,
  trackEvent: vi.fn(),
}));

vi.mock('../../../data-storage/edit', () => ({
  useStorageSheetMcpPromo: mocks.promoHook,
  DataStorageConfigSheet: ({ isOpen, promo }: { isOpen: boolean; promo?: ReactNode }) =>
    isOpen ? <div data-testid='sheet'>{promo}</div> : null,
}));
vi.mock('../../../data-storage/shared/model/hooks/useDataStorageHealthStatus.ts', () => ({
  useDataStorageHealthStatus: () => mocks.health,
}));
vi.mock('../../../idp', () => ({
  useAuth: () => ({ user: { mcpServerUrl: mocks.mcpServerUrl } }),
  useRole: () => ({ canEdit: true }),
}));
vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ projectId: 'project-1' }),
}));
vi.mock('../../../../utils/data-layer', () => ({ trackEvent: mocks.trackEvent }));

const storage = {
  id: 'storage-1',
  title: 'Warehouse',
  type: DataStorageType.SNOWFLAKE,
  config: { account: 'acme', warehouse: 'main' },
  createdAt: new Date(),
  modifiedAt: new Date(),
} as DataStorage;

const bigQuery = (config: Record<string, string>) =>
  ({ ...storage, type: DataStorageType.GOOGLE_BIGQUERY, config }) as unknown as DataStorage;

const hint = () => screen.queryByText(/Not sure what goes where\?/);
const promoEvents = (event: string) =>
  mocks.trackEvent.mock.calls.filter(([p]) => p.event === event).map(([p]) => p);

describe('DataMartDataStorageView', () => {
  beforeEach(() => {
    mocks.health = {
      status: DataStorageHealthStatus.VALID,
      errorMessage: undefined,
      isFetched: true,
    };
    mocks.mcpServerUrl = 'https://mcp.example.com';
    mocks.trackEvent.mockClear();
  });

  it('passes the AI assistant block for its Storage to the sheet', () => {
    render(<DataMartDataStorageView dataStorage={storage} />);

    expect(mocks.promoHook).toHaveBeenLastCalledWith(storage, false);
    expect(screen.queryByTestId('sheet')).toBeNull();

    fireEvent.click(screen.getByText('Warehouse'));

    expect(mocks.promoHook).toHaveBeenLastCalledWith(storage, true);
    expect(screen.getByTestId('sheet')).toHaveTextContent('AI assistant block');
  });

  it('offers the assistant under an incomplete config, with the Storage in the prompt', () => {
    render(<DataMartDataStorageView dataStorage={bigQuery({ projectId: '', location: '' })} />);

    expect(screen.getByText('Storage configuration is incomplete')).toBeInTheDocument();
    expect(hint()).toBeInTheDocument();
    const href = decodeURIComponent(
      screen.getByRole('link', { name: /^Claude/ }).getAttribute('href') ?? ''
    );
    expect(href).toContain(
      'help me finish configuring Storage storage-1 in project project-1. Do not create another Storage.'
    );
    expect(promoEvents('mcp_promo_shown')).toEqual([
      expect.objectContaining({ label: 'data_setup_storage_hint', context: 'setup' }),
    ]);
  });

  it('offers the assistant under a validation error', () => {
    mocks.health = {
      status: DataStorageHealthStatus.INVALID,
      errorMessage: 'Access denied',
      isFetched: true,
    };
    render(<DataMartDataStorageView dataStorage={bigQuery({ projectId: 'p', location: 'US' })} />);

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(hint()).toBeInTheDocument();
  });

  it('shows no hint for a valid Storage', () => {
    render(<DataMartDataStorageView dataStorage={bigQuery({ projectId: 'p', location: 'US' })} />);

    expect(hint()).toBeNull();
    expect(promoEvents('mcp_promo_shown')).toEqual([]);
  });

  it('shows no hint without an MCP server url', () => {
    mocks.mcpServerUrl = undefined;
    render(<DataMartDataStorageView dataStorage={bigQuery({ projectId: '', location: '' })} />);

    expect(hint()).toBeNull();
  });

  it('opens the chat from the hint without opening the Storage sheet', () => {
    render(<DataMartDataStorageView dataStorage={bigQuery({ projectId: '', location: '' })} />);

    fireEvent.click(screen.getByRole('link', { name: /^ChatGPT/ }));

    expect(screen.queryByTestId('sheet')).toBeNull();
    expect(promoEvents('mcp_promo_clicked').map(p => p.value)).toEqual(['chatgpt']);
  });
});
