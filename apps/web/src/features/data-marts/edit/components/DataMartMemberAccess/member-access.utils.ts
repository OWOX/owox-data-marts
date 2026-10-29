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

/** The screen a link in an explanation opens: Members (with a member's details) or a context. */
export type MemberAccessTarget =
  | { kind: 'members'; userId?: string }
  | { kind: 'context'; contextId: string };

/** A piece of explanation text; a linked piece opens the screen where that setting changes. */
export type MemberAccessPart = string | { text: string; target: MemberAccessTarget };
export type MemberAccessText = MemberAccessPart[];

/**
 * One member's access, told only in names the product already uses: the Ownership and Sharing
 * settings on the Data Mart page, the project roles, and the actions those settings describe.
 */
export interface MemberAccessExplanation {
  /** Where the access comes from: Project Admin, an Ownership slot, or a Sharing option. */
  accessThrough: MemberAccessText[];
  /** What the member can do, or why they cannot see the Data Mart. */
  canDo: MemberAccessText;
  /** What to change so they can take the next actions they lack. */
  next?: MemberAccessText;
}

export function plainText(text: MemberAccessText): string {
  return text.map(part => (typeof part === 'string' ? part : part.text)).join('');
}

/** Project-relative path of a link: Members opens the member's details, Contexts the context's. */
export function memberAccessPath(target: MemberAccessTarget): string {
  if (target.kind === 'context') {
    return `/project-settings/contexts?context=${encodeURIComponent(target.contextId)}`;
  }
  return target.userId
    ? `/project-settings/members?member=${encodeURIComponent(target.userId)}`
    : '/project-settings/members';
}

/** Where a member's role and contexts change. */
export const MEMBERS_LINK_TEXT = 'Project settings → Members';

const ACTION_GROUPS = ['see', 'edit', 'configureSharing'] as const;

const SEES_AND_REPORTS = 'Can see it and build reports';
const EDITS = 'Can see it, build reports, edit, delete and manage triggers';
const CONFIGURES_SHARING =
  'Can see it, build reports, edit, delete, manage triggers, and change Sharing and Ownership';

const DATA_OWNER_OF_THIS = "add them as this Data Mart's Data Owner in Ownership";

const listNames = (contexts: readonly NamedContext[]) => contexts.map(c => c.name).join(', ');

/** Context names separated by commas, each a link to the context's page. */
const contextLinks = (contexts: readonly NamedContext[]): MemberAccessText =>
  contexts.flatMap(
    (context, index): MemberAccessText => [
      ...(index > 0 ? [', '] : []),
      { text: context.name, target: { kind: 'context', contextId: context.id } },
    ]
  );

const roleChange = (member: DataMartMemberAccessItemDto): MemberAccessText => [
  'change their role to Data Owner in ',
  { text: MEMBERS_LINK_TEXT, target: { kind: 'members', userId: member.userId } },
];

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
): MemberAccessText[] {
  if (member.see.reason === 'PROJECT_ADMIN') {
    return [['Project Admin']];
  }

  const sources: MemberAccessText[] = [];
  if (member.ownership === 'DATA_OWNER') sources.push(['Data Owner of this Data Mart']);
  if (member.ownership === 'BUSINESS_OWNER') sources.push(['Business Owner of this Data Mart']);

  // The stronger Sharing option that actually reaches the member, with the context it reaches
  // them through when their access is limited to selected contexts.
  let sharing: { label: string; level: DataMartAccessLevelDto } | null = null;
  if (isThroughSharing(member.edit)) {
    sharing = { label: 'Shared for maintenance', level: member.edit };
  } else if (isThroughSharing(member.see)) {
    sharing = { label: 'Shared for reporting', level: member.see };
  }
  if (sharing) {
    sources.push(
      sharing.level.reason === 'SHARED_CONTEXT'
        ? [`${sharing.label} · `, ...contextLinks(sharedContexts(member, dataMart))]
        : [sharing.label]
    );
  }

  return sources.length > 0 ? sources : [['No access']];
}

