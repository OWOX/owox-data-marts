import { describe, expect, it } from 'vitest';
import type {
  DataMartAccessLevelDto,
  DataMartMemberAccessItemDto,
} from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import {
  countMembersSharingWouldLetIn,
  countMembersWhoCannotSee,
  explainMemberAccess,
  formatMemberCount,
  memberAccessPath,
  membersInContext,
  membersSharingOpensTo,
  plainText,
  sortMembersForAccess,
  type MemberAccessDataMart,
  type MemberAccessText,
} from './member-access.utils';

const yes = (reason: DataMartAccessLevelDto['reason']): DataMartAccessLevelDto => ({
  granted: true,
  reason,
});
const no = (reason: DataMartAccessLevelDto['reason']): DataMartAccessLevelDto => ({
  granted: false,
  reason,
});

function member(overrides: Partial<DataMartMemberAccessItemDto> = {}): DataMartMemberAccessItemDto {
  return {
    userId: 'user-1',
    email: 'ben@example.com',
    displayName: 'Ben',
    role: 'viewer',
    roleScope: 'selected_contexts',
    contexts: [{ id: 'ctx-paid', name: 'Paid ads' }],
    ownership: null,
    see: yes('SHARED_CONTEXT'),
    edit: no('ROLE_REQUIRED'),
    configureSharing: no('ROLE_REQUIRED'),
    ...overrides,
  };
}

const dataMart = {
  contexts: [
    { id: 'ctx-paid', name: 'Paid ads' },
    { id: 'ctx-seo', name: 'SEO' },
  ],
  availableForMaintenance: true,
};

/** The explanation as the admin reads it, links flattened to their text. */
function explain(member: DataMartMemberAccessItemDto, onDataMart: MemberAccessDataMart) {
  const { accessThrough, canDo, next } = explainMemberAccess(member, onDataMart);
  return {
    accessThrough: accessThrough.map(plainText),
    canDo: plainText(canDo),
    ...(next && { next: plainText(next) }),
  };
}

/** The linked parts of a text: what they say and where they lead. */
const links = (text: MemberAccessText | undefined) =>
  (text ?? []).flatMap(part =>
    typeof part === 'string' ? [] : [[part.text, memberAccessPath(part.target)]]
  );

