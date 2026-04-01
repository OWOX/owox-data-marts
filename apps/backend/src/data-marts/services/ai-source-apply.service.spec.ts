jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  ApplyAiAssistantActionPayload,
  ApplyAiAssistantSessionCommand,
} from '../dto/domain/apply-ai-assistant-session.command';
import { InsightTemplateSourceType } from '../dto/schemas/insight-template/insight-template-source.schema';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { AiAssistantActionAppliedEvent } from '../events/ai-assistant-action-applied.event';
import { AiAssistantApplyActionMapper } from '../mappers/ai-assistant-apply-action.mapper';
import { AiSourceApplyExecutionService } from './ai-source-apply-execution.service';
import { AiSourceApplyService } from './ai-source-apply.service';
import { AiAssistantSessionService } from './ai-assistant-session.service';
import { InsightArtifactService } from './insight-artifact.service';
import { InsightTemplateService } from './insight-template.service';

describe('AiSourceApplyService', () => {
  const createService = () => {
    const sessionRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const messageRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const applyActionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const sessionApplyActionRepository = {
      find: jest.fn(),
      delete: jest.fn(),
    };
    const runTriggerRepository = {
      delete: jest.fn(),
    };
    const artifactRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const insightTemplateSourceRepository = {
      findOne: jest.fn(),
    };
    const insightArtifactRepository = {
      listByDataMartIdAndProjectIdExcludingArtifactIds: jest.fn(),
    };
    const templateRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const insightTemplateValidationService = {
      validateSources: jest.fn(),
      validateTemplateText: jest.fn(),
    };
    const templateFullReplaceApplyService = {
      apply: jest.fn(),
    };
    const applyActionMapper = new AiAssistantApplyActionMapper();
    const producer = {
      produceEvent: jest.fn().mockResolvedValue(undefined),
    };
    let lastRequestedRequestId: string | null = null;

    const storedActionsByRequestId: Record<string, ApplyAiAssistantActionPayload> = {
      'request-1': {
        type: 'update_existing_source',
      },
      'request-intent-1': {
        type: 'update_existing_source',
      },
      'request-2': {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceKey: 'source_new',
        insertTag: true,
      },
      'request-reuse-1': {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceKey: 'consumption_2025',
        insertTag: true,
      },
      'request-reuse-update-1': {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceKey: 'consumption_2025',
        insertTag: true,
      },
      'request-attach-tag-1': {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceKey: 'consumption_2025',
        insertTag: true,
      },
      'request-conflict-1': {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceKey: 'consumption_2026',
      },
      'request-foreign-message-1': {
        type: 'update_existing_source',
      },
      'request-artifact-scope-1': {
        type: 'update_existing_source',
      },
      'request-refine-1': {
        type: 'update_existing_source',
        sourceKey: 'consumption_2025',
      },
      'request-remove-source-1': {
        type: 'remove_source_from_template',
        templateId: 'template-1',
        sourceKey: 'consumption_2025',
      },
      'request-attach-existing-1': {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceId: 'template-source-2026',
        sourceKey: 'consumption_2026',
        insertTag: true,
      },
      'request-5': {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceKey: 'source_conflict',
        insertTag: true,
      },
      'request-replace-template-1': {
        type: 'replace_template_document',
        text: '# Updated Report',
        tags: [],
      },
    };

    const createStoredAction = (
      requestId: string,
      selectedAction: ApplyAiAssistantActionPayload
    ) => ({
      id: `apply-${requestId}`,
      sessionId: 'session-1',
      requestId,
      createdById: 'user-1',
      response: {
        requestId,
        lifecycleStatus: 'created',
        artifactId: null,
        sourceTitle: null,
        templateUpdated: false,
        templateId: selectedAction.templateId ?? null,
        sourceKey: selectedAction.sourceKey ?? null,
        assistantMessageId: 'assistant-message-1',
        actionType: selectedAction.type,
        templateSourceId: null,
        insertTag: selectedAction.insertTag ?? null,
        selectedAction,
        reason: null,
      },
    });

    applyActionRepository.findOne.mockImplementation(
      async ({ where }: { where?: { requestId?: string } }) => {
        const requestId = where?.requestId;
        if (!requestId) {
          return null;
        }
        lastRequestedRequestId = requestId;

        const selectedAction = storedActionsByRequestId[requestId];
        if (!selectedAction) {
          return null;
        }

        return createStoredAction(requestId, selectedAction);
      }
    );

    const aiAssistantSessionService = new AiAssistantSessionService(
      sessionRepository as never,
      messageRepository as never,
      runTriggerRepository as never,
      sessionApplyActionRepository as never
    );
    const insightArtifactService = new InsightArtifactService(
      artifactRepository as never,
      insightTemplateSourceRepository as never,
      insightArtifactRepository as never
    );
    const insightTemplateService = new InsightTemplateService(templateRepository as never);

    const applyExecutionService = new AiSourceApplyExecutionService(
      artifactRepository as never,
      templateRepository as never,
      aiAssistantSessionService as never,
      insightArtifactService as never,
      insightTemplateService as never,
      insightTemplateValidationService as never,
      templateFullReplaceApplyService as never
    );

    const service = new AiSourceApplyService(
      applyActionRepository as never,
      applyExecutionService as never,
      applyActionMapper as never,
      aiAssistantSessionService as never,
      insightTemplateService as never,
      producer as never
    );

    messageRepository.findOne.mockResolvedValue({
      id: 'assistant-message-1',
      sessionId: 'session-1',
      role: AiAssistantMessageRole.ASSISTANT,
      content: 'Generated SQL candidate',
      sqlCandidate: 'select 1',
    });
    messageRepository.find.mockImplementation(() => {
      if (!lastRequestedRequestId) {
        return Promise.resolve([]);
      }

      return Promise.resolve([
        {
          id: 'assistant-message-1',
          sessionId: 'session-1',
          role: AiAssistantMessageRole.ASSISTANT,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          proposedActions: [
            {
              id: lastRequestedRequestId,
              type: 'apply_changes_to_source',
              confidence: 0.9,
              payload: {},
            },
          ],
        },
      ]);
    });

    return {
      service,
      sessionRepository,
      messageRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
      insightTemplateValidationService,
      templateFullReplaceApplyService,
      applyActionMapper,
      producer,
      createStoredAction,
    };
  };

  it('creates artifact, binds session and stores idempotent response', async () => {
    const { service, sessionRepository, applyActionRepository, artifactRepository, producer } =
      createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-1',
      'assistant-message-1',
      'select 1',
      'Source A'
    );

    const session = {
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    };
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue(session);
    artifactRepository.create.mockReturnValue({
      title: 'Source A',
      sql: 'select 1',
      dataMart: { id: 'data-mart-1' },
      createdById: 'user-1',
      validationStatus: InsightArtifactValidationStatus.VALID,
      validationError: null,
    });
    artifactRepository.save.mockResolvedValueOnce({
      id: 'artifact-1',
      title: 'Source A',
      sql: 'select 1',
    });
    sessionRepository.save.mockResolvedValue({
      ...session,
      artifactId: 'artifact-1',
    });

    const result = await service.apply(command);

    expect(result.requestId).toBe('request-1');
    expect(result.artifactId).toBe('artifact-1');
    expect(result.templateUpdated).toBe(false);
    expect(result.status).toBe('updated');
    expect(sessionRepository.save).not.toHaveBeenCalled();
    expect(applyActionRepository.update).toHaveBeenCalledWith(
      { id: 'apply-request-1' },
      expect.objectContaining({
        response: expect.objectContaining({
          requestId: 'request-1',
          artifactId: 'artifact-1',
        }),
      })
    );
    expect(producer.produceEvent).toHaveBeenCalledTimes(1);
    const [event] = producer.produceEvent.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantActionAppliedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      assistantMessageId: 'assistant-message-1',
      requestId: 'request-1',
      actionType: 'update_existing_source',
      resultStatus: 'successful',
      artifactId: 'artifact-1',
      artifactTitle: 'Source A',
      templateId: null,
      sourceKey: null,
      templateUpdated: false,
    });
  });

  it('uses suggested artifact title from latest assistant proposed actions', async () => {
    const {
      service,
      sessionRepository,
      messageRepository,
      applyActionRepository,
      artifactRepository,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-intent-1',
      'assistant-message-1',
      'SELECT month, SUM(credits) AS total_credits FROM billing_usage GROUP BY month'
    );

    const session = {
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    };
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue(session);
    messageRepository.find.mockResolvedValue([
      {
        id: 'assistant-message-1',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        proposedActions: [
          {
            id: 'request-intent-1',
            type: 'create_source_and_attach',
            confidence: 0.9,
            payload: {
              suggestedSourceTitle: 'Consumption 2025',
            },
          },
        ],
      },
    ]);
    artifactRepository.create.mockReturnValue({
      title: 'Consumption 2025',
      sql: command.sql,
      dataMart: { id: 'data-mart-1' },
      createdById: 'user-1',
      validationStatus: InsightArtifactValidationStatus.VALID,
      validationError: null,
    });
    artifactRepository.save.mockResolvedValue({
      id: 'artifact-1',
      title: 'Consumption 2025',
      sql: command.sql,
    });
    sessionRepository.save.mockResolvedValue({
      ...session,
      artifactId: 'artifact-1',
    });

    await service.apply(command);

    expect(artifactRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Consumption 2025',
      })
    );
  });

  it('attaches source to template exactly once', async () => {
    const {
      service,
      sessionRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
      insightTemplateValidationService,
      producer,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-2',
      'assistant-message-1',
      'select 2',
      undefined
    );

    const session = {
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    };

    const template = {
      id: 'template-1',
      template: '## Report',
      sources: [],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    };
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue(session);
    artifactRepository.create.mockReturnValue({
      title: 'Untitled source',
      sql: 'select 2',
      dataMart: { id: 'data-mart-1' },
      createdById: 'user-1',
      validationStatus: InsightArtifactValidationStatus.VALID,
      validationError: null,
    });
    artifactRepository.save.mockResolvedValue({
      id: 'artifact-new',
      title: 'Untitled source',
      sql: 'select 2',
    });
    templateRepository.findOne.mockResolvedValue(template);
    insightTemplateValidationService.validateSources.mockResolvedValue(undefined);
    templateRepository.save.mockResolvedValue({
      ...template,
      sources: [
        {
          key: 'source_new',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-new',
        },
      ],
    });

    const result = await service.apply(command);

    expect(result.templateUpdated).toBe(true);
    expect(result.templateId).toBe('template-1');
    expect(result.sourceKey).toBe('source_new');
    expect(result.status).toBe('updated');
    expect(templateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            key: 'source_new',
            type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
            artifactId: 'artifact-new',
          }),
        ],
      })
    );
    expect(producer.produceEvent).toHaveBeenCalledTimes(1);
    const [event] = producer.produceEvent.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantActionAppliedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      assistantMessageId: 'assistant-message-1',
      requestId: 'request-2',
      actionType: 'create_and_attach_source',
      resultStatus: 'successful',
      artifactId: 'artifact-new',
      artifactTitle: 'Untitled source',
      templateId: 'template-1',
      template: '## Report',
      sourceKey: 'source_new',
      templateUpdated: true,
    });
  });

  it('reuses existing template source key on create_and_attach_source without creating new artifact', async () => {
    const {
      service,
      sessionRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-reuse-1',
      'assistant-message-1',
      undefined,
      undefined
    );

    const session = {
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    };

    const template = {
      id: 'template-1',
      template: '### Consumption in 2025 by month\n{{table source="consumption_2025"}}',
      sources: [
        {
          key: 'consumption_2025',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-existing',
        },
      ],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    };
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue(session);
    templateRepository.findOne.mockResolvedValue(template);
    artifactRepository.findOne.mockResolvedValue({
      id: 'artifact-existing',
      title: 'Consumption in 2025 by month',
      sql: 'select existing',
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    });
    const result = await service.apply(command);

    expect(result.status).toBe('already_present');
    expect(result.reason).toBe('source_already_in_template');
    expect(result.artifactId).toBe('artifact-existing');
    expect(result.sourceKey).toBe('consumption_2025');
    expect(result.templateUpdated).toBe(false);
    expect(artifactRepository.save).not.toHaveBeenCalled();
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('updates existing source artifact SQL when source key already exists in template', async () => {
    const {
      service,
      sessionRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-reuse-update-1',
      'assistant-message-1',
      'SELECT month, SUM(credits) AS credits FROM source GROUP BY month',
      undefined
    );

    const session = {
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: 'artifact-old',
    };

    const template = {
      id: 'template-1',
      template: '### Consumption in 2025 by month\n{{table source="consumption_2025"}}',
      sources: [
        {
          key: 'consumption_2025',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-existing',
        },
      ],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    };
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue(session);
    templateRepository.findOne.mockResolvedValue(template);
    artifactRepository.findOne.mockImplementation(
      async ({ where: { id } }: { where: { id: string } }) => {
        if (id === 'artifact-existing') {
          return {
            id: 'artifact-existing',
            title: 'Consumption in 2025 by month',
            sql: 'SELECT month, SUM(credits) AS credits, SUM(units) AS units FROM source GROUP BY month',
            dataMart: { id: 'data-mart-1', projectId: 'project-1' },
          };
        }

        if (id === 'artifact-old') {
          return {
            id: 'artifact-old',
            title: 'Old artifact',
            sql: 'select 1',
            dataMart: { id: 'data-mart-1', projectId: 'project-1' },
          };
        }

        return null;
      }
    );
    artifactRepository.save.mockImplementation(async artifact => artifact);
    const result = await service.apply(command);

    expect(result.status).toBe('updated');
    expect(result.reason).toBe('update_existing_source');
    expect(result.artifactId).toBe('artifact-existing');
    expect(result.templateUpdated).toBe(false);
    expect(artifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artifact-existing',
        sql: 'SELECT month, SUM(credits) AS credits FROM source GROUP BY month',
      })
    );
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('attaches source by updating template sources only for create_and_attach_source', async () => {
    const {
      service,
      sessionRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
      insightTemplateValidationService,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-attach-tag-1',
      'assistant-message-1',
      'select 2',
      undefined
    );

    const session = {
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    };

    const template = {
      id: 'template-1',
      template: '### Result\n{{table source="main"}}',
      sources: [],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    };
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue(session);
    artifactRepository.create.mockReturnValue({
      title: 'Untitled source',
      sql: 'select 2',
      dataMart: { id: 'data-mart-1' },
      createdById: 'user-1',
      validationStatus: InsightArtifactValidationStatus.VALID,
      validationError: null,
    });
    artifactRepository.save.mockResolvedValue({
      id: 'artifact-new',
      title: 'Untitled source',
      sql: 'select 2',
    });
    templateRepository.findOne.mockResolvedValue(template);
    insightTemplateValidationService.validateSources.mockResolvedValue(undefined);
    templateRepository.save.mockResolvedValue({
      ...template,
      template: '### Consumption in 2025 by month\n{{table source="consumption_2025"}}',
      sources: [
        {
          key: 'consumption_2025',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-new',
        },
      ],
    });

    await service.apply(command);

    expect(templateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            key: 'consumption_2025',
            type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
            artifactId: 'artifact-new',
          }),
        ],
      })
    );
  });

  it('returns stored response for duplicate requestId without new mutations', async () => {
    const { service, applyActionRepository, sessionRepository, producer } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-3',
      'assistant-message-1',
      'select 3'
    );

    applyActionRepository.findOne.mockResolvedValue({
      id: 'apply-request-3',
      sessionId: 'session-1',
      requestId: 'request-3',
      createdById: 'user-1',
      response: {
        requestId: 'request-3',
        lifecycleStatus: 'applied',
        artifactId: 'artifact-3',
        sourceTitle: 'Source 3',
        templateUpdated: false,
        templateId: null,
        sourceKey: null,
        actionType: 'update_existing_source',
        selectedAction: {
          type: 'update_existing_source',
        },
        status: 'updated',
        reason: null,
      },
    });

    const result = await service.apply(command);

    expect(result.artifactId).toBe('artifact-3');
    expect(result.status).toBe('updated');
    expect(sessionRepository.findOne).not.toHaveBeenCalled();
    expect(producer.produceEvent).not.toHaveBeenCalled();
  });

  it('rejects outdated apply action when a newer action exists in the same session', async () => {
    const { service, sessionRepository, messageRepository, applyActionRepository, producer } =
      createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-1',
      'assistant-message-1',
      'select 1'
    );

    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    });
    messageRepository.find.mockResolvedValue([
      {
        id: 'assistant-message-2',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        proposedActions: [
          {
            id: 'request-newer',
            type: 'apply_changes_to_source',
            confidence: 0.9,
            payload: {},
          },
        ],
      },
    ]);

    await expect(service.apply(command)).rejects.toBeInstanceOf(BadRequestException);
    expect(applyActionRepository.update).not.toHaveBeenCalled();
    expect(producer.produceEvent).toHaveBeenCalledTimes(1);
    const [event] = producer.produceEvent.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantActionAppliedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      assistantMessageId: 'assistant-message-1',
      requestId: 'request-1',
      actionType: 'update_existing_source',
      resultStatus: 'failed',
      artifactId: null,
      artifactTitle: null,
      templateId: null,
      sourceKey: null,
      templateUpdated: false,
      error: 'Apply action is outdated. Please apply the latest action from the session.',
    });
  });

  it('emits failed action_applied event for validation_failed result', async () => {
    const {
      service,
      sessionRepository,
      applyActionRepository,
      templateFullReplaceApplyService,
      templateRepository,
      producer,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-replace-template-1',
      'assistant-message-1'
    );

    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    });
    applyActionRepository.insert.mockResolvedValue(undefined);
    templateFullReplaceApplyService.apply.mockResolvedValue({
      templateUpdated: false,
      templateId: 'template-1',
      status: 'validation_failed',
      reason: 'template validation failed',
    });
    templateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      template: '# Current Report',
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    });

    const result = await service.apply(command);

    expect(result.status).toBe('validation_failed');
    expect(producer.produceEvent).toHaveBeenCalledTimes(1);
    const [event] = producer.produceEvent.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantActionAppliedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      assistantMessageId: 'assistant-message-1',
      requestId: 'request-replace-template-1',
      actionType: 'replace_template_document',
      resultStatus: 'failed',
      artifactId: null,
      artifactTitle: null,
      templateId: 'template-1',
      template: '# Current Report',
      sourceKey: null,
      templateUpdated: false,
      error: 'template validation failed',
    });
  });

  it('allows apply for any action id from the latest message actions list', async () => {
    const {
      service,
      sessionRepository,
      messageRepository,
      artifactRepository,
      applyActionRepository,
      createStoredAction,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-1',
      'assistant-message-latest',
      'select 1'
    );

    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    });
    applyActionRepository.findOne.mockResolvedValue({
      ...createStoredAction('request-1', { type: 'update_existing_source' }),
      response: {
        ...createStoredAction('request-1', { type: 'update_existing_source' }).response,
        assistantMessageId: 'assistant-message-latest',
      },
    });
    messageRepository.find.mockResolvedValue([
      {
        id: 'assistant-message-latest',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        proposedActions: [
          {
            id: 'request-1',
            type: 'apply_changes_to_source',
            confidence: 0.9,
            payload: {},
          },
          {
            id: 'request-extra',
            type: 'create_source_and_attach',
            confidence: 0.8,
            payload: {},
          },
        ],
      },
    ]);
    artifactRepository.findOne.mockResolvedValue({
      id: 'artifact-session',
      title: 'Session source',
      sql: 'select old',
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    });
    artifactRepository.save.mockResolvedValue({
      id: 'artifact-session',
      title: 'Session source',
      sql: 'select 1',
    });

    await expect(service.apply(command)).resolves.toBeDefined();
  });

  it('throws 409 when assistantMessageId conflicts with selected action owner', async () => {
    const {
      service,
      sessionRepository,
      messageRepository,
      applyActionRepository,
      createStoredAction,
    } = createService();

    messageRepository.findOne.mockResolvedValue({
      id: 'assistant-message-1',
      sessionId: 'session-1',
      role: AiAssistantMessageRole.ASSISTANT,
      content: 'Generated SQL candidate',
      meta: {
        decisionSnapshot: {
          path: 'source_task>create_new_source_sql',
          finalRoute: 'create_new_source_sql',
          actionType: 'create_and_attach_source',
          templateId: 'template-1',
          sourceKey: 'consumption_2026',
          decisionTraceId: 'trace-1',
        },
      },
    });

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-conflict-1',
      'assistant-message-1',
      'select 1',
      undefined
    );
    applyActionRepository.findOne.mockResolvedValue({
      ...createStoredAction('request-conflict-1', {
        type: 'create_and_attach_source',
        templateId: 'template-1',
        sourceKey: 'consumption_2026',
      }),
      response: {
        ...createStoredAction('request-conflict-1', {
          type: 'create_and_attach_source',
          templateId: 'template-1',
          sourceKey: 'consumption_2026',
        }).response,
        assistantMessageId: 'assistant-message-other',
      },
    });
    messageRepository.find.mockResolvedValue([
      {
        id: 'assistant-message-1',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        proposedActions: [
          {
            id: 'request-conflict-1',
            type: 'apply_changes_to_source',
            confidence: 0.9,
            payload: {},
          },
        ],
      },
    ]);
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    });

    await expect(service.apply(command)).rejects.toBeInstanceOf(ConflictException);
    expect(applyActionRepository.update).not.toHaveBeenCalled();
  });

  it('rejects apply when assistantMessageId does not belong to session', async () => {
    const { service, sessionRepository, messageRepository, applyActionRepository } =
      createService();

    messageRepository.findOne.mockResolvedValue(null);

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-foreign-message-1',
      'assistant-message-1'
    );
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    });

    await expect(service.apply(command)).rejects.toBeInstanceOf(NotFoundException);
    expect(applyActionRepository.update).not.toHaveBeenCalled();
  });

  it('rejects apply for non-template session scope', async () => {
    const { service, sessionRepository, applyActionRepository } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-artifact-scope-1',
      'assistant-message-1',
      'select 1'
    );
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: 'artifact' as AiAssistantScope,
      templateId: null,
      artifactId: 'artifact-1',
    });

    await expect(service.apply(command)).rejects.toBeInstanceOf(BusinessViolationException);
    expect(applyActionRepository.update).not.toHaveBeenCalled();
  });

  it('resolves refine target by sourceKey from template sources', async () => {
    const {
      service,
      sessionRepository,
      messageRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
    } = createService();

    messageRepository.findOne.mockResolvedValue({
      id: 'assistant-message-1',
      sessionId: 'session-1',
      role: AiAssistantMessageRole.ASSISTANT,
      content: 'Refine source SQL',
      meta: {
        decisionSnapshot: {
          path: 'source_task>refine_existing_source_sql',
          finalRoute: 'refine_existing_source_sql',
          actionType: 'update_existing_source',
          sourceKey: 'consumption_2025',
          decisionTraceId: 'trace-2',
        },
        response: {
          result: {
            sqlCandidate: 'select 42',
          },
        },
      },
    });

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-refine-1',
      'assistant-message-1',
      'SELECT month, SUM(credits) FROM usage GROUP BY month'
    );
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: 'artifact-session',
    });
    templateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      template: '## Report',
      sources: [
        {
          key: 'consumption_2025',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-target',
        },
      ],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    });
    artifactRepository.findOne.mockImplementation(
      async ({ where: { id } }: { where: { id: string } }) => {
        if (id === 'artifact-target') {
          return {
            id: 'artifact-target',
            title: 'Target source',
            sql: 'select old',
            dataMart: { id: 'data-mart-1', projectId: 'project-1' },
          };
        }
        if (id === 'artifact-session') {
          return {
            id: 'artifact-session',
            title: 'Session source',
            sql: 'select old session',
            dataMart: { id: 'data-mart-1', projectId: 'project-1' },
          };
        }
        return null;
      }
    );
    artifactRepository.save.mockImplementation(async artifact => artifact);

    const result = await service.apply(command);

    expect(result.artifactId).toBe('artifact-target');
    expect(artifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artifact-target',
      })
    );
    expect(artifactRepository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artifact-session',
      })
    );
    expect(applyActionRepository.update).toHaveBeenCalledWith(
      { id: 'apply-request-refine-1' },
      expect.objectContaining({
        response: expect.objectContaining({
          assistantMessageId: 'assistant-message-1',
          artifactId: 'artifact-target',
        }),
      })
    );
  });

  it('applies remove_source_from_template action', async () => {
    const { service, sessionRepository, applyActionRepository, templateRepository } =
      createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-remove-source-1',
      'assistant-message-1',
      undefined
    );
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    });
    templateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      template: '## Result\n{{table source="consumption_2025"}}',
      sources: [
        {
          key: 'consumption_2025',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-1',
        },
      ],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    });
    templateRepository.save.mockResolvedValue(undefined);

    const result = await service.apply(command);

    expect(result.status).toBe('updated');
    expect(result.templateUpdated).toBe(true);
    expect(result.reason).toBe('remove_source_only');
    expect(templateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        template: '## Result\n{{table source="consumption_2025"}}',
        sources: [],
      })
    );
  });

  it('reuses existing source by sourceId without SQL generation for create_and_attach_source', async () => {
    const {
      service,
      sessionRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-attach-existing-1',
      'assistant-message-1',
      undefined
    );
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: null,
    });
    artifactRepository.findOne.mockImplementation(
      async ({ where: { id } }: { where: { id: string } }) => {
        if (id === 'artifact-existing') {
          return {
            id: 'artifact-existing',
            title: 'Consumption 2026',
            sql: 'select * from usage_2026',
            dataMart: { id: 'data-mart-1', projectId: 'project-1' },
          };
        }
        return null;
      }
    );
    templateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      template: '## Report',
      sources: [
        {
          templateSourceId: 'template-source-2026',
          key: 'consumption_2026',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-existing',
        },
      ],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    });
    templateRepository.save.mockResolvedValue(undefined);

    const result = await service.apply(command);

    expect(result.status).toBe('already_present');
    expect(result.reason).toBe('source_already_in_template');
    expect(result.artifactId).toBe('artifact-existing');
    expect(result.sourceKey).toBe('consumption_2026');
    expect(result.templateUpdated).toBe(false);
    expect(artifactRepository.save).not.toHaveBeenCalled();
    expect(templateRepository.save).not.toHaveBeenCalled();
  });

  it('updates conflicting source key target artifact instead of failing', async () => {
    const {
      service,
      sessionRepository,
      applyActionRepository,
      artifactRepository,
      templateRepository,
    } = createService();

    const command = new ApplyAiAssistantSessionCommand(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'request-5',
      'assistant-message-1',
      'select 5',
      undefined
    );
    applyActionRepository.create.mockReturnValue({});
    applyActionRepository.insert.mockResolvedValue(undefined);
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
      artifactId: 'artifact-1',
      response: {
        proposedActions: [
          {
            id: 'request-5',
            type: 'create_source_and_attach',
            confidence: 0.9,
            payload: { suggestedSourceKey: 'source_conflict' },
          },
        ],
      },
    });
    artifactRepository.findOne.mockImplementation(
      async ({ where: { id } }: { where: { id: string } }) => {
        if (id === 'artifact-other') {
          return {
            id: 'artifact-other',
            title: 'Existing source',
            sql: 'select old from artifact_other',
            dataMart: { id: 'data-mart-1', projectId: 'project-1' },
          };
        }

        if (id === 'artifact-1') {
          return {
            id: 'artifact-1',
            title: 'Session artifact',
            sql: 'select old',
            dataMart: { id: 'data-mart-1', projectId: 'project-1' },
          };
        }

        return null;
      }
    );
    artifactRepository.save.mockImplementation(async artifact => artifact);
    templateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      template: '## Report',
      sources: [
        {
          key: 'source_conflict',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-other',
        },
      ],
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    });

    const result = await service.apply(command);

    expect(result.status).toBe('updated');
    expect(result.reason).toBe('update_existing_source');
    expect(result.artifactId).toBe('artifact-other');
    expect(artifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artifact-other',
        sql: 'select 5',
      })
    );
  });
});
