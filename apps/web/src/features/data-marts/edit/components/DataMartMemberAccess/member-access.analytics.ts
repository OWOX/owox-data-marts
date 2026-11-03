import { useEffect, useRef } from 'react';
import { trackEvent } from '../../../../../utils/data-layer';
import type { DataMartMemberAccessItemDto } from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import type { MemberAccessTarget } from './member-access.utils';

const ACTIONS = {
  data_mart_member_access_shown: 'MemberAccessShown',
  data_mart_member_access_changed: 'MemberAccessChanged',
  data_mart_member_access_link_clicked: 'MemberAccessLinkClicked',
} as const;

export type MemberAccessEvent = keyof typeof ACTIONS;

/** Where in a member's row, or above the rows, a link sits. */
export type MemberAccessLinkPlace = 'summary' | 'access_through' | 'can_do' | 'hint';

/** How many members can do what. Counts only: an event never says who. */
export function summarizeMemberAccess(members: readonly DataMartMemberAccessItemDto[]) {
  const canSeeCount = members.filter(m => m.see.granted).length;
  return {
    memberCount: members.length,
    canSeeCount,
    cannotSeeCount: members.length - canSeeCount,
    canEditCount: members.filter(m => m.edit.granted).length,
    canChangeSharingCount: members.filter(m => m.configureSharing.granted).length,
  };
}

/**
 * How many members gained or lost seeing and editing between two answers. Members only in one
 * of them joined or left the project meanwhile, which no edit on this page did.
 */
export function compareMemberAccess(
  before: readonly DataMartMemberAccessItemDto[],
  after: readonly DataMartMemberAccessItemDto[]
) {
  const previous = new Map(before.map(member => [member.userId, member]));
  const change = { seeGained: 0, seeLost: 0, editGained: 0, editLost: 0 };
  for (const member of after) {
    const was = previous.get(member.userId);
    if (!was) continue;
    if (!was.see.granted && member.see.granted) change.seeGained += 1;
    if (was.see.granted && !member.see.granted) change.seeLost += 1;
    if (!was.edit.granted && member.edit.granted) change.editGained += 1;
    if (was.edit.granted && !member.edit.granted) change.editLost += 1;
  }
  return change;
}

/** Where a link leads: the Members list, one member's details, or a context. */
export function linkDestination(target: MemberAccessTarget): 'members' | 'member' | 'context' {
  if (target.kind === 'context') return 'context';
  return target.userId ? 'member' : 'members';
}

/**
 * Never throws: telemetry must not break the page that reports it. The keys other events set
 * are sent as null, as GTM keeps the last value pushed for a key the push leaves out. The
 * PostHog tag in GTM forwards a fixed set of keys, so the properties also travel as JSON in
 * `details`, one of them.
 */
export function trackMemberAccessEvent(
  event: MemberAccessEvent,
  dataMartId: string,
  properties: Record<string, unknown> = {}
): void {
  try {
    const own = { dataMartId, ...properties };
    trackEvent({
      event,
      category: 'DataMart',
      action: ACTIONS[event],
      label: dataMartId,
      context: null,
      value: null,
      error: null,
      ...own,
      details: JSON.stringify(own),
    });
  } catch {
    // Nothing to do: an event lost is better than a page broken.
  }
}

/**
 * Reports the list once per Data Mart and page visit, when an answer is on screen and its card
 * is expanded, and every later answer in which an edit on the page let members in or kept them
 * out.
 */
export function useMemberAccessAnalytics(
  dataMartId: string,
  members: readonly DataMartMemberAccessItemDto[] | null,
  isCollapsed: boolean
): void {
  const shownFor = useRef<string | null>(null);
  const lastAnswer = useRef<{
    dataMartId: string;
    members: readonly DataMartMemberAccessItemDto[];
  } | null>(null);

  useEffect(() => {
    if (!members || isCollapsed || shownFor.current === dataMartId) return;
    shownFor.current = dataMartId;
    trackMemberAccessEvent(
      'data_mart_member_access_shown',
      dataMartId,
      summarizeMemberAccess(members)
    );
  }, [dataMartId, members, isCollapsed]);

  useEffect(() => {
    if (!members) return;
    const previous = lastAnswer.current?.dataMartId === dataMartId ? lastAnswer.current : null;
    lastAnswer.current = { dataMartId, members };
    if (!previous || previous.members === members) return;
    const change = compareMemberAccess(previous.members, members);
    if (Object.values(change).every(count => count === 0)) return;
    trackMemberAccessEvent('data_mart_member_access_changed', dataMartId, {
      ...change,
      ...summarizeMemberAccess(members),
      // Whether the admin had the list in front of them before making the change.
      afterListShown: shownFor.current === dataMartId,
    });
  }, [dataMartId, members]);
}
