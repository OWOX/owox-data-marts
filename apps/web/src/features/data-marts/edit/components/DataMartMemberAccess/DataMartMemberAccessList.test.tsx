import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  DataMartAccessLevelDto,
  DataMartMemberAccessItemDto,
} from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import { DataMartMemberAccessList } from './DataMartMemberAccessList';
import { MemberAccessWarning } from './MemberAccessWarning';

const yes = (reason: DataMartAccessLevelDto['reason']) => ({ granted: true, reason });
const no = (reason: DataMartAccessLevelDto['reason']) => ({ granted: false, reason });

function member(overrides: Partial<DataMartMemberAccessItemDto>): DataMartMemberAccessItemDto {
  return {
    userId: 'user-1',
    email: 'user@example.com',
    role: 'viewer',
    roleScope: 'selected_contexts',
    contexts: [],
    use: yes('PROJECT_WIDE_ACCESS'),
    maintain: no('ROLE_REQUIRED'),
    manageAccess: no('ROLE_REQUIRED'),
    ...overrides,
  };
}

const members = [
  member({
    userId: 'admin',
    displayName: 'Ada',
    role: 'admin',
    use: yes('PROJECT_ADMIN'),
    maintain: yes('PROJECT_ADMIN'),
    manageAccess: yes('PROJECT_ADMIN'),
  }),
  member({
    userId: 'ben',
    displayName: 'Ben',
    contexts: [{ id: 'ctx-paid', name: 'Paid ads' }],
    use: no('NO_SHARED_CONTEXT'),
  }),
  member({
    userId: 'tom',
    displayName: 'Tom',
    role: 'editor',
    roleScope: 'entire_project',
    maintain: yes('PROJECT_WIDE_ACCESS'),
    manageAccess: no('OWNER_REQUIRED'),
  }),
];

const baseProps = {
  isLoading: false,
  hasError: false,
  onRetry: vi.fn(),
  dataMart: { contexts: [{ id: 'ctx-seo', name: 'SEO' }], availableForMaintenance: true },
  isDraft: false,
};

describe('DataMartMemberAccessList', () => {
  it('shows each member’s levels, how they get them and what to change next, least access first', () => {
    render(<DataMartMemberAccessList {...baseProps} members={members} />);

    expect(
      screen.getByText('3 members: 2 can use, 2 can maintain, 1 can manage access')
    ).toBeInTheDocument();

    const rows = screen.getAllByTestId('dataMartMemberAccessRow');
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('Ben')).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("Can't use")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("Can't maintain")).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(
        'Sees only their contexts (Paid ads), and none of them is on this Data Mart'
      )
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(
        'To use: Add one of them to this Data Mart, or assign the member to SEO'
      )
    ).toBeInTheDocument();

    expect(within(rows[1]).getByText('Tom')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('Can maintain')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText("Can't manage access")).toBeInTheDocument();
    expect(
      within(rows[1]).getByText('To manage access: Add them as Data Owner in Ownership')
    ).toBeInTheDocument();

    expect(within(rows[2]).getByText('Project Admins have full access')).toBeInTheDocument();
    expect(within(rows[2]).getByLabelText('Can manage access')).toBeInTheDocument();
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
