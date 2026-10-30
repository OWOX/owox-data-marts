import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { fireEvent, render as renderInDom, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type {
  DataMartAccessLevelDto,
  DataMartMemberAccessItemDto,
} from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import { DataMartMemberAccessList } from './DataMartMemberAccessList';
import { MemberAccessWarning } from './MemberAccessWarning';
import { MemberAvatars } from './MemberAvatars';

const trackEvent = vi.fn();
vi.mock('../../../../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

vi.mock('../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project${path}` }),
}));

const render = (ui: ReactElement) => renderInDom(<MemoryRouter>{ui}</MemoryRouter>);

/** A paragraph by its whole text, which links split into several elements. */
const paragraph = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && element.textContent === text;

const yes = (reason: DataMartAccessLevelDto['reason']) => ({ granted: true, reason });
const no = (reason: DataMartAccessLevelDto['reason']) => ({ granted: false, reason });

function member(overrides: Partial<DataMartMemberAccessItemDto>): DataMartMemberAccessItemDto {
  return {
    userId: 'user-1',
    email: 'user@example.com',
    role: 'viewer',
    roleScope: 'selected_contexts',
    contexts: [],
    ownership: null,
    see: yes('PROJECT_WIDE_ACCESS'),
    edit: no('ROLE_REQUIRED'),
    configureSharing: no('ROLE_REQUIRED'),
    ...overrides,
  };
}

const members = [
  member({
    userId: 'admin',
    displayName: 'Ada',
    role: 'admin',
    see: yes('PROJECT_ADMIN'),
    edit: yes('PROJECT_ADMIN'),
    configureSharing: yes('PROJECT_ADMIN'),
  }),
  member({
    userId: 'ben',
    displayName: 'Ben',
    contexts: [{ id: 'ctx-paid', name: 'Paid ads' }],
    see: no('NO_SHARED_CONTEXT'),
  }),
  member({
    userId: 'tom',
    displayName: 'Tom',
    role: 'editor',
    roleScope: 'entire_project',
    edit: yes('PROJECT_WIDE_ACCESS'),
    configureSharing: no('OWNER_REQUIRED'),
  }),
];

const baseProps = {
  dataMartId: 'dm-1',
  isLoading: false,
  hasError: false,
  onRetry: vi.fn(),
  dataMart: { contexts: [{ id: 'ctx-seo', name: 'SEO' }], availableForMaintenance: true },
  isDraft: false,
};

describe('DataMartMemberAccessList', () => {
  it('shows each member’s role, where their access comes from and what they can do, least access first', () => {
    render(<DataMartMemberAccessList {...baseProps} members={members} />);

    expect(
      screen.getByText('3 members: 2 can see it, 2 can edit it, 1 can change Sharing and Ownership')
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Access through' })).toBeInTheDocument();

    const rows = screen.getAllByTestId('dataMartMemberAccessRow');
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('Ben')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Business User')).toBeInTheDocument();
    expect(within(rows[0]).getByText('No access')).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(
        paragraph('Sees only their contexts (Paid ads), and none of them is on this Data Mart')
      )
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(
        paragraph('To see it: add Paid ads in Contexts, or assign the member to SEO')
      )
    ).toBeInTheDocument();

    expect(within(rows[1]).getByText('Tom')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Data Owner')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Shared for maintenance')).toBeInTheDocument();
    expect(
      within(rows[1]).getByText(
        "To change Sharing and Ownership: add them as this Data Mart's Data Owner in Ownership"
      )
    ).toBeInTheDocument();

    expect(within(rows[2]).getAllByText('Project Admin')).toHaveLength(2);
    expect(within(rows[2]).getByText('Full access')).toBeInTheDocument();
  });

  it('links to the screens where the hints say a setting changes', () => {
    render(<DataMartMemberAccessList {...baseProps} members={members} />);

    const rows = screen.getAllByTestId('dataMartMemberAccessRow');
    expect(within(rows[0]).getByRole('link', { name: 'Paid ads' })).toHaveAttribute(
      'href',
      '/ui/project/project-settings/contexts?context=ctx-paid'
    );
    expect(within(rows[0]).getByRole('link', { name: 'SEO' })).toHaveAttribute(
      'href',
      '/ui/project/project-settings/contexts?context=ctx-seo'
    );
    expect(screen.getAllByRole('link', { name: 'Project settings → Members' })[0]).toHaveAttribute(
      'href',
      '/ui/project/project-settings/members'
    );
  });

  it('reports which link a hint led to, and never whose row it was in', () => {
    trackEvent.mockReset();
    render(<DataMartMemberAccessList {...baseProps} members={members} />);

    const rows = screen.getAllByTestId('dataMartMemberAccessRow');
    fireEvent.click(within(rows[0]).getByRole('link', { name: 'SEO' }));

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'data_mart_member_access_link_clicked',
        label: 'dm-1',
        destination: 'context',
        place: 'hint',
        memberHasAccess: false,
      })
    );
    expect(JSON.stringify(trackEvent.mock.calls)).not.toMatch(/ben|ctx-seo|seo/i);
  });

  it('notes that MCP lists only published Data Marts when this one is a draft', () => {
    render(<DataMartMemberAccessList {...baseProps} members={members} isDraft />);

    expect(
      screen.getByText('This Data Mart is a draft: MCP lists only published Data Marts.')
    ).toBeInTheDocument();
  });

  it('offers a retry instead of an empty list when the read fails', () => {
    const onRetry = vi.fn();
    render(<DataMartMemberAccessList {...baseProps} members={null} hasError onRetry={onRetry} />);

    expect(screen.queryByTestId('dataMartMemberAccess')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('MemberAccessWarning', () => {
  it('names how many members cannot see the Data Mart', () => {
    render(
      <MemberAccessWarning count={2} testId='warning'>
        It isn&apos;t shared with them.
      </MemberAccessWarning>
    );

    expect(screen.getByText("2 members can't see this Data Mart")).toBeInTheDocument();
    expect(screen.getByText("It isn't shared with them.")).toBeInTheDocument();
  });

  it('stays hidden when nobody is affected', () => {
    render(
      <MemberAccessWarning count={0} testId='warning'>
        It isn&apos;t shared with them.
      </MemberAccessWarning>
    );

    expect(screen.queryByTestId('warning')).not.toBeInTheDocument();
  });
});

describe('MemberAvatars', () => {
  it('names the members a setting lets in and shows nothing for none', () => {
    const { rerender } = render(
      <MemberAvatars
        members={members.slice(1, 3)}
        label='Shared for reporting with'
        testId='avatars'
      />
    );

    expect(
      screen.getByRole('group', { name: 'Shared for reporting with Ben, Tom' })
    ).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <MemberAvatars members={[]} label='Shared for reporting with' testId='avatars' />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('avatars')).not.toBeInTheDocument();
  });
});
