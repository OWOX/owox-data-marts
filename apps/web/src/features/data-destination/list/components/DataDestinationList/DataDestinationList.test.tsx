import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStatus } from '../../../../../features/idp/types';
import { DataDestinationType } from '../../../shared';
import { dataDestinationService, useDataDestination } from '../../../shared';
import { DataDestinationList } from './DataDestinationList';

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
  }: {
    data: { id: string; title: string }[];
    onDelete?: (id: string) => void;
  }) => (
    <div>
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
  DataDestinationConfigSheet: () => null,
}));

describe('DataDestinationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
});
