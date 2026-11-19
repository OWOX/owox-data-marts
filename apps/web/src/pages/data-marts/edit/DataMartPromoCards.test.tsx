// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Stable per status: a fresh object each render would re-trigger the page's sync effects.
  outlet: () => {
    const cached = mocks.cache[mocks.statusCode];
    if (cached) return cached;
    return (mocks.cache[mocks.statusCode] = {
      projectId: 'project-1',
      dataMart: {
        id: 'dm-1',
        status: { code: mocks.statusCode },
        createdAt: new Date('2026-01-01'),
        createdByUser: null,
        businessOwnerUsers: [],
        technicalOwnerUsers: [],
        contexts: [],
      },
    });
  },
  cache: {} as Record<string, unknown>,
  statusCode: 'DRAFT',
  mcpServerUrl: 'https://mcp.example.com' as string | undefined,
  trackEvent: vi.fn(),
}));

vi.mock('../../../utils/data-layer', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../../../features/idp', () => ({
  useAuth: () => ({ user: { mcpServerUrl: mocks.mcpServerUrl } }),
  useRole: () => ({ canEdit: true }),
}));
vi.mock('../../../features/idp/hooks/useRole', () => ({ useIsAdmin: () => false }));
vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useOutletContext: () => mocks.outlet(),
}));
vi.mock('../../../features/data-marts/edit/model', () => ({
  useDataMartContext: () => ({
    dataMart: { id: 'dm-1', status: { code: mocks.statusCode } },
    updateDataMartStorage: vi.fn(),
  }),
}));
vi.mock('../../../features/data-marts/edit', () => ({
  ConnectorManualRunButton: () => null,
  DataMartDataStorageView: () => null,
  DataMartDefinitionSettings: () => null,
  DataMartSchemaSettings: () => null,
  DataMartOverview: () => null,
}));
vi.mock(
  '../../../features/data-marts/edit/components/DataMartRelationships/DataMartRelationshipsContent',
  () => ({ DataMartRelationshipsContent: () => null })
);
vi.mock('../../../features/data-marts/data-quality', () => ({
  DataQualityCompactStatusLink: () => null,
}));
vi.mock('../../../features/data-marts/edit/components/OwnersEditor', () => ({
  OwnersEditor: () => null,
}));
vi.mock('../../../features/data-marts/edit/components/DataMartMemberAccess', () => ({
  DataMartMemberAccessList: () => null,
  MemberAccessWarning: () => null,
  MemberAvatars: () => null,
  countMembersSharingWouldLetIn: () => 0,
  countMembersWhoCannotSee: () => 0,
  membersInContext: () => [],
  membersSharingOpensTo: () => [],
  useDataMartMemberAccess: () => ({ members: [], isLoading: false }),
}));
vi.mock('../../../features/contexts/components/ContextPicker/ContextPicker', () => ({
  ContextPicker: () => null,
}));
vi.mock('../../../features/contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));
vi.mock('../../../features/contexts/hooks/useInlineContextCreate', () => ({
  useInlineContextCreate: () => ({}),
}));

import { MemoryRouter, Route, Routes } from 'react-router';
import DataMartDataSetupContent from './DataMartDataSetupContent';
import DataMartOverviewContent from './DataMartOverviewContent';

const wrap = (ui: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/project-1']}>
      <Routes>
        <Route path='/:projectId' element={ui} />
      </Routes>
    </MemoryRouter>
  );
/** Opens the dialog of the row with this title and returns the hrefs of its links. */
const promptHrefs = (title: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
  return allHrefs();
};
const allHrefs = () =>
  decodeURIComponent(
    screen
      .getAllByRole('link')
      .map(a => a.getAttribute('href') ?? '')
      .join(' ')
  );

const shown = () =>
  mocks.trackEvent.mock.calls.map(([p]) => p).filter(p => p.event === 'mcp_promo_shown');

describe('Data Mart promo cards', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.trackEvent.mockClear();
    mocks.statusCode = 'DRAFT';
    mocks.mcpServerUrl = 'https://mcp.example.com';
  });

  it('offers to finish the setup of a draft on the Data Setup tab', () => {
    wrap(<DataMartDataSetupContent />);

    expect(promptHrefs('Set it up with your AI assistant')).toContain(
      'finish the setup of Data Mart dm-1 in project project-1'
    );
    expect(shown()).toEqual([
      expect.objectContaining({ label: 'data_setup_card', context: 'setup' }),
    ]);
  });

  it('offers to maintain a published Data Mart on the Data Setup tab', () => {
    mocks.statusCode = 'PUBLISHED';
    wrap(<DataMartDataSetupContent />);

    expect(screen.queryByText('Set it up with your AI assistant')).not.toBeInTheDocument();
    expect(promptHrefs('Maintain it with your AI assistant')).toContain(
      'maintain Data Mart dm-1 in project project-1. Do not create another Data Mart.'
    );
    expect(shown()).toEqual([
      expect.objectContaining({ label: 'data_setup_card_maintain', context: 'setup' }),
    ]);
  });

  it('hides the Data Setup card without an MCP server', () => {
    mocks.mcpServerUrl = undefined;
    wrap(<DataMartDataSetupContent />);

    expect(screen.queryByText('Set it up with your AI assistant')).not.toBeInTheDocument();
  });

  it('shows the Overview card for a published Data Mart with its id', () => {
    mocks.statusCode = 'PUBLISHED';
    wrap(<DataMartOverviewContent />);

    expect(promptHrefs('Ask this Data Mart in your AI assistant')).toContain('Data Mart dm-1');
  });

  it('hides the Overview card for a draft', () => {
    wrap(<DataMartOverviewContent />);

    expect(screen.queryByText('Ask this Data Mart in your AI assistant')).not.toBeInTheDocument();
  });

  it('asks each card for its own task', () => {
    mocks.statusCode = 'PUBLISHED';
    wrap(<DataMartOverviewContent />);
    expect(promptHrefs('Ask this Data Mart in your AI assistant')).toContain(
      'answer my questions with Data Mart dm-1 in project project-1'
    );
    cleanup();

    mocks.statusCode = 'DRAFT';
    wrap(<DataMartDataSetupContent />);
    expect(promptHrefs('Set it up with your AI assistant')).toContain(
      'finish the setup of Data Mart dm-1 in project project-1'
    );
  });

  it('reports the placement of the Data Setup card', () => {
    wrap(<DataMartDataSetupContent />);
    expect(shown()).toEqual([
      expect.objectContaining({ label: 'data_setup_card', context: 'setup' }),
    ]);
  });

  it('reports the placement of the Overview card for a published Data Mart', () => {
    mocks.statusCode = 'PUBLISHED';
    wrap(<DataMartOverviewContent />);
    expect(shown()).toEqual([
      expect.objectContaining({ label: 'overview_card', context: 'consumption' }),
    ]);
  });
});
