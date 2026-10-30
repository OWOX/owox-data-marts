import type { UserProjection } from '../../../../../shared/types';
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

/** One context is enough to pass the context gate, and each extra one exposes the Data Mart more. */
const oneOfTheirContexts = (member: DataMartMemberAccessItemDto) =>
  member.contexts.length === 1
    ? listNames(member.contexts)
    : `one of their contexts (${listNames(member.contexts)})`;

/**
 * Whether Sharing reaches the member at all: it does unless their role is limited to selected
 * contexts and none of those is on the Data Mart — then the context gate still keeps them out.
 */
export function sharingReaches(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): boolean {
  if (member.roleScope !== 'selected_contexts') return true;
  const dataMartContextIds = new Set(dataMart.contexts.map(c => c.id));
  return member.contexts.some(c => dataMartContextIds.has(c.id));
}

/** The context change that lets Sharing reach a member limited to selected contexts. */
function contextStep(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): MemberAccessText {
  if (member.contexts.length > 0) return [`add ${oneOfTheirContexts(member)} in Contexts`];
  if (dataMart.contexts.length > 0) {
    return ['assign the member to ', ...contextLinks(dataMart.contexts)];
  }
  return [
    'add a context in Contexts and ',
    { text: 'assign the member to it', target: { kind: 'members', userId: member.userId } },
  ];
}

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

/**
 * Members whom turning on Sharing would let see the Data Mart — what the Sharing warning counts.
 * Members the context gate would still keep out are left to the Contexts hints.
 */
export function countMembersSharingWouldLetIn(
  members: readonly DataMartMemberAccessItemDto[] | null,
  dataMart: MemberAccessDataMart
): number {
  return (members ?? []).filter(
    member =>
      !member.see.granted && member.see.reason === 'NOT_SHARED' && sharingReaches(member, dataMart)
  ).length;
}

const isThroughSharing = (level: DataMartAccessLevelDto) =>
  level.granted && (level.reason === 'PROJECT_WIDE_ACCESS' || level.reason === 'SHARED_CONTEXT');

/** A member as the shared avatar components expect it. */
export function toUserProjection(member: DataMartMemberAccessItemDto): UserProjection {
  return {
    userId: member.userId,
    fullName: member.displayName ?? null,
    email: member.email,
    avatar: member.avatarUrl ?? null,
  };
}

const byName = (members: DataMartMemberAccessItemDto[]) =>
  members.sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));

/**
 * Members whom a Sharing option lets in right now: Shared for reporting — those who see the Data
 * Mart through Sharing; Shared for maintenance — those who edit it through Sharing. Admins and
 * owners have access regardless of Sharing, so they are not listed.
 */
export function membersSharingOpensTo(
  members: readonly DataMartMemberAccessItemDto[] | null,
  sharing: 'reporting' | 'maintenance'
): DataMartMemberAccessItemDto[] {
  const level = sharing === 'reporting' ? 'see' : 'edit';
  return byName((members ?? []).filter(member => isThroughSharing(member[level])));
}

/**
 * Members whose role is limited to selected contexts and who are assigned to this one — whom the
 * context lets in. Admins see everything, so they are never listed.
 */
export function membersInContext(
  members: readonly DataMartMemberAccessItemDto[] | null,
  contextId: string
): DataMartMemberAccessItemDto[] {
  return byName(
    (members ?? []).filter(
      member =>
        member.role !== 'admin' &&
        member.roleScope === 'selected_contexts' &&
        member.contexts.some(c => c.id === contextId)
    )
  );
}

export function formatMemberCount(count: number): string {
  return count === 1 ? '1 member' : `${String(count)} members`;
}

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
  if (reason === 'DATA_MART_HAS_NO_CONTEXT') {
    return member.contexts.length > 0
      ? {
          why: [
            'Sees only their contexts (',
            ...contextLinks(member.contexts),
            '), and this Data Mart has none',
          ],
          change: [`add ${oneOfTheirContexts(member)} in Contexts`],
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
            `add ${oneOfTheirContexts(member)} in Contexts, or assign the member to `,
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
  // Sharing alone is not enough when the context gate would still keep the member out.
  const andContext: MemberAccessText = sharingReaches(member, dataMart)
    ? []
    : [' and ', ...contextStep(member, dataMart)];
  return member.role === 'editor'
    ? {
        canDo: ['Not shared for reporting or maintenance'],
        next: [
          'To see it: turn on Shared for reporting or Shared for maintenance',
          ...andContext,
          ', or add them in Ownership',
        ],
      }
    : {
        canDo: ['Not shared for reporting'],
        next: [
          'To see it: turn on Shared for reporting',
          ...andContext,
          ', or add them as Business Owner in Ownership',
        ],
      };
}

function toEdit(
  member: DataMartMemberAccessItemDto,
  dataMart: MemberAccessDataMart
): MemberAccessText {
  const { reason } = member.edit;
  // Maintenance sharing is a way in only when it reaches the member past the context gate;
  // owning the Data Mart as its Data Owner bypasses both.
  const reaches = sharingReaches(member, dataMart);
  if (reason === 'ROLE_REQUIRED') {
    if (member.ownership === 'DATA_OWNER' || (dataMart.availableForMaintenance && reaches)) {
      return ['To edit it: ', ...roleChange(member)];
    }
    if (dataMart.availableForMaintenance) {
      return [
        'To edit it: ',
        ...roleChange(member),
        ', then ',
        ...contextStep(member, dataMart),
        ` or ${DATA_OWNER_OF_THIS}`,
      ];
    }
    return [
      'To edit it: ',
      ...roleChange(member),
      ', then turn on Shared for maintenance',
      ...(reaches ? [] : [' and ', ...contextStep(member, dataMart)]),
      ` or ${DATA_OWNER_OF_THIS}`,
    ];
  }
  const gate = contextGate(reason, member, dataMart);
  if (gate) {
    return ['To edit it: ', ...gate.change];
  }
  return [
    'To edit it: turn on Shared for maintenance',
    ...(reaches ? [] : [' and ', ...contextStep(member, dataMart)]),
    `, or ${DATA_OWNER_OF_THIS}`,
  ];
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
