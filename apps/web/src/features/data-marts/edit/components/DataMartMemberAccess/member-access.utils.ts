import type {
  DataMartAccessLevelDto,
  DataMartAccessReason,
  DataMartMemberAccessItemDto,
} from '../../../shared/types/api/response/data-mart-member-access.response.dto';

interface NamedContext {
  id: string;
  name: string;
}

/** What of the Data Mart the explanations need: its contexts and whether it is shared for maintenance. */
export interface MemberAccessDataMart {
  contexts: readonly NamedContext[];
  availableForMaintenance: boolean;
}

export type AccessLevelKey = 'use' | 'maintain' | 'manageAccess';

export const ACCESS_LEVELS: readonly { key: AccessLevelKey; label: string; verb: string }[] = [
  { key: 'use', label: 'Use', verb: 'use' },
  { key: 'maintain', label: 'Maintain', verb: 'maintain' },
  { key: 'manageAccess', label: 'Manage access', verb: 'manage access' },
];

export interface MemberAccessExplanation {
  /** How the member gets the access they have, or why they have none. */
  summary: string;
  /** The first level they lack, and what to change to give it to them. */
  next?: { verb: string; hint: string };
}

const listNames = (contexts: readonly NamedContext[]) => contexts.map(c => c.name).join(', ');

export function memberDisplayName(member: DataMartMemberAccessItemDto): string {
  return member.displayName ?? member.email;
}

export function grantedLevelCount(member: DataMartMemberAccessItemDto): number {
  return ACCESS_LEVELS.filter(level => member[level.key].granted).length;
}

/** Least access first — those members are why an admin opens this list. */
export function sortMembersForAccess(
  members: readonly DataMartMemberAccessItemDto[]
): DataMartMemberAccessItemDto[] {
  return [...members].sort(
    (a, b) =>
      grantedLevelCount(a) - grantedLevelCount(b) ||
      memberDisplayName(a).localeCompare(memberDisplayName(b))
  );
}

/** Members who cannot use the Data Mart for the given reason — what a setting's warning counts. */
export function countMembersWhoCannotUse(
  members: readonly DataMartMemberAccessItemDto[] | null,
  reason: DataMartAccessReason
): number {
  return (members ?? []).filter(member => !member.use.granted && member.use.reason === reason)
    .length;
}

export function formatMemberCount(count: number): string {
  return count === 1 ? '1 member' : `${String(count)} members`;
}

/** Why the member's contexts keep them out, and what to change — the same for every level. */
function explainContextGate(
  reason: DataMartAccessReason,
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): { summary: string; hint: string } | null {
  if (reason === 'DATA_MART_HAS_NO_CONTEXT') {
    return member.contexts.length > 0
      ? {
          summary: `Sees only their contexts (${listNames(member.contexts)}), and this Data Mart has none`,
          hint: 'Add one of their contexts to this Data Mart',
        }
      : {
          summary: 'Sees only their contexts, but has none assigned, and this Data Mart has none',
          hint: 'Add a context to this Data Mart and assign the member to it',
        };
  }
  if (reason === 'NO_SHARED_CONTEXT') {
    return member.contexts.length > 0
      ? {
          summary: `Sees only their contexts (${listNames(member.contexts)}), and none of them is on this Data Mart`,
          hint: `Add one of them to this Data Mart, or assign the member to ${listNames(dataMart.contexts)}`,
        }
      : {
          summary: 'Sees only their contexts, but has none assigned',
          hint: `Assign the member to ${listNames(dataMart.contexts)}`,
        };
  }
  return null;
}

function explainNoUse(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): { summary: string; hint: string } {
  const contextGate = explainContextGate(member.use.reason, member, dataMart);
  if (contextGate) {
    return contextGate;
  }
  return member.role === 'editor'
    ? {
        summary: 'Not shared for reporting or maintenance',
        hint: 'Turn on a Sharing option, or add them as an owner in Ownership',
      }
    : {
        summary: 'Not shared for reporting',
        hint: 'Turn on Shared for reporting, or add them as an owner in Ownership',
      };
}

function maintainHint(member: DataMartMemberAccessItemDto, dataMart: MemberAccessDataMart): string {
  const { reason } = member.maintain;
  if (reason === 'ROLE_REQUIRED') {
    return dataMart.availableForMaintenance
      ? 'Change their project role to Data Owner'
      : 'Change their project role to Data Owner, then turn on Shared for maintenance or add them as Data Owner in Ownership';
  }
  const contextGate = explainContextGate(reason, member, dataMart);
  if (contextGate) {
    return contextGate.hint;
  }
  return 'Turn on Shared for maintenance, or add them as Data Owner in Ownership';
}

function manageAccessHint(member: DataMartMemberAccessItemDto): string {
  return member.manageAccess.reason === 'ROLE_REQUIRED'
    ? 'Change their project role to Data Owner and add them as Data Owner in Ownership'
    : 'Add them as Data Owner in Ownership';
}

/** How the member gets the highest level they have. */
function explainGranted(
  level: DataMartAccessLevelDto,
  isMaintenance: boolean,
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): string {
  const dataMartContextIds = new Set(dataMart.contexts.map(c => c.id));
  const shared = listNames(member.contexts.filter(c => dataMartContextIds.has(c.id)));

  switch (level.reason) {
    case 'PROJECT_ADMIN':
      return 'Project Admins have full access';
    case 'OWNER':
      return member.manageAccess.granted
        ? 'Data Owner of this Data Mart'
        : 'Owner of this Data Mart';
    case 'PROJECT_WIDE_ACCESS':
      return isMaintenance
        ? 'Shared for maintenance, with access to the entire project'
        : 'Has access to the entire project';
    case 'SHARED_CONTEXT':
      return isMaintenance
        ? `Shared for maintenance, in context: ${shared}`
        : `Shares context: ${shared}`;
    default:
      return 'Has access';
  }
}

/**
 * Turns the backend's per-level reasons into one line on how the member gets their access and one
 * on what to change for the next level, naming the contexts and settings involved so the admin
 * does not have to cross-check the member, the contexts and the Data Mart.
 */
export function explainMemberAccess(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): MemberAccessExplanation {
  if (!member.use.granted) {
    const { summary, hint } = explainNoUse(member, dataMart);
    return { summary, next: { verb: 'use', hint } };
  }

  if (!member.maintain.granted) {
    return {
      summary: explainGranted(member.use, false, member, dataMart),
      next: { verb: 'maintain', hint: maintainHint(member, dataMart) },
    };
  }

  if (!member.manageAccess.granted) {
    return {
      summary: explainGranted(member.maintain, true, member, dataMart),
      next: { verb: 'manage access', hint: manageAccessHint(member) },
    };
  }

  return { summary: explainGranted(member.manageAccess, false, member, dataMart) };
}
