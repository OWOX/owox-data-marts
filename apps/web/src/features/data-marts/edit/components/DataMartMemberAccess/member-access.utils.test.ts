import { describe, expect, it } from 'vitest';
import type {
  DataMartAccessLevelDto,
  DataMartMemberAccessItemDto,
} from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import {
  countMembersWhoCannotUse,
  explainMemberAccess,
  formatMemberCount,
  sortMembersForAccess,
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
    use: yes('SHARED_CONTEXT'),
    maintain: no('ROLE_REQUIRED'),
    manageAccess: no('ROLE_REQUIRED'),
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

describe('explainMemberAccess', () => {
  it('names the shared context and asks for the Data Owner role to maintain', () => {
    expect(
      explainMemberAccess(
        member({
          contexts: [
            { id: 'ctx-paid', name: 'Paid ads' },
            { id: 'ctx-social', name: 'Social' },
          ],
        }),
        dataMart
      )
    ).toEqual({
      summary: 'Shares context: Paid ads',
      next: { verb: 'maintain', hint: 'Change their project role to Data Owner' },
    });
  });

  it('also asks for maintenance sharing when the Data Mart is not shared for it', () => {
    expect(explainMemberAccess(member(), { ...dataMart, availableForMaintenance: false })).toEqual({
      summary: 'Shares context: Paid ads',
      next: {
        verb: 'maintain',
        hint: 'Change their project role to Data Owner, then turn on Shared for maintenance or add them as Data Owner in Ownership',
      },
    });
  });

  it('asks a Data Owner for maintenance sharing, then for ownership to manage access', () => {
    expect(
      explainMemberAccess(
        member({
          role: 'editor',
          roleScope: 'entire_project',
          use: yes('PROJECT_WIDE_ACCESS'),
          maintain: no('NOT_SHARED'),
          manageAccess: no('OWNER_REQUIRED'),
        }),
        dataMart
      )
    ).toEqual({
      summary: 'Has access to the entire project',
      next: {
        verb: 'maintain',
        hint: 'Turn on Shared for maintenance, or add them as Data Owner in Ownership',
      },
    });
    expect(
      explainMemberAccess(
        member({
          role: 'editor',
          roleScope: 'entire_project',
          use: yes('PROJECT_WIDE_ACCESS'),
          maintain: yes('PROJECT_WIDE_ACCESS'),
          manageAccess: no('OWNER_REQUIRED'),
        }),
        dataMart
      )
    ).toEqual({
      summary: 'Shared for maintenance, with access to the entire project',
      next: { verb: 'manage access', hint: 'Add them as Data Owner in Ownership' },
    });
  });

  it('describes full access without a next step', () => {
    expect(
      explainMemberAccess(
        member({
          role: 'admin',
          use: yes('PROJECT_ADMIN'),
          maintain: yes('PROJECT_ADMIN'),
          manageAccess: yes('PROJECT_ADMIN'),
        }),
        dataMart
      )
    ).toEqual({ summary: 'Project Admins have full access' });
    expect(
      explainMemberAccess(
        member({
          role: 'editor',
          use: yes('OWNER'),
          maintain: yes('OWNER'),
          manageAccess: yes('OWNER'),
        }),
        dataMart
      )
    ).toEqual({ summary: 'Data Owner of this Data Mart' });
  });

  it('asks for Shared for reporting when a Business User cannot use the Data Mart', () => {
    expect(
      explainMemberAccess(
        member({ use: no('NOT_SHARED'), maintain: no('ROLE_REQUIRED') }),
        dataMart
      )
    ).toEqual({
      summary: 'Not shared for reporting',
      next: {
        verb: 'use',
        hint: 'Turn on Shared for reporting, or add them as an owner in Ownership',
      },
    });
  });

  it('says the Data Mart has no context and which of the member’s contexts to add', () => {
    expect(
      explainMemberAccess(member({ use: no('DATA_MART_HAS_NO_CONTEXT') }), {
        ...dataMart,
        contexts: [],
      })
    ).toEqual({
      summary: 'Sees only their contexts (Paid ads), and this Data Mart has none',
      next: { verb: 'use', hint: 'Add one of their contexts to this Data Mart' },
    });
  });

  it('lists both sides when the contexts do not meet', () => {
    expect(
      explainMemberAccess(
        member({
          contexts: [{ id: 'ctx-social', name: 'Social' }],
          use: no('NO_SHARED_CONTEXT'),
        }),
        dataMart
      )
    ).toEqual({
      summary: 'Sees only their contexts (Social), and none of them is on this Data Mart',
      next: {
        verb: 'use',
        hint: 'Add one of them to this Data Mart, or assign the member to Paid ads, SEO',
      },
    });
  });
});

describe('sortMembersForAccess', () => {
  it('puts members with the least access first, then sorts by name', () => {
    const sorted = sortMembersForAccess([
      member({ userId: 'admin', displayName: 'Ada', ...allGranted() }),
      member({ userId: 'b', displayName: 'Bea' }),
      member({ userId: 'z', displayName: 'Zoe', use: no('NOT_SHARED') }),
      member({ userId: 'a', displayName: undefined, email: 'al@example.com' }),
      member({ userId: 'c', displayName: 'Cy', use: no('NO_SHARED_CONTEXT') }),
    ]);

    expect(sorted.map(m => m.userId)).toEqual(['c', 'z', 'a', 'b', 'admin']);
  });
});

describe('counts', () => {
  it('counts members kept from using the Data Mart by one rule', () => {
    const members = [
      member({ use: no('NOT_SHARED') }),
      member({ use: no('NOT_SHARED') }),
      member({ use: no('DATA_MART_HAS_NO_CONTEXT') }),
      member({ use: yes('OWNER') }),
    ];

    expect(countMembersWhoCannotUse(members, 'NOT_SHARED')).toBe(2);
    expect(countMembersWhoCannotUse(null, 'NOT_SHARED')).toBe(0);
  });

  it('formats one and many members', () => {
    expect(formatMemberCount(1)).toBe('1 member');
    expect(formatMemberCount(3)).toBe('3 members');
  });
});

function allGranted() {
  return {
    role: 'admin',
    use: yes('PROJECT_ADMIN'),
    maintain: yes('PROJECT_ADMIN'),
    manageAccess: yes('PROJECT_ADMIN'),
  };
}
