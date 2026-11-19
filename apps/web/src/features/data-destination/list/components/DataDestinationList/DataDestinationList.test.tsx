import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStatus } from '../../../../../features/idp/types';
import { DataDestinationType } from '../../../shared';
import { dataDestinationService, useDataDestination } from '../../../shared';
import { DataDestinationList } from './DataDestinationList';

const mocks = vi.hoisted(() => ({ mcp: true }));

vi.mock('../../../shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared')>();
  return {
    ...actual,
    dataDestinationService: {
      getDataDestinationImpact: vi.fn(),
    },
    useDataDestination: vi.fn(),
  };
});

vi.mock('../../../../../features/idp', () => ({
  useAuth: () => ({
    status: AuthStatus.AUTHENTICATED,
    user: {
      id: 'user-1',
      projectId: 'project-1',
      roles: ['admin'],
    },
  }),
}));

vi.mock('../DataDestinationTable', () => ({
  DataDestinationTable: ({
    data,
    onDelete,
    onEdit,
    onOpenTypeDialog,
  }: {
    data: { id: string; title: string }[];
    onDelete?: (id: string) => void;
    onEdit?: (id: string) => void;
    onOpenTypeDialog?: () => void;
  }) => (
    <div>
      <button type='button' onClick={onOpenTypeDialog}>
        New Destination
      </button>
      {data.map(destination => (
        <button
          key={`edit-${destination.id}`}
          type='button'
          onClick={() => {
            onEdit?.(destination.id);
          }}
        >
          Edit {destination.title}
        </button>
      ))}
      {data.map(destination => (
        <button
          key={destination.id}
          type='button'
          onClick={() => {
            onDelete?.(destination.id);
          }}
        >
          Delete {destination.title}
        </button>
      ))}
    </div>
  ),
  getDataDestinationColumns: vi.fn(() => []),
}));

vi.mock('../../../edit', () => ({
  // Stays mounted after close, like a Sheet that animates out.
  DataDestinationConfigSheet: ({
    isOpen,
    promo,
    onClose,
  }: {
    isOpen: boolean;
    promo?: ReactNode;
    onClose: () => void;
  }) => (
    <div data-testid='sheet' data-open={isOpen} data-has-promo={String(promo !== undefined)}>
      {promo}
      <button type='button' onClick={onClose}>
        Close sheet
      </button>
    </div>
  ),
}));

vi.mock('../../../../mcp-promo', async () => ({
  useIsMcpSetupPromoAvailable: () => mocks.mcp,
  McpPromoCard: (props: { placement: string; prompt: string; title: string; variant?: string }) => (
    <div
      data-testid='promo'
      data-placement={props.placement}
      data-title={props.title}
      data-variant={props.variant}
    >
      {props.prompt}
    </div>
  ),
  buildMcpPrompt: (
    await vi.importActual<typeof import('../../../../mcp-promo/prompts')>(
      '../../../../mcp-promo/prompts'
    )
  ).buildMcpPrompt,
}));

function expectMaintainPromo(promo: HTMLElement) {
  expect(promo).toHaveAttribute('data-placement', 'destination_sheet_maintain');
  expect(promo).toHaveAttribute('data-title', 'Maintain it with your AI assistant');
  expect(promo).toHaveTextContent('maintain Destination destination-1 in project project-1.');
}

