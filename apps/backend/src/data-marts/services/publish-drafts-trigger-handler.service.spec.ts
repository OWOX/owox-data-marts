import { NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { PublishDataStorageDraftsResultDto } from '../dto/domain/publish-data-storage-drafts-result.dto';
import { PUBLISH_DRAFTS_ERRORS } from '../use-cases/publish-data-storage-drafts.service';
import { PublishDraftsTriggerHandlerService } from './publish-drafts-trigger-handler.service';

describe('PublishDraftsTriggerHandlerService', () => {
  const createHandler = () => {
    const repository = { save: jest.fn().mockResolvedValue(undefined) };
    const schedulerFacade = { registerTriggerHandler: jest.fn() };
    const publishDraftsService = {
      run: jest.fn().mockResolvedValue(new PublishDataStorageDraftsResultDto(1, 0)),
    };
    const dataStorageMapper = {
      toPublishDraftsResponse: jest.fn((result: PublishDataStorageDraftsResultDto) => ({
        successCount: result.successCount,
        failedCount: result.failedCount,
        failureReasons: result.failureReasons,
      })),
    };

    const handler = new PublishDraftsTriggerHandlerService(
      repository as never,
      schedulerFacade as never,
      publishDraftsService as never,
      dataStorageMapper as never
    );

    const trigger = {
      id: 'trigger-1',
      dataStorageId: 'storage-1',
      projectId: 'project-1',
      userId: 'user-1',
      uiResponse: undefined as unknown,
      onSuccess: jest.fn(),
      onError: jest.fn(),
    };

    return { handler, trigger, publishDraftsService, dataStorageMapper };
  };

  it('maps a successful run through the mapper', async () => {
    const { handler, trigger, dataStorageMapper } = createHandler();

    await handler.handleTrigger(trigger as never);

    expect(dataStorageMapper.toPublishDraftsResponse).toHaveBeenCalled();
    expect(trigger.onSuccess).toHaveBeenCalled();
    expect(trigger.uiResponse).toMatchObject({ successCount: 1, failedCount: 0 });
  });

  it('surfaces a business violation message, which the use case authors itself', async () => {
    const { handler, trigger, publishDraftsService } = createHandler();
    publishDraftsService.run.mockRejectedValue(
      new BusinessViolationException(
        PUBLISH_DRAFTS_ERRORS.UNRESOLVED_ROLES.message,
        undefined,
        PUBLISH_DRAFTS_ERRORS.UNRESOLVED_ROLES.code
      )
    );

    await handler.handleTrigger(trigger as never);

    expect(trigger.onError).toHaveBeenCalled();
    expect(trigger.uiResponse).toMatchObject({
      error: PUBLISH_DRAFTS_ERRORS.UNRESOLVED_ROLES.message,
    });
  });

  // This response is readable by any project viewer, so infrastructure errors
  // must not put their message on it.
  it('maps a deleted storage to a permanent, id-free message', async () => {
    const { handler, trigger, publishDraftsService } = createHandler();
    publishDraftsService.run.mockRejectedValue(
      new NotFoundException(
        'DataStorage with id 8f3a1c02 and projectId acme-prod-1234 not found in schema owox_internal'
      )
    );

    await handler.handleTrigger(trigger as never);

    // A deleted storage is permanent, so it must not be labelled retryable —
    // and its own message embeds ids, so a fixed string is used instead.
    expect(trigger.uiResponse).toMatchObject({
      successCount: 0,
      failedCount: 0,
      error: 'This Storage no longer exists. No Data Mart drafts were published.',
    });
    const serialized = JSON.stringify(trigger.uiResponse);
    expect(serialized).not.toContain('acme-prod-1234');
    expect(serialized).not.toContain('owox_internal');
  });

  it('replaces an unrecognized infrastructure error with a generic message', async () => {
    const { handler, trigger, publishDraftsService } = createHandler();
    publishDraftsService.run.mockRejectedValue(
      new Error('QueryFailedError: connection terminated (host=db.acme-prod-1234.internal)')
    );

    await handler.handleTrigger(trigger as never);

    expect(trigger.uiResponse).toMatchObject({
      error: 'Publishing Data Mart drafts failed. Please try again.',
    });
    expect(JSON.stringify(trigger.uiResponse)).not.toContain('acme-prod-1234');
  });

  // A code only proves some thrower opted in — not that this path authored the
  // wording. An unrelated coded exception must still be replaced.
  it('genericizes a coded exception whose code is not one this trigger raises', async () => {
    const { handler, trigger, publishDraftsService } = createHandler();
    publishDraftsService.run.mockRejectedValue(
      new BusinessViolationException(
        'Dry run failed: SELECT * FROM `acme-prod-1234.finance.salaries`',
        undefined,
        'SOME_OTHER_SUBSYSTEM_CODE'
      )
    );

    await handler.handleTrigger(trigger as never);

    expect(trigger.uiResponse).toMatchObject({
      error: 'Publishing Data Mart drafts failed. Please try again.',
    });
    expect(JSON.stringify(trigger.uiResponse)).not.toContain('acme-prod-1234');
  });
});
