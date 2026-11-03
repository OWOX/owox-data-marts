import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type {
  DataMartAccessLevelDto,
  DataMartMemberAccessItemDto,
} from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import {
  compareMemberAccess,
  linkDestination,
  summarizeMemberAccess,
  trackMemberAccessEvent,
  useMemberAccessAnalytics,
} from './member-access.analytics';

const trackEvent = vi.fn();
vi.mock('../../../../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

const yes = (reason: DataMartAccessLevelDto['reason']) => ({ granted: true, reason });
const no = (reason: DataMartAccessLevelDto['reason']) => ({ granted: false, reason });

function member(overrides: Partial<DataMartMemberAccessItemDto>): DataMartMemberAccessItemDto {
  return {
    userId: 'user-1',
    email: 'user@example.com',
    displayName: 'User One',
    role: 'viewer',
    roleScope: 'selected_contexts',
    contexts: [],
    ownership: null,
    see: yes('SHARED_CONTEXT'),
    edit: no('ROLE_REQUIRED'),
    configureSharing: no('ROLE_REQUIRED'),
    ...overrides,
  };
}

const admin = member({
  userId: 'admin',
  email: 'ada@example.com',
  role: 'admin',
  see: yes('PROJECT_ADMIN'),
  edit: yes('PROJECT_ADMIN'),
  configureSharing: yes('PROJECT_ADMIN'),
});
const maria = member({
  userId: 'maria',
  email: 'maria@agency.example',
  see: no('NO_SHARED_CONTEXT'),
});
const mariaLetIn = { ...maria, see: yes('SHARED_CONTEXT') };

const eventsNamed = (name: string) =>
  trackEvent.mock.calls
    .map(([event]) => event as Record<string, unknown>)
    .filter(e => e.event === name);

describe('member access analytics', () => {
  beforeEach(() => {
    trackEvent.mockReset();
  });

  it('counts who can do what without naming anyone', () => {
    expect(summarizeMemberAccess([admin, maria])).toEqual({
      memberCount: 2,
      canSeeCount: 1,
      cannotSeeCount: 1,
      canEditCount: 1,
      canChangeSharingCount: 1,
    });
  });

  it('counts members who gained or lost access, ignoring members who joined meanwhile', () => {
    const newcomer = member({ userId: 'new' });
    expect(compareMemberAccess([admin, maria], [admin, mariaLetIn, newcomer])).toEqual({
      seeGained: 1,
      seeLost: 0,
      editGained: 0,
      editLost: 0,
    });
    expect(compareMemberAccess([mariaLetIn], [maria])).toMatchObject({ seeLost: 1 });
  });

  it('names where a link leads', () => {
    expect(linkDestination({ kind: 'members' })).toBe('members');
    expect(linkDestination({ kind: 'members', userId: 'maria' })).toBe('member');
    expect(linkDestination({ kind: 'context', contextId: 'ctx-1' })).toBe('context');
  });

  it('sends its properties in details too and clears the keys other events set', () => {
    trackMemberAccessEvent('data_mart_member_access_link_clicked', 'dm-1', {
      destination: 'context',
    });

    expect(trackEvent).toHaveBeenCalledWith({
      event: 'data_mart_member_access_link_clicked',
      category: 'DataMart',
      action: 'MemberAccessLinkClicked',
      label: 'dm-1',
      context: null,
      value: null,
      error: null,
      dataMartId: 'dm-1',
      destination: 'context',
      details: JSON.stringify({ dataMartId: 'dm-1', destination: 'context' }),
    });
  });

  it('never breaks the page when tracking fails', () => {
    trackEvent.mockImplementation(() => {
      throw new Error('dataLayer is gone');
    });

    expect(() => {
      trackMemberAccessEvent('data_mart_member_access_shown', 'dm-1');
    }).not.toThrow();
  });

  it('reports the list once per Data Mart, only while its card is expanded', () => {
    const { rerender } = renderHook(
      ({ id, members, collapsed }) => {
        useMemberAccessAnalytics(id, members, collapsed);
      },
      {
        initialProps: {
          id: 'dm-1',
          members: [admin, maria] as DataMartMemberAccessItemDto[] | null,
          collapsed: true,
        },
      }
    );
    expect(eventsNamed('data_mart_member_access_shown')).toHaveLength(0);

    rerender({ id: 'dm-1', members: [admin, maria], collapsed: false });
    rerender({ id: 'dm-1', members: [admin, maria], collapsed: false });
    expect(eventsNamed('data_mart_member_access_shown')).toEqual([
      expect.objectContaining({ label: 'dm-1', memberCount: 2, cannotSeeCount: 1 }),
    ]);

    rerender({ id: 'dm-2', members: null, collapsed: false });
    rerender({ id: 'dm-2', members: [admin], collapsed: false });
    expect(eventsNamed('data_mart_member_access_shown')).toHaveLength(2);
  });

  it('reports an answer an edit changed, and says whether the list was shown before it', () => {
    const { rerender } = renderHook(
      ({ members }) => {
        useMemberAccessAnalytics('dm-1', members, false);
      },
      { initialProps: { members: [admin, maria] } }
    );

    rerender({ members: [admin, maria].map(m => ({ ...m })) });
    expect(eventsNamed('data_mart_member_access_changed')).toHaveLength(0);

    rerender({ members: [admin, mariaLetIn] });
    expect(eventsNamed('data_mart_member_access_changed')).toEqual([
      expect.objectContaining({ seeGained: 1, canSeeCount: 2, afterListShown: true }),
    ]);
  });

  it('never sends a member’s name, email or id', () => {
    const { rerender } = renderHook(
      ({ members }) => {
        useMemberAccessAnalytics('dm-1', members, false);
      },
      { initialProps: { members: [admin, maria] } }
    );
    rerender({ members: [admin, mariaLetIn] });

    const sent = JSON.stringify(trackEvent.mock.calls);
    for (const leak of ['maria', 'ada@example.com', 'User One', 'admin']) {
      expect(sent).not.toContain(leak);
    }
  });
});
