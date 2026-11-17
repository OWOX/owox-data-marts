import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberDetailsSheet } from './MemberDetailsSheet';
import type { MemberWithScopeDto } from '../../../../contexts/types/context.types';

vi.mock('../../model/members-settings.context', () => ({
  useMembersSettings: () => ({ members: [], refresh: vi.fn() }),
}));
vi.mock('../../../../idp/hooks/useRole', () => ({ useIsAdmin: () => true }));
vi.mock('../../../../contexts/components/ContextsCheckboxList', () => ({
  ContextsCheckboxList: () => null,
}));
vi.mock('../../../../contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));

const member = {
  userId: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'viewer',
  roleScope: 'entire_project',
  contextIds: [],
} as unknown as MemberWithScopeDto;

function renderSheet(link?: string | null) {
  return render(
    <MemberDetailsSheet
      isOpen
      member={member}
      contexts={[]}
      link={link}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />
  );
}

describe('MemberDetailsSheet', () => {
  it('shows Copy link only when it gets a link', () => {
    const { unmount } = renderSheet();
    expect(screen.queryByRole('button', { name: 'Copy link to this member' })).toBeNull();
    unmount();

    renderSheet('https://app.test/ui/p1/project-settings/members?member=u1');
    expect(screen.getByRole('button', { name: 'Copy link to this member' })).toBeInTheDocument();
  });
});