describe('explainMemberAccess', () => {
  it('names the Sharing option and context a Business User sees it through, and the role to edit it', () => {
    expect(
      explain(
        member({
          contexts: [
            { id: 'ctx-paid', name: 'Paid ads' },
            { id: 'ctx-social', name: 'Social' },
          ],
        }),
        dataMart
      )
    ).toEqual({
      accessThrough: ['Shared for reporting · Paid ads'],
      canDo: 'Can see it and build reports',
      next: 'To edit it: change their role to Data Owner in Project settings → Members',
    });
  });

  it('also asks for maintenance sharing when the Data Mart is not shared for it', () => {
    expect(explain(member(), { ...dataMart, availableForMaintenance: false }).next).toBe(
      "To edit it: change their role to Data Owner in Project settings → Members, then turn on Shared for maintenance or add them as this Data Mart's Data Owner in Ownership"
    );
  });

  it('asks only for the role when the member is already the Data Owner of this Data Mart', () => {
    expect(
      explain(member({ ownership: 'DATA_OWNER', see: yes('OWNER') }), {
        ...dataMart,
        availableForMaintenance: false,
      })
    ).toEqual({
      accessThrough: ['Data Owner of this Data Mart'],
      canDo: 'Can see it and build reports',
      next: 'To edit it: change their role to Data Owner in Project settings → Members',
    });
  });

  it('walks a member with the Data Owner role from maintenance sharing to Ownership', () => {
    const projectWide = {
      role: 'editor',
      roleScope: 'entire_project' as const,
      see: yes('PROJECT_WIDE_ACCESS'),
      configureSharing: no('OWNER_REQUIRED'),
    };
    expect(explain(member({ ...projectWide, edit: no('NOT_SHARED') }), dataMart)).toEqual({
      accessThrough: ['Shared for reporting'],
      canDo: 'Can see it and build reports',
      next: "To edit it: turn on Shared for maintenance, or add them as this Data Mart's Data Owner in Ownership",
    });
    expect(explain(member({ ...projectWide, edit: yes('PROJECT_WIDE_ACCESS') }), dataMart)).toEqual(
      {
        accessThrough: ['Shared for maintenance'],
        canDo: 'Can see it, build reports, edit, delete and manage triggers',
        next: "To change Sharing and Ownership: add them as this Data Mart's Data Owner in Ownership",
      }
    );
  });

  it('lists a Business Owner who also edits through maintenance sharing', () => {
    expect(
      explain(
        member({
          role: 'editor',
          ownership: 'BUSINESS_OWNER',
          see: yes('OWNER'),
          edit: yes('SHARED_CONTEXT'),
          configureSharing: no('OWNER_REQUIRED'),
        }),
        dataMart
      ).accessThrough
    ).toEqual(['Business Owner of this Data Mart', 'Shared for maintenance · Paid ads']);
  });

  it('describes full access without a next step', () => {
    expect(
      explain(
        member({
          role: 'admin',
          see: yes('PROJECT_ADMIN'),
          edit: yes('PROJECT_ADMIN'),
          configureSharing: yes('PROJECT_ADMIN'),
        }),
        dataMart
      )
    ).toEqual({ accessThrough: ['Project Admin'], canDo: 'Full access' });
    expect(
      explain(
        member({
          role: 'editor',
          ownership: 'DATA_OWNER',
          see: yes('OWNER'),
          edit: yes('OWNER'),
          configureSharing: yes('OWNER'),
        }),
        dataMart
      )
    ).toEqual({
      accessThrough: ['Data Owner of this Data Mart'],
      canDo:
        'Can see it, build reports, edit, delete, manage triggers, and change Sharing and Ownership',
    });
  });

  it('asks for Shared for reporting when a Business User cannot see the Data Mart', () => {
    expect(explain(member({ see: no('NOT_SHARED') }), dataMart)).toEqual({
      accessThrough: ['No access'],
      canDo: 'Not shared for reporting',
      next: 'To see it: turn on Shared for reporting, or add them as Business Owner in Ownership',
    });
  });

  it('says the Data Mart has no context and which of the member’s contexts to add', () => {
    expect(
      explain(member({ see: no('DATA_MART_HAS_NO_CONTEXT') }), {
        ...dataMart,
        contexts: [],
      })
    ).toEqual({
      accessThrough: ['No access'],
      canDo: 'Sees only their contexts (Paid ads), and this Data Mart has none',
      next: 'To see it: add Paid ads in Contexts',
    });
  });

  it('lists both sides when the contexts do not meet', () => {
    expect(
      explain(
        member({ contexts: [{ id: 'ctx-social', name: 'Social' }], see: no('NO_SHARED_CONTEXT') }),
        dataMart
      )
    ).toEqual({
      accessThrough: ['No access'],
      canDo: 'Sees only their contexts (Social), and none of them is on this Data Mart',
      next: 'To see it: add Social in Contexts, or assign the member to Paid ads, SEO',
    });
  });

  it('adds the context step when Sharing alone would not reach a member limited to other contexts', () => {
    const outside = member({
      contexts: [{ id: 'ctx-social', name: 'Social' }],
      see: no('NOT_SHARED'),
    });
    expect(explain(outside, dataMart).next).toBe(
      'To see it: turn on Shared for reporting and add Social in Contexts, or add them as Business Owner in Ownership'
    );
    expect(explain(member({ contexts: [], see: no('NOT_SHARED') }), dataMart).next).toBe(
      'To see it: turn on Shared for reporting and assign the member to Paid ads, SEO, or add them as Business Owner in Ownership'
    );
  });

  it('does not promise edit through maintenance sharing to a Business Owner the context gate keeps out', () => {
    const businessOwner = member({
      contexts: [{ id: 'ctx-social', name: 'Social' }],
      ownership: 'BUSINESS_OWNER',
      see: yes('OWNER'),
    });
    expect(explain(businessOwner, dataMart).next).toBe(
      "To edit it: change their role to Data Owner in Project settings → Members, then add Social in Contexts or add them as this Data Mart's Data Owner in Ownership"
    );
    expect(explain(businessOwner, { ...dataMart, availableForMaintenance: false }).next).toBe(
      "To edit it: change their role to Data Owner in Project settings → Members, then turn on Shared for maintenance and add Social in Contexts or add them as this Data Mart's Data Owner in Ownership"
    );
  });

  it('asks for one of several contexts, since one is enough and each exposes the Data Mart more', () => {
    const several = [
      { id: 'ctx-social', name: 'Social' },
      { id: 'ctx-brand', name: 'Brand' },
    ];
    expect(
      explain(member({ contexts: several, see: no('NO_SHARED_CONTEXT') }), dataMart).next
    ).toBe(
      'To see it: add one of their contexts (Social, Brand) in Contexts, or assign the member to Paid ads, SEO'
    );
    expect(
      explain(member({ contexts: several, see: no('DATA_MART_HAS_NO_CONTEXT') }), {
        ...dataMart,
        contexts: [],
      }).next
    ).toBe('To see it: add one of their contexts (Social, Brand) in Contexts');
  });

  it('links settings on other screens: contexts to their pages, roles to the member in Members', () => {
    const blocked = explainMemberAccess(
      member({ contexts: [{ id: 'ctx-social', name: 'Social' }], see: no('NO_SHARED_CONTEXT') }),
      dataMart
    );
    expect(links(blocked.canDo)).toEqual([
      ['Social', '/project-settings/contexts?context=ctx-social'],
    ]);
    expect(links(blocked.next)).toEqual([
      ['Paid ads', '/project-settings/contexts?context=ctx-paid'],
      ['SEO', '/project-settings/contexts?context=ctx-seo'],
    ]);

    const businessUser = explainMemberAccess(member(), dataMart);
    expect(links(businessUser.accessThrough[0])).toEqual([
      ['Paid ads', '/project-settings/contexts?context=ctx-paid'],
    ]);
    expect(links(businessUser.next)).toEqual([
      ['Project settings → Members', '/project-settings/members?member=user-1'],
    ]);
  });
});

