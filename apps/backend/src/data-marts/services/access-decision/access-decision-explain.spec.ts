jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { AccessDecisionService } from './access-decision.service';
import {
  Action,
  DataMartAccessReason,
  EntityType,
  OwnerStatus,
  type DataMartAccessFacts,
} from './access-decision.types';
import { ContextAccessService } from '../context/context-access.service';
import { RoleScope } from '../../enums/role-scope.enum';

/**
 * explainDataMartAccess must answer exactly as canAccess does — it backs the member access list
 * on the Data Mart page, which is only useful if it matches what the product enforces.
 */
describe('AccessDecisionService.explainDataMartAccess', () => {
  const contextCases = {
    shared: { dataMartContextIds: ['ctx-a', 'ctx-b'], memberContextIds: ['ctx-b'] },
    disjoint: { dataMartContextIds: ['ctx-a'], memberContextIds: ['ctx-c'] },
    dataMartHasNone: { dataMartContextIds: [], memberContextIds: ['ctx-c'] },
    memberHasNone: { dataMartContextIds: ['ctx-a'], memberContextIds: [] },
  };
  const dataMartActions = [
    Action.SEE,
    Action.USE,
    Action.EDIT,
    Action.DELETE,
    Action.MANAGE_TRIGGERS,
    Action.CONFIGURE_SHARING,
    Action.MANAGE_OWNERS,
  ];

  function createService(facts?: DataMartAccessFacts) {
    const sharesContext = facts
      ? facts.memberContextIds.some(id => facts.dataMartContextIds.includes(id))
      : false;
    const contextAccessService = {
      getRoleScope: jest.fn().mockResolvedValue(facts?.roleScope),
      hasContextOverlap: jest.fn().mockResolvedValue(sharesContext),
    };
    const dataMartRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'dm-1',
        availableForReporting: facts?.availableForReporting,
        availableForMaintenance: facts?.availableForMaintenance,
      }),
    };
    const technicalOwnerRepository = {
      count: jest.fn().mockResolvedValue(facts?.ownerStatus === OwnerStatus.TECH_OWNER ? 1 : 0),
    };
    const businessOwnerRepository = {
      count: jest.fn().mockResolvedValue(facts?.ownerStatus === OwnerStatus.BIZ_OWNER ? 1 : 0),
    };
    const unused = {} as never;

    const service = new AccessDecisionService(
      dataMartRepository as never,
      unused,
      unused,
      technicalOwnerRepository as never,
      businessOwnerRepository as never,
      unused,
      unused,
      unused,
      unused,
      contextAccessService as unknown as ContextAccessService
    );
    // canAccess logs every denial at debug level; thousands of them would bury the test output.
    jest
      .spyOn((service as unknown as { logger: { debug: () => void } }).logger, 'debug')
      .mockImplementation(() => undefined);
    return service;
  }

  function* everyCase(): Generator<[string, DataMartAccessFacts]> {
    for (const role of ['admin', 'editor', 'viewer']) {
      for (const ownerStatus of [
        OwnerStatus.TECH_OWNER,
        OwnerStatus.BIZ_OWNER,
        OwnerStatus.NON_OWNER,
      ]) {
        for (const availableForReporting of [true, false]) {
          for (const availableForMaintenance of [true, false]) {
            for (const roleScope of [RoleScope.ENTIRE_PROJECT, RoleScope.SELECTED_CONTEXTS]) {
              for (const [contextCase, contexts] of Object.entries(contextCases)) {
                yield [
                  `${role}/${ownerStatus}/reporting=${String(availableForReporting)}/maintenance=${String(availableForMaintenance)}/${roleScope}/${contextCase}`,
                  {
                    roles: [role],
                    ownerStatus,
                    availableForReporting,
                    availableForMaintenance,
                    roleScope,
                    ...contexts,
                  },
                ];
              }
            }
          }
        }
      }
    }
  }

  it('agrees with canAccess for every action, role, ownership, sharing, scope and context case', async () => {
    const mismatches: string[] = [];

    for (const [label, facts] of everyCase()) {
      const service = createService(facts);
      for (const action of dataMartActions) {
        const expected = await service.canAccess(
          'user-1',
          facts.roles,
          EntityType.DATA_MART,
          'dm-1',
          action,
          'project-1'
        );
        const { granted } = service.explainDataMartAccess(facts, action);
        if (granted !== expected) {
          mismatches.push(`${label}/${action}: canAccess=${expected}, explain=${granted}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  // The member access list reports three groups of actions, one decision each. A matrix change
  // that splits a group must fail here before the list starts to misreport.
  it('grants the actions of each group together', () => {
    const service = createService();
    const groups = [
      [Action.SEE, Action.USE],
      [Action.EDIT, Action.DELETE, Action.MANAGE_TRIGGERS],
      [Action.CONFIGURE_SHARING, Action.MANAGE_OWNERS],
    ];
    const splits: string[] = [];

    for (const [label, facts] of everyCase()) {
      for (const group of groups) {
        const answers = group.map(action => service.explainDataMartAccess(facts, action).granted);
        if (new Set(answers).size > 1) {
          splits.push(`${label}: ${group.join('/')} = ${answers.join('/')}`);
        }
      }
    }

    expect(splits).toEqual([]);
  });

  describe('reason', () => {
    const service = createService();
    const base: DataMartAccessFacts = {
      roles: ['viewer'],
      ownerStatus: OwnerStatus.NON_OWNER,
      availableForReporting: true,
      availableForMaintenance: false,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      ...contextCases.shared,
    };

    it('names Project Admin before anything else', () => {
      expect(
        service.explainDataMartAccess(
          { ...base, roles: ['admin'], availableForReporting: false, ...contextCases.disjoint },
          Action.CONFIGURE_SHARING
        )
      ).toEqual({ granted: true, reason: DataMartAccessReason.PROJECT_ADMIN });
    });

    it('names ownership, which bypasses sharing and contexts', () => {
      expect(
        service.explainDataMartAccess(
          {
            ...base,
            ownerStatus: OwnerStatus.BIZ_OWNER,
            availableForReporting: false,
            ...contextCases.disjoint,
          },
          Action.SEE
        )
      ).toEqual({ granted: true, reason: DataMartAccessReason.OWNER });
    });

    it('names missing sharing before contexts', () => {
      expect(
        service.explainDataMartAccess(
          {
            ...base,
            availableForReporting: false,
            availableForMaintenance: true,
            ...contextCases.disjoint,
          },
          Action.SEE
        )
      ).toEqual({ granted: false, reason: DataMartAccessReason.NOT_SHARED });
    });

    it('lets a Data Owner see a Data Mart shared for maintenance only', () => {
      expect(
        service.explainDataMartAccess(
          {
            ...base,
            roles: ['editor'],
            availableForReporting: false,
            availableForMaintenance: true,
            roleScope: RoleScope.ENTIRE_PROJECT,
          },
          Action.SEE
        )
      ).toEqual({ granted: true, reason: DataMartAccessReason.PROJECT_WIDE_ACCESS });
    });

    it('names a shared context', () => {
      expect(service.explainDataMartAccess(base, Action.SEE)).toEqual({
        granted: true,
        reason: DataMartAccessReason.SHARED_CONTEXT,
      });
    });

    it('tells a Data Mart without contexts apart from contexts that do not match', () => {
      expect(
        service.explainDataMartAccess({ ...base, ...contextCases.dataMartHasNone }, Action.SEE)
      ).toEqual({ granted: false, reason: DataMartAccessReason.DATA_MART_HAS_NO_CONTEXT });
      expect(
        service.explainDataMartAccess({ ...base, ...contextCases.disjoint }, Action.SEE)
      ).toEqual({ granted: false, reason: DataMartAccessReason.NO_SHARED_CONTEXT });
      expect(
        service.explainDataMartAccess({ ...base, ...contextCases.memberHasNone }, Action.SEE)
      ).toEqual({ granted: false, reason: DataMartAccessReason.NO_SHARED_CONTEXT });
    });

    it('asks a Data Owner for Shared for maintenance to maintain the Data Mart', () => {
      expect(service.explainDataMartAccess({ ...base, roles: ['editor'] }, Action.EDIT)).toEqual({
        granted: false,
        reason: DataMartAccessReason.NOT_SHARED,
      });
    });

    it('asks a Business User for another role to maintain the Data Mart, whatever the sharing', () => {
      expect(
        service.explainDataMartAccess(
          { ...base, availableForMaintenance: true, ownerStatus: OwnerStatus.TECH_OWNER },
          Action.EDIT
        )
      ).toEqual({ granted: false, reason: DataMartAccessReason.ROLE_REQUIRED });
    });

    it('asks a Data Owner to own the Data Mart to manage its access', () => {
      expect(
        service.explainDataMartAccess(
          { ...base, roles: ['editor'], availableForMaintenance: true },
          Action.CONFIGURE_SHARING
        )
      ).toEqual({ granted: false, reason: DataMartAccessReason.OWNER_REQUIRED });
      expect(
        service.explainDataMartAccess(
          { ...base, roles: ['editor'], ownerStatus: OwnerStatus.TECH_OWNER },
          Action.CONFIGURE_SHARING
        )
      ).toEqual({ granted: true, reason: DataMartAccessReason.OWNER });
    });

    it('asks a Business User for another role to manage access, even as an owner', () => {
      expect(
        service.explainDataMartAccess(
          { ...base, ownerStatus: OwnerStatus.TECH_OWNER },
          Action.CONFIGURE_SHARING
        )
      ).toEqual({ granted: false, reason: DataMartAccessReason.ROLE_REQUIRED });
    });
  });
});
