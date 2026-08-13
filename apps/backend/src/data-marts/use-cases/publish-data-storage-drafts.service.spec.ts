import { ForbiddenException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
import { DataMartValidationCode } from '../data-storage-types/interfaces/data-mart-validator.interface';
import { PUBLISH_DATA_MART_ERRORS, PublishForbiddenException } from './publish-data-mart.service';
import { PublishDataStorageDraftsService } from './publish-data-storage-drafts.service';

describe('PublishDataStorageDraftsService', () => {
  const createService = () => {
    const dataStorageService = {
      getByProjectIdAndId: jest.fn().mockResolvedValue({ id: 'storage-1' }),
    };
    const dataMartService = {
      findDraftIdsByStorage: jest.fn().mockResolvedValue(['dm-1']),
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
      validateDataStorageAccessService,
      publishDataMartService,
      schemaActualizeTriggerService,
      idpProjectionsFacade,
    };
  };

  // The storage check can fail with raw text from credential resolution or a
  // warehouse driver; only results carrying a code hold text we authored.
  it('genericizes a storage validation failure that has no code', async () => {
    const { service, validateDataStorageAccessService, dataMartService } = createService();
    validateDataStorageAccessService.run.mockResolvedValue({
      valid: false,
      errorMessage:
        'getaddrinfo ENOTFOUND acme-prod-1234.warehouse.internal; secret_key=AKIA123 rejected',
    });

    const error: unknown = await service
      .run(new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1'))
      .catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      'Could not access this Storage. Check its connection settings and try again.'
    );
    expect((error as Error).message).not.toContain('acme-prod-1234');
    expect((error as Error).message).not.toContain('AKIA123');
    expect(dataMartService.findDraftIdsByStorage).not.toHaveBeenCalled();
  });

  it('keeps a coded storage validation message, which this codebase authored', async () => {
    const { service, validateDataStorageAccessService } = createService();
    validateDataStorageAccessService.run.mockResolvedValue({
      valid: false,
      code: 'UNCONFIGURED',
      errorMessage: 'Complete setup to activate Storage',
    });

    const error: unknown = await service
      .run(new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1'))
      .catch((e: unknown) => e);

    expect((error as Error).message).toBe('Complete setup to activate Storage');
  });

  it('skips the remote role lookup when the storage has no drafts', async () => {
    const { service, dataMartService, idpProjectionsFacade } = createService();
    dataMartService.findDraftIdsByStorage.mockResolvedValue([]);

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

  it('refuses to publish when the trigger carries no userId', async () => {
    const { service, publishDataMartService, idpProjectionsFacade } = createService();

    // An empty userId would make PublishDataMartService skip its access check.
    await expect(
      service.run(new PublishDataStorageDraftsCommand('storage-1', 'project-1', ''))
    ).rejects.toThrow('Could not determine your project permissions');

    expect(idpProjectionsFacade.getProjectForUser).not.toHaveBeenCalled();
    expect(publishDataMartService.run).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'identity blocked'],
    [404, 'user removed from the project'],
  ])('does not tell the user to retry a definitive %s from Identity', async (status, _why) => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectForUser.mockRejectedValue(
      Object.assign(new Error('Upstream resource not found'), { status })
    );

    const error: unknown = await service
      .run(new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1'))
      .catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      'Could not determine your project permissions. No Data Mart drafts were published.'
    );
    expect((error as Error).message).not.toContain('try again');
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
    expect(result.failureReasons).toEqual([]);
  });

  it('counts a draft as failed (without throwing) and reports the reason', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new BusinessViolationException(
        PUBLISH_DATA_MART_ERRORS.NO_DEFINITION.message,
        undefined,
        PUBLISH_DATA_MART_ERRORS.NO_DEFINITION.code
      )
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.failureReasons).toEqual([PUBLISH_DATA_MART_ERRORS.NO_DEFINITION.message]);
  });

  it('reports the permission error verbatim (thrown as a Nest ForbiddenException)', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new PublishForbiddenException(
        PUBLISH_DATA_MART_ERRORS.NO_PERMISSION.message,
        PUBLISH_DATA_MART_ERRORS.NO_PERMISSION.code
      )
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.failureReasons).toEqual([PUBLISH_DATA_MART_ERRORS.NO_PERMISSION.message]);
  });

  // 8: an authored validator message now reaches the user instead of being
  // downgraded, because the facade tags it with a DataMartValidationCode.
  it('surfaces an authored validator message that carries a code', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new BusinessViolationException(
        'Invalid identifier format. Expected: project.dataset.table',
        undefined,
        DataMartValidationCode.INVALID_IDENTIFIER_FORMAT
      )
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.failureReasons).toEqual([
      'Invalid identifier format. Expected: project.dataset.table',
    ]);
  });

  // 7: the guarantee is now structural — the same exception type carrying raw
  // warehouse text has no code, so it is replaced rather than trusted.
  it('genericizes a BusinessViolationException that carries no code', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new BusinessViolationException(
        'Syntax error at [1:8] in SELECT * FROM `acme-prod-1234.finance.salaries`'
      )
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.failureReasons).toEqual([
      'Publishing failed. Open the Data Mart to see details.',
    ]);
    expect(JSON.stringify(result)).not.toContain('acme-prod-1234');
  });

  it('genericizes an unrecognized code, not just a missing one', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new BusinessViolationException('Some other subsystem failed', undefined, 'SOME_OTHER_CODE')
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.failureReasons).toEqual([
      'Publishing failed. Open the Data Mart to see details.',
    ]);
  });

  it('does not trust a bare ForbiddenException that merely repeats the wording', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(
      new ForbiddenException(PUBLISH_DATA_MART_ERRORS.NO_PERMISSION.message)
    );

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.failureReasons).toEqual([
      'Publishing failed. Open the Data Mart to see details.',
    ]);
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
    expect(result.failureReasons).toEqual([
      'Publishing failed. Open the Data Mart to see details.',
    ]);
    expect(JSON.stringify(result)).not.toContain('acme-prod-1234');
    expect(JSON.stringify(result)).not.toContain('gserviceaccount');
  });

  // The trigger only requires EDIT on the storage, but the batch covers every
  // draft in it. A publisher may therefore hit Data Marts they cannot see, and
  // the result must not disclose which ones they were.
  it('discloses no Data Mart identifiers for drafts the publisher cannot see', async () => {
    const { service, dataMartService, publishDataMartService } = createService();
    dataMartService.findDraftIdsByStorage.mockResolvedValue([
      'visible-dm',
      'hidden-dm-8f3a1c02',
      'hidden-dm-b71e94dd',
    ]);
    publishDataMartService.run.mockImplementation((command: { id: string }) => {
      if (command.id === 'visible-dm') return Promise.resolve(undefined);
      // Access-gated Data Marts fail the per-draft EDIT check.
      return Promise.reject(
        new PublishForbiddenException(
          PUBLISH_DATA_MART_ERRORS.NO_PERMISSION.message,
          PUBLISH_DATA_MART_ERRORS.NO_PERMISSION.code
        )
      );
    });

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(2);

    // Reasons are deduplicated, so the count of hidden Data Marts is not
    // inferable from the list either.
    expect(result.failureReasons).toEqual([PUBLISH_DATA_MART_ERRORS.NO_PERMISSION.message]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('hidden-dm-8f3a1c02');
    expect(serialized).not.toContain('hidden-dm-b71e94dd');
    expect(serialized).not.toContain('visible-dm');
  });
});