describe('sortMembersForAccess', () => {
  it('puts members with the least access first, then sorts by name', () => {
    const sorted = sortMembersForAccess([
      member({
        userId: 'admin',
        displayName: 'Ada',
        role: 'admin',
        see: yes('PROJECT_ADMIN'),
        edit: yes('PROJECT_ADMIN'),
        configureSharing: yes('PROJECT_ADMIN'),
      }),
      member({ userId: 'b', displayName: 'Bea' }),
      member({ userId: 'z', displayName: 'Zoe', see: no('NOT_SHARED') }),
      member({ userId: 'a', displayName: undefined, email: 'al@example.com' }),
      member({ userId: 'c', displayName: 'Cy', see: no('NO_SHARED_CONTEXT') }),
    ]);

    expect(sorted.map(m => m.userId)).toEqual(['c', 'z', 'a', 'b', 'admin']);
  });
});

describe('counts', () => {
  it('counts members kept from seeing the Data Mart by one rule', () => {
    const members = [
      member({ see: no('NOT_SHARED') }),
      member({ see: no('NOT_SHARED') }),
      member({ see: no('DATA_MART_HAS_NO_CONTEXT') }),
      member({ see: yes('OWNER') }),
    ];

    expect(countMembersWhoCannotSee(members, 'NOT_SHARED')).toBe(2);
    expect(countMembersWhoCannotSee(null, 'NOT_SHARED')).toBe(0);
  });

  it('counts in the Sharing warning only members whom Sharing would let in', () => {
    const members = [
      member({ see: no('NOT_SHARED') }),
      member({ contexts: [{ id: 'ctx-social', name: 'Social' }], see: no('NOT_SHARED') }),
      member({ roleScope: 'entire_project', contexts: [], see: no('NOT_SHARED') }),
    ];

    expect(countMembersSharingWouldLetIn(members, dataMart)).toBe(2);
  });

  it('formats one and many members', () => {
    expect(formatMemberCount(1)).toBe('1 member');
    expect(formatMemberCount(3)).toBe('3 members');
  });
});

describe('who a setting lets in', () => {
  const members = [
    member({ userId: 'zoe', displayName: 'Zoe', see: yes('SHARED_CONTEXT') }),
    member({
      userId: 'tom',
      displayName: 'Tom',
      role: 'editor',
      roleScope: 'entire_project',
      contexts: [],
      see: yes('PROJECT_WIDE_ACCESS'),
      edit: yes('PROJECT_WIDE_ACCESS'),
    }),
    member({ userId: 'ben', displayName: 'Ben', see: no('NO_SHARED_CONTEXT') }),
    member({ userId: 'owner', displayName: 'Ola', ownership: 'BUSINESS_OWNER', see: yes('OWNER') }),
    member({
      userId: 'admin',
      displayName: 'Ada',
      role: 'admin',
      see: yes('PROJECT_ADMIN'),
      edit: yes('PROJECT_ADMIN'),
    }),
  ];

  it('lists members who see or edit the Data Mart through Sharing, not owners or admins', () => {
    expect(membersSharingOpensTo(members, 'reporting').map(m => m.userId)).toEqual(['tom', 'zoe']);
    expect(membersSharingOpensTo(members, 'maintenance').map(m => m.userId)).toEqual(['tom']);
    expect(membersSharingOpensTo(null, 'reporting')).toEqual([]);
  });

  it('lists members limited to a context and assigned to it, never admins', () => {
    expect(membersInContext(members, 'ctx-paid').map(m => m.userId)).toEqual([
      'ben',
      'owner',
      'zoe',
    ]);
    expect(membersInContext(members, 'ctx-seo')).toEqual([]);
  });
});