/** Why the member's contexts keep them out, and what to change — the same for every action. */
function contextGate(
  reason: DataMartAccessReason,
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): { why: MemberAccessText; change: MemberAccessText } | null {
  // The member's contexts link to their pages; contexts to add are ticked in Contexts on this page.
  const theirs = listNames(member.contexts);
  if (reason === 'DATA_MART_HAS_NO_CONTEXT') {
    return member.contexts.length > 0
      ? {
          why: [
            'Sees only their contexts (',
            ...contextLinks(member.contexts),
            '), and this Data Mart has none',
          ],
          change: [`add ${theirs} in Contexts`],
        }
      : {
          why: ['Sees only their contexts, has none assigned, and this Data Mart has none'],
          change: [
            'add a context in Contexts and ',
            {
              text: 'assign the member to it',
              target: { kind: 'members', userId: member.userId },
            },
          ],
        };
  }
  if (reason === 'NO_SHARED_CONTEXT') {
    return member.contexts.length > 0
      ? {
          why: [
            'Sees only their contexts (',
            ...contextLinks(member.contexts),
            '), and none of them is on this Data Mart',
          ],
          change: [
            `add ${theirs} in Contexts, or assign the member to `,
            ...contextLinks(dataMart.contexts),
          ],
        }
      : {
          why: ['Sees only their contexts, and has none assigned'],
          change: ['assign the member to ', ...contextLinks(dataMart.contexts)],
        };
  }
  return null;
}

function cannotSee(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): { canDo: MemberAccessText; next: MemberAccessText } {
  const gate = contextGate(member.see.reason, member, dataMart);
  if (gate) {
    return { canDo: gate.why, next: ['To see it: ', ...gate.change] };
  }
  return member.role === 'editor'
    ? {
        canDo: ['Not shared for reporting or maintenance'],
        next: [
          'To see it: turn on Shared for reporting or Shared for maintenance, or add them in Ownership',
        ],
      }
    : {
        canDo: ['Not shared for reporting'],
        next: [
          'To see it: turn on Shared for reporting, or add them as Business Owner in Ownership',
        ],
      };
}

function toEdit(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): MemberAccessText {
  const { reason } = member.edit;
  if (reason === 'ROLE_REQUIRED') {
    // A Data Owner of this Data Mart only lacks the role; anyone else also needs a way in.
    return member.ownership === 'DATA_OWNER' || dataMart.availableForMaintenance
      ? ['To edit it: ', ...roleChange(member)]
      : [
          'To edit it: ',
          ...roleChange(member),
          `, then turn on Shared for maintenance or ${DATA_OWNER_OF_THIS}`,
        ];
  }
  const gate = contextGate(reason, member, dataMart);
  if (gate) {
    return ['To edit it: ', ...gate.change];
  }
  return [`To edit it: turn on Shared for maintenance, or ${DATA_OWNER_OF_THIS}`];
}

function toConfigureSharing(member: DataMartMemberAccessItemDto): MemberAccessText {
  if (member.configureSharing.reason === 'ROLE_REQUIRED') {
    return member.ownership === 'DATA_OWNER'
      ? ['To change Sharing and Ownership: ', ...roleChange(member)]
      : ['To change Sharing and Ownership: ', ...roleChange(member), `, and ${DATA_OWNER_OF_THIS}`];
  }
  return [`To change Sharing and Ownership: ${DATA_OWNER_OF_THIS}`];
}

/**
 * Explains one member's access in the product's own terms: where it comes from (Project Admin,
 * Ownership, Sharing), what it lets them do, and what to change for the next actions they lack.
 * Settings on other screens are links: the member's details in Members, or a context's page.
 */
export function explainMemberAccess(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): MemberAccessExplanation {
  if (!member.see.granted) {
    return { accessThrough: [['No access']], ...cannotSee(member, dataMart) };
  }

  const through = accessThrough(member, dataMart);
  if (!member.edit.granted) {
    return { accessThrough: through, canDo: [SEES_AND_REPORTS], next: toEdit(member, dataMart) };
  }
  if (!member.configureSharing.granted) {
    return { accessThrough: through, canDo: [EDITS], next: toConfigureSharing(member) };
  }
  return {
    accessThrough: through,
    canDo: [member.see.reason === 'PROJECT_ADMIN' ? 'Full access' : CONFIGURES_SHARING],
  };
}
