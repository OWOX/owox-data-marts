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

/**
 * One member's access, told only in names the product already uses: the Ownership and Sharing
 * settings on the Data Mart page, the project roles, and the actions those settings describe.
 */
export interface MemberAccessExplanation {
  /** Where the access comes from: Project Admin, an Ownership slot, or a Sharing option. */
  accessThrough: string[];
  /** What the member can do, or why they cannot see the Data Mart. */
  canDo: string;
  /** What to change so they can take the next actions they lack. */
  next?: string;
}

const ACTION_GROUPS = ['see', 'edit', 'configureSharing'] as const;

const SEES_AND_REPORTS = 'Can see it and build reports';
const EDITS = 'Can see it, build reports, edit, delete and manage triggers';
const CONFIGURES_SHARING =
  'Can see it, build reports, edit, delete, manage triggers, and change Sharing and Ownership';

const ROLE_CHANGE = 'change their role to Data Owner in Project settings → Members';
const DATA_OWNER_OF_THIS = "add them as this Data Mart's Data Owner in Ownership";

const listNames = (contexts: readonly NamedContext[]) => contexts.map(c => c.name).join(', ');

export function memberDisplayName(member: DataMartMemberAccessItemDto): string {
  return member.displayName ?? member.email;
}

export function grantedActionGroupCount(member: DataMartMemberAccessItemDto): number {
  return ACTION_GROUPS.filter(group => member[group].granted).length;
}

/** Least access first — those members are why an admin opens this list. */
export function sortMembersForAccess(
  members: readonly DataMartMemberAccessItemDto[]
): DataMartMemberAccessItemDto[] {
  return [...members].sort(
    (a, b) =>
      grantedActionGroupCount(a) - grantedActionGroupCount(b) ||
      memberDisplayName(a).localeCompare(memberDisplayName(b))
  );
}

/** Members who cannot see the Data Mart for the given reason — what a setting's warning counts. */
export function countMembersWhoCannotSee(
  members: readonly DataMartMemberAccessItemDto[] | null,
  reason: DataMartAccessReason
): number {
  return (members ?? []).filter(member => !member.see.granted && member.see.reason === reason)
    .length;
}

export function formatMemberCount(count: number): string {
  return count === 1 ? '1 member' : `${String(count)} members`;
}

const isThroughSharing = (level: DataMartAccessLevelDto) =>
  level.granted && (level.reason === 'PROJECT_WIDE_ACCESS' || level.reason === 'SHARED_CONTEXT');

function sharedContexts(member: DataMartMemberAccessItemDto, dataMart: MemberAccessDataMart) {
  const dataMartContextIds = new Set(dataMart.contexts.map(c => c.id));
  return member.contexts.filter(c => dataMartContextIds.has(c.id));
}

function accessThrough(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): string[] {
  if (member.see.reason === 'PROJECT_ADMIN') {
    return ['Project Admin'];
  }

  const sources: string[] = [];
  if (member.ownership === 'DATA_OWNER') sources.push('Data Owner of this Data Mart');
  if (member.ownership === 'BUSINESS_OWNER') sources.push('Business Owner of this Data Mart');

  // The stronger Sharing option that actually reaches the member, with the context it reaches
  // them through when their access is limited to selected contexts.
  let sharing: { label: string; level: DataMartAccessLevelDto } | null = null;
  if (isThroughSharing(member.edit)) {
    sharing = { label: 'Shared for maintenance', level: member.edit };
  } else if (isThroughSharing(member.see)) {
    sharing = { label: 'Shared for reporting', level: member.see };
  }
  if (sharing) {
    const viaContext =
      sharing.level.reason === 'SHARED_CONTEXT'
        ? ` · ${listNames(sharedContexts(member, dataMart))}`
        : '';
    sources.push(`${sharing.label}${viaContext}`);
  }

  return sources.length > 0 ? sources : ['No access'];
}

/** Why the member's contexts keep them out, and what to change — the same for every action. */
function contextGate(
  reason: DataMartAccessReason,
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): { why: string; change: string } | null {
  const theirs = listNames(member.contexts);
  if (reason === 'DATA_MART_HAS_NO_CONTEXT') {
    return member.contexts.length > 0
      ? {
          why: `Sees only their contexts (${theirs}), and this Data Mart has none`,
          change: `add ${theirs} in Contexts`,
        }
      : {
          why: 'Sees only their contexts, has none assigned, and this Data Mart has none',
          change: 'add a context in Contexts and assign the member to it',
        };
  }
  if (reason === 'NO_SHARED_CONTEXT') {
    const ours = listNames(dataMart.contexts);
    return member.contexts.length > 0
      ? {
          why: `Sees only their contexts (${theirs}), and none of them is on this Data Mart`,
          change: `add ${theirs} in Contexts, or assign the member to ${ours}`,
        }
      : {
          why: 'Sees only their contexts, and has none assigned',
          change: `assign the member to ${ours}`,
        };
  }
  return null;
}

function cannotSee(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): { canDo: string; next: string } {
  const gate = contextGate(member.see.reason, member, dataMart);
  if (gate) {
    return { canDo: gate.why, next: `To see it: ${gate.change}` };
  }
  return member.role === 'editor'
    ? {
        canDo: 'Not shared for reporting or maintenance',
        next: 'To see it: turn on Shared for reporting or Shared for maintenance, or add them in Ownership',
      }
    : {
        canDo: 'Not shared for reporting',
        next: 'To see it: turn on Shared for reporting, or add them as Business Owner in Ownership',
      };
}

function toEdit(member: DataMartMemberAccessItemDto, dataMart: MemberAccessDataMart): string {
  const { reason } = member.edit;
  if (reason === 'ROLE_REQUIRED') {
    // A Data Owner of this Data Mart only lacks the role; anyone else also needs a way in.
    return member.ownership === 'DATA_OWNER' || dataMart.availableForMaintenance
      ? `To edit it: ${ROLE_CHANGE}`
      : `To edit it: ${ROLE_CHANGE}, then turn on Shared for maintenance or ${DATA_OWNER_OF_THIS}`;
  }
  const gate = contextGate(reason, member, dataMart);
  if (gate) {
    return `To edit it: ${gate.change}`;
  }
  return `To edit it: turn on Shared for maintenance, or ${DATA_OWNER_OF_THIS}`;
}

function toConfigureSharing(member: DataMartMemberAccessItemDto): string {
  if (member.configureSharing.reason === 'ROLE_REQUIRED') {
    return member.ownership === 'DATA_OWNER'
      ? `To change Sharing and Ownership: ${ROLE_CHANGE}`
      : `To change Sharing and Ownership: ${ROLE_CHANGE}, and ${DATA_OWNER_OF_THIS}`;
  }
  return `To change Sharing and Ownership: ${DATA_OWNER_OF_THIS}`;
}

/**
 * Explains one member's access in the product's own terms: where it comes from (Project Admin,
 * Ownership, Sharing), what it lets them do, and what to change for the next actions they lack.
 */
export function explainMemberAccess(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): MemberAccessExplanation {
  if (!member.see.granted) {
    return { accessThrough: ['No access'], ...cannotSee(member, dataMart) };
  }

  const through = accessThrough(member, dataMart);
  if (!member.edit.granted) {
    return { accessThrough: through, canDo: SEES_AND_REPORTS, next: toEdit(member, dataMart) };
  }
  if (!member.configureSharing.granted) {
    return { accessThrough: through, canDo: EDITS, next: toConfigureSharing(member) };
  }
  return {
    accessThrough: through,
    canDo: member.see.reason === 'PROJECT_ADMIN' ? 'Full access' : CONFIGURES_SHARING,
  };
}