describe('DataDestinationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mcp = true;

    vi.mocked(useDataDestination).mockReturnValue({
      dataDestinations: [
        {
          id: 'destination-1',
          title: '[Ok OAuth] Sheets',
          type: DataDestinationType.GOOGLE_SHEETS,
          projectId: 'project-1',
          credentials: {},
          createdAt: new Date('2026-06-09T10:00:00.000Z'),
          modifiedAt: new Date('2026-06-09T10:00:00.000Z'),
          contexts: [],
        },
      ],
      currentDataDestination: null,
      loading: false,
      error: null,
      fetchDataDestinations: vi.fn(),
      getDataDestinationById: vi.fn(),
      createDataDestination: vi.fn(),
      updateDataDestination: vi.fn(),
      deleteDataDestination: vi.fn(),
      clearCurrentDataDestination: vi.fn(),
      rotateSecretKey: vi.fn(),
    });
  });

  it('links blocked destination reports to the project reports page filtered by destination', async () => {
    vi.mocked(dataDestinationService.getDataDestinationImpact).mockResolvedValueOnce({
      destinationId: 'destination-1',
      destinationTitle: '[Ok OAuth] Sheets',
      reportsCount: 17,
      dataMartCount: 2,
    });

    render(
      <MemoryRouter initialEntries={['/ui/project-1/data-destinations']}>
        <DataDestinationList />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete [Ok OAuth] Sheets' }));

    const reportsLink = await screen.findByRole('link', { name: '17 Reports' });
    const url = new URL(reportsLink.getAttribute('href') ?? '', 'http://localhost');

    expect(url.pathname).toBe('/ui/project-1/data-marts/reports');
    expect(JSON.parse(url.searchParams.get('filters') ?? '[]')).toEqual([
      { f: 'destination', o: 'eq', v: ['[Ok OAuth] Sheets'] },
    ]);
    await waitFor(() => {
      expect(dataDestinationService.getDataDestinationImpact).toHaveBeenCalledWith('destination-1');
    });
  });

  it('shows the AI assistant promo in the create sheet, also while it closes', async () => {
    render(
      <MemoryRouter>
        <DataDestinationList />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('promo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New Destination' }));
    const promo = await screen.findByTestId('promo');
    expect(promo).toHaveAttribute('data-placement', 'destination_sheet');
    expect(promo).toHaveAttribute('data-title', 'Set it up with your AI assistant');
    expect(promo).toHaveTextContent('add a Destination to project project-1.');
    expect(promo).toHaveAttribute('data-variant', 'section');

    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(screen.getByTestId('sheet').getAttribute('data-open')).toBe('false');
    expect(screen.getByTestId('promo')).toBeInTheDocument();
  });

  it('shows the maintain block in an edit sheet, also while it closes', async () => {
    render(
      <MemoryRouter>
        <DataDestinationList />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'New Destination' }));
    await screen.findByTestId('promo');
    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit [Ok OAuth] Sheets' }));
    await waitFor(() => {
      expect(screen.getByTestId('sheet').getAttribute('data-open')).toBe('true');
    });
    expectMaintainPromo(screen.getByTestId('promo'));
    expect(screen.getByTestId('promo')).toHaveAttribute('data-variant', 'section');

    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(screen.getByTestId('sheet').getAttribute('data-open')).toBe('false');
    expectMaintainPromo(screen.getByTestId('promo'));
  });

  it('fetches a destination once when its row opens it', async () => {
    const getDataDestinationById = vi.fn();
    vi.mocked(useDataDestination).mockReturnValue({
      ...vi.mocked(useDataDestination)(),
      getDataDestinationById,
    });
    render(
      <MemoryRouter>
        <DataDestinationList />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit [Ok OAuth] Sheets' }));
    await waitFor(() => {
      expect(screen.getByTestId('sheet').getAttribute('data-open')).toBe('true');
    });
    // Let the `?id=` update and the deep-link effect run.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));

    expect(getDataDestinationById).toHaveBeenCalledTimes(1);
  });

  it('shows the maintain block for a deep-linked destination', async () => {
    render(
      <MemoryRouter initialEntries={['/?id=destination-1']}>
        <DataDestinationList />
      </MemoryRouter>
    );

    expectMaintainPromo(await screen.findByTestId('promo'));
  });

  it('passes no promo to the sheet without MCP', async () => {
    mocks.mcp = false;
    render(
      <MemoryRouter>
        <DataDestinationList />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'New Destination' }));
    expect(screen.getByTestId('sheet').getAttribute('data-open')).toBe('true');
    expect(screen.getByTestId('sheet').dataset.hasPromo).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit [Ok OAuth] Sheets' }));
    await waitFor(() => {
      expect(screen.getByTestId('sheet').getAttribute('data-open')).toBe('true');
    });
    expect(screen.getByTestId('sheet').dataset.hasPromo).toBe('false');
    expect(screen.queryByTestId('promo')).toBeNull();
  });
});
