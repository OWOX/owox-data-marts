jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { Report } from '../entities/report.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { AccessDecisionService, EntityType, Action } from './access-decision';
import { BlendableSchemaService } from './blendable-schema.service';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ReportRunAccessValidatorService, RunContext } from './report-run-access-validator.service';
import { ProjectMemberDto } from '../../idp/dto/domain/project-member.dto';

const PROJECT_ID = 'proj-1';
const USER_ID = 'user-1';
const DM_ID = 'dm-1';
const DEST_ID = 'dest-1';

function buildReport(overrides: Partial<Report> = {}): Report {
  const report = new Report();
  report.id = 'report-1';
  report.createdById = USER_ID;
  report.dataMart = { id: DM_ID, projectId: PROJECT_ID, title: 'My DM' } as DataMart;
  report.dataDestination = { id: DEST_ID } as DataDestination;
  report.columnConfig = [];
  return Object.assign(report, overrides);
}

function buildMember(): ProjectMemberDto {
  return new ProjectMemberDto(
    USER_ID,
    'user@example.com',
    'User',
    undefined,
    'editor',
    false,
    false
  );
}

describe('ReportRunAccessValidatorService', () => {
  let idpFacade: jest.Mocked<IdpProjectionsFacade>;
  let accessDecisionService: jest.Mocked<AccessDecisionService>;
  let blendableSchemaService: jest.Mocked<BlendableSchemaService>;
  let service: ReportRunAccessValidatorService;

  beforeEach(() => {
    idpFacade = {
      getProjectMember: jest.fn(),
    } as unknown as jest.Mocked<IdpProjectionsFacade>;

    accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AccessDecisionService>;

    blendableSchemaService = {
      findInaccessibleReportRefs: jest
        .fn()
        .mockResolvedValue({ columns: [], filters: [], sorts: [] }),
    } as unknown as jest.Mocked<BlendableSchemaService>;

    service = new ReportRunAccessValidatorService(
      idpFacade,
      accessDecisionService,
      blendableSchemaService
    );
  });

  const contexts: RunContext[] = ['Scheduled run', 'Looker Studio request', 'Manual run'];

  describe.each(contexts)('context: %s', context => {
    it('passes when member is active, has DM access, dest access, and no orphans', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, context)
      ).resolves.toBeUndefined();
    });

    it('throws when user is not found in project', async () => {
      idpFacade.getProjectMember.mockResolvedValue(undefined);

      await expect(service.validate(buildReport(), USER_ID, PROJECT_ID, context)).rejects.toThrow(
        BusinessViolationException
      );

      const call = idpFacade.getProjectMember.mock.calls[0];
      expect(call[0]).toBe(PROJECT_ID);
      expect(call[1]).toBe(USER_ID);
    });

    it('throws when user is outbound', async () => {
      idpFacade.getProjectMember.mockResolvedValue(
        new ProjectMemberDto(USER_ID, 'u@e.com', 'U', undefined, 'editor', false, true)
      );

      await expect(service.validate(buildReport(), USER_ID, PROJECT_ID, context)).rejects.toThrow(
        BusinessViolationException
      );
    });

    it('throws when user has no SEE access to DM', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      accessDecisionService.canAccess.mockImplementation((_u, _r, entity, _id, action) =>
        Promise.resolve(!(entity === EntityType.DATA_MART && action === Action.SEE))
      );

      await expect(service.validate(buildReport(), USER_ID, PROJECT_ID, context)).rejects.toThrow(
        BusinessViolationException
      );
    });

    it('throws when user has no USE access to destination', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      accessDecisionService.canAccess.mockImplementation((_u, _r, entity, _id, action) =>
        Promise.resolve(!(entity === EntityType.DESTINATION && action === Action.USE))
      );

      await expect(service.validate(buildReport(), USER_ID, PROJECT_ID, context)).rejects.toThrow(
        BusinessViolationException
      );
    });

    it('skips destination check when report has no dataDestination', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      const report = buildReport({ dataDestination: null as unknown as DataDestination });

      await expect(service.validate(report, USER_ID, PROJECT_ID, context)).resolves.toBeUndefined();
      expect(accessDecisionService.canAccess).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        EntityType.DESTINATION,
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('throws when orphan columns exist', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      const report = buildReport({
        columnConfig: ['dm2__field_a', 'dm2__field_b'],
      });
      blendableSchemaService.findInaccessibleReportRefs.mockResolvedValue({
        columns: ['dm2__field_a', 'dm2__field_b'],
        filters: [],
        sorts: [],
      });

      await expect(service.validate(report, USER_ID, PROJECT_ID, context)).rejects.toThrow(
        BusinessViolationException
      );
    });

    it('skips orphan check when columnConfig, filterConfig, and sortConfig are empty', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      const report = buildReport({ columnConfig: [] });

      await expect(service.validate(report, USER_ID, PROJECT_ID, context)).resolves.toBeUndefined();
      expect(blendableSchemaService.findInaccessibleReportRefs).not.toHaveBeenCalled();
    });
  });

  describe('error message content', () => {
    it('uses "schedule creator" actor for Scheduled run membership error', async () => {
      idpFacade.getProjectMember.mockResolvedValue(undefined);

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, 'Scheduled run')
      ).rejects.toThrow(
        'Scheduled run blocked: schedule creator is no longer a member of this project. Reassign the schedule to continue.'
      );
    });

    it('uses "report creator" actor for Looker Studio request membership error', async () => {
      idpFacade.getProjectMember.mockResolvedValue(undefined);

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, 'Looker Studio request')
      ).rejects.toThrow(
        'Looker Studio request blocked: report creator is no longer a member of this project. Recreate the report with an active owner.'
      );
    });

    it('uses "you" actor for Manual run membership error', async () => {
      idpFacade.getProjectMember.mockResolvedValue(undefined);

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, 'Manual run')
      ).rejects.toThrow(
        'Manual run blocked: you are no longer a member of this project. Sign in with an account that has access.'
      );
    });

    it('uses "schedule creator" actor for Scheduled run DM access error', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, 'Scheduled run')
      ).rejects.toThrow(
        'Scheduled run blocked: schedule creator no longer has access to DataMart "My DM".'
      );
    });

    it('uses "report creator" actor for Looker Studio request DM access error', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, 'Looker Studio request')
      ).rejects.toThrow(
        'Looker Studio request blocked: report creator no longer has access to DataMart "My DM".'
      );
    });

    it('includes orphan column names and "schedule creator" actor for Scheduled run', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      const report = buildReport({ columnConfig: ['x__col'] });
      blendableSchemaService.findInaccessibleReportRefs.mockResolvedValue({
        columns: ['x__col'],
        filters: [],
        sorts: [],
      });

      await expect(service.validate(report, USER_ID, PROJECT_ID, 'Scheduled run')).rejects.toThrow(
        'Scheduled run blocked: columns x__col reference DataMarts no longer accessible to schedule creator.'
      );
    });

    it('includes orphan column names and "report creator" actor for Looker Studio request', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      const report = buildReport({ columnConfig: ['x__col'] });
      blendableSchemaService.findInaccessibleReportRefs.mockResolvedValue({
        columns: ['x__col'],
        filters: [],
        sorts: [],
      });

      await expect(
        service.validate(report, USER_ID, PROJECT_ID, 'Looker Studio request')
      ).rejects.toThrow(
        'Looker Studio request blocked: columns x__col reference DataMarts no longer accessible to report creator.'
      );
    });

    it('uses "you" actor for Manual run DM access error', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, 'Manual run')
      ).rejects.toThrow('Manual run blocked: you no longer have access to DataMart "My DM".');
    });

    it('uses "you" actor for Manual run destination USE error', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      accessDecisionService.canAccess.mockImplementation((_u, _r, entity, _id, action) =>
        Promise.resolve(!(entity === EntityType.DESTINATION && action === Action.USE))
      );

      await expect(
        service.validate(buildReport(), USER_ID, PROJECT_ID, 'Manual run')
      ).rejects.toThrow(
        'Manual run blocked: you no longer have access to the destination configured for this report.'
      );
    });

    it('includes orphan column names and "you" actor for Manual run', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      const report = buildReport({ columnConfig: ['x__col'] });
      blendableSchemaService.findInaccessibleReportRefs.mockResolvedValue({
        columns: ['x__col'],
        filters: [],
        sorts: [],
      });

      await expect(service.validate(report, USER_ID, PROJECT_ID, 'Manual run')).rejects.toThrow(
        'Manual run blocked: columns x__col reference DataMarts no longer accessible to you.'
      );
    });

    it('includes filter and sort orphans with granular labels for Scheduled run', async () => {
      idpFacade.getProjectMember.mockResolvedValue(buildMember());
      const report = buildReport({ columnConfig: ['x__col'] });
      blendableSchemaService.findInaccessibleReportRefs.mockResolvedValue({
        columns: [],
        filters: ['y__filter_col'],
        sorts: ['z__sort_col'],
      });

      await expect(service.validate(report, USER_ID, PROJECT_ID, 'Scheduled run')).rejects.toThrow(
        'Scheduled run blocked: filters y__filter_col; sorts z__sort_col reference DataMarts no longer accessible to schedule creator.'
      );
    });
  });
});
