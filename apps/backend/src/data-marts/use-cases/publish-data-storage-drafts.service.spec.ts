import { ForbiddenException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
import { PUBLISH_DATA_MART_ERRORS } from './publish-data-mart.service';
import { PublishDataStorageDraftsService } from './publish-data-storage-drafts.service';

describe('PublishDataStorageDraftsService', () => {
  const createService = () => {
    const dataStorageService = {
      getByProjectIdAndId: jest.fn().mockResolvedValue({ id: 'storage-1' }),
    };
    const dataMartService = {
      findDraftsByStorage: jest.fn().mockResolvedValue([{ id: 'dm-1', title: 'My Draft' }]),
    };
    const publishDataMartService = {
      run: jest.fn().mockResolvedValue(undefined),
    };
    const schemaActualizeTriggerService = {
      createTrigger: jest.fn().mockResolvedValue(undefined),
    };
    const validateDataStorageAccessService = {
      run: jest.fn().mockResolvedValue({ valid: true }),
    };
    const idpProjectionsFacade = {
      getProjectForUser: jest.fn().mockResolvedValue({ roles: ['editor'] }),
    };

    const service = new PublishDataStorageDraftsService(
      dataStorageService as never,
      dataMartService as never,
      publishDataMartService as never,
      schemaActualizeTriggerService as never,
      validateDataStorageAccessService as never,
      idpProjectionsFacade as never
    );

    return {
      service,
      dataMartService,
      publishDataMartService,
      schemaActualizeTriggerService,
      idpProjectionsFacade,
    };
  };

  it('skips the remote role lookup when the storage has no drafts', async () => {
    const { service, dataMartService, idpProjectionsFacade } = createService();
    dataMartService.findDraftsByStorage.mockResolvedValue([]);

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(idpProjectionsFacade.getProjectForUser).not.toHaveBeenCalled();
    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('reports a safe message when the role lookup itself fails', async () => {
    const { service, publishDataMartService, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectForUser.mockRejectedValue(
      new Error('connect ETIMEDOUT identity.internal.acme-prod-1234:8443')
    );

    const error: unknown = await service
      .run(new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1'))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BusinessViolationException);
    expect((error as Error).message).toBe(
      'Could not verify your project permissions. No Data Mart drafts were published. Please try again.'
    );
    expect(publishDataMartService.run).not.toHaveBeenCalled();
  });

  // Guards the regression this service was created to fix: an unresolved role
  // list must not degrade to [], which AccessDecisionService reads as VIEWER.
  it.each([
    ['roles omitted', {}],
    ['roles empty', { roles: [] }],
    ['roles null', { roles: null }],
  ])('refuses to publish when the IDP returns a project with %s', async (_case, project) => {
    const { service, publishDataMartService, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectForUser.mockResolvedValue(project);

    await expect(
      service.run(new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1'))
    ).rejects.toThrow('Could not determine your project permissions');

    expect(publishDataMartService.run).not.toHaveBeenCalled();
  });

  it("publishes each draft with the publisher's current roles instead of an empty array", async () => {
    const { service, publishDataMartService, idpProjectionsFacade } = createService();

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(idpProjectionsFacade.getProjectForUser).toHaveBeenCalledWith('user-1', 'project-1');
    expect(publishDataMartService.run).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['editor'] })
    );
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('still counts the draft as published when scheduling schema actualization fails', async () => {
    const { service, schemaActualizeTriggerService } = createService();
    schemaActualizeTriggerService.createTrigger.mockRejectedValue(new Error('scheduler down'));

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    // The Data Mart is already PUBLISHED at this point — reporting it as failed
    // would point the user at a DRAFT-filtered list it is no longer in.
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('counts a draft as failed (without throwing) and reports its id, title and reason', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new BusinessViolationException(PUBLISH_DATA_MART_ERRORS.NO_DEFINITION)
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.failures).toEqual([
      { dataMartId: 'dm-1', title: 'My Draft', error: PUBLISH_DATA_MART_ERRORS.NO_DEFINITION },
    ]);
  });

  it('reports the permission error verbatim (thrown as a Nest ForbiddenException)', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new ForbiddenException(PUBLISH_DATA_MART_ERRORS.NO_PERMISSION)
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.failures[0].error).toBe(PUBLISH_DATA_MART_ERRORS.NO_PERMISSION);
  });

  it('never leaks an unrecognized error message to the caller', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new BusinessViolationException(
        'Syntax error at [1:8] in SELECT * FROM `acme-prod-1234.finance.salaries`; ' +
          'caller sa-etl@acme-prod-1234.iam.gserviceaccount.com lacks bigquery.tables.get'
      )
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.failedCount).toBe(1);
    expect(result.failures[0].error).toBe('Publishing failed. Open the Data Mart to see details.');
    expect(JSON.stringify(result)).not.toContain('acme-prod-1234');
    expect(JSON.stringify(result)).not.toContain('gserviceaccount');
  });
});
