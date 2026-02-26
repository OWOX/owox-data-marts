import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  ApplyAiAssistantActionPayload,
  ApplyAiAssistantSessionCommand,
} from '../dto/domain/apply-ai-assistant-session.command';
import { InsightTemplateSourceType } from '../dto/schemas/insight-template/insight-template-source.schema';
import { AiAssistantSession } from '../entities/ai-assistant-session.entity';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { AiSourceApplyExecutionService } from './ai-source-apply-execution.service';

type TestCommandInput = {
  sessionId?: string;
  dataMartId?: string;
  projectId?: string;
  userId?: string;
  requestId?: string;
  assistantMessageId?: string;
  sql?: string;
  artifactTitle?: string;
};

const createCommand = (input: TestCommandInput = {}): ApplyAiAssistantSessionCommand =>
  new ApplyAiAssistantSessionCommand(
    input.sessionId ?? 'session-1',
    input.dataMartId ?? 'data-mart-1',
    input.projectId ?? 'project-1',
    input.userId ?? 'user-1',
    input.requestId ?? 'request-1',
    input.assistantMessageId ?? 'assistant-message-1',
    input.sql,
    input.artifactTitle
  );

const createSession = (patch: Partial<AiAssistantSession> = {}): AiAssistantSession =>
  ({
    id: 'session-1',
    dataMartId: 'data-mart-1',
    createdById: 'user-1',
    scope: AiAssistantScope.TEMPLATE,
    templateId: 'template-1',
    ...patch,
  }) as AiAssistantSession;

const createTemplate = (patch: Record<string, unknown> = {}) => ({
  id: 'template-1',
  template: '## Report\n{{table source="main"}}',
  sources: [],
  dataMart: { id: 'data-mart-1', projectId: 'project-1' },
  ...patch,
});

const createArtifact = (patch: Record<string, unknown> = {}) => ({
  id: 'artifact-1',
  title: 'Consumption 2025',
  sql: 'select 1',
  validationStatus: InsightArtifactValidationStatus.VALID,
  validationError: null,
  dataMart: { id: 'data-mart-1', projectId: 'project-1' },
  ...patch,
});

describe('AiSourceApplyExecutionService', () => {
  const createService = () => {
    const artifactRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const templateRepository = {
      save: jest.fn(),
    };
    const aiAssistantSessionService = {
      getSessionByIdAndDataMartIdAndProjectId: jest.fn(),
      getAssistantMessageByIdAndSessionId: jest.fn(),
      getSuggestedArtifactTitleFromLatestAssistantActions: jest.fn().mockResolvedValue(null),
    };
    const insightArtifactService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
      getByIdAndDataMartIdAndProjectIdSafe: jest.fn(),
    };
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightTemplateValidationService = {
      validateSources: jest.fn().mockResolvedValue(undefined),
      validateTemplateText: jest.fn(),
    };
    const templateFullReplaceApplyService = {
      apply: jest.fn(),
    };

    const service = new AiSourceApplyExecutionService(
      artifactRepository as never,
      templateRepository as never,
      aiAssistantSessionService as never,
      insightArtifactService as never,
      insightTemplateService as never,
      insightTemplateValidationService as never,
      templateFullReplaceApplyService as never
    );

    return {
      service,
      artifactRepository,
      templateRepository,
      aiAssistantSessionService,
      insightArtifactService,
      insightTemplateService,
      insightTemplateValidationService,
      templateFullReplaceApplyService,
    };
  };

  it('loads template-scoped session via session service', async () => {
    const { service, aiAssistantSessionService } = createService();
    const command = createCommand();
    const session = createSession();

    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue(session);

    await expect(service.getSession(command)).resolves.toBe(session);
    expect(aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'session-1',
      'data-mart-1',
      'project-1',
      'user-1'
    );
  });

  it('rejects non-template scope in getSession', async () => {
    const { service, aiAssistantSessionService } = createService();
    const command = createCommand();

    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue(
      createSession({
        scope: 'artifact' as never,
      })
    );

    await expect(service.getSession(command)).rejects.toBeInstanceOf(BusinessViolationException);
  });

  it('updates explicit target artifact using SQL override', async () => {
    const { service, insightArtifactService, artifactRepository, aiAssistantSessionService } =
      createService();
    const session = createSession();
    const command = createCommand({
      sql: 'SELECT month, SUM(credits) AS credits FROM source GROUP BY month',
      artifactTitle: 'New artifact title',
    });
    const action: ApplyAiAssistantActionPayload = {
      type: 'update_existing_source',
      targetArtifactId: 'artifact-1',
    };
    const artifact = createArtifact({
      id: 'artifact-1',
      title: 'Old title',
      sql: 'select old',
    });

    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(artifact);
    artifactRepository.save.mockImplementation(async entity => entity);

    const result = await service.execute(session, command, action);

    expect(artifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artifact-1',
        title: 'New artifact title',
        sql: 'SELECT month, SUM(credits) AS credits FROM source GROUP BY month',
      })
    );
    expect(aiAssistantSessionService.getAssistantMessageByIdAndSessionId).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        artifactId: 'artifact-1',
        artifactTitle: 'New artifact title',
        status: 'updated',
        reason: 'update_existing_source',
      })
    );
  });

  it('resolves SQL from assistant message when override is absent', async () => {
    const { service, insightArtifactService, artifactRepository, aiAssistantSessionService } =
      createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'update_existing_source',
      targetArtifactId: 'artifact-1',
    };
    const artifact = createArtifact({
      id: 'artifact-1',
      sql: 'select old',
    });

    aiAssistantSessionService.getAssistantMessageByIdAndSessionId.mockResolvedValue({
      id: 'assistant-message-1',
      sqlCandidate: 'SELECT 1',
    });
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(artifact);
    artifactRepository.save.mockImplementation(async entity => entity);

    const result = await service.execute(session, command, action);

    expect(aiAssistantSessionService.getAssistantMessageByIdAndSessionId).toHaveBeenCalledWith(
      'assistant-message-1',
      'session-1'
    );
    expect(artifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: 'SELECT 1',
      })
    );
    expect(result.status).toBe('updated');
  });

  it('applies template edit together with source update when template payload is present', async () => {
    const { service, insightArtifactService, artifactRepository, templateFullReplaceApplyService } =
      createService();
    const session = createSession();
    const command = createCommand({
      sql: 'SELECT 42',
    });
    const action: ApplyAiAssistantActionPayload = {
      type: 'update_existing_source',
      targetArtifactId: 'artifact-1',
      templateId: 'template-1',
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
    };
    const artifact = createArtifact({
      id: 'artifact-1',
      sql: 'select old',
    });

    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(artifact);
    artifactRepository.save.mockImplementation(async entity => entity);
    templateFullReplaceApplyService.apply.mockResolvedValue({
      templateId: 'template-1',
      templateUpdated: true,
      status: 'updated',
      reason: 'replace_template_document',
      renderedTemplate: '# Report\n\n{{table source="main"}}',
    });

    const result = await service.execute(session, command, action);

    expect(templateFullReplaceApplyService.apply).toHaveBeenCalledWith({
      templateId: 'template-1',
      dataMartId: 'data-mart-1',
      projectId: 'project-1',
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
    });
    expect(result).toEqual(
      expect.objectContaining({
        artifactId: 'artifact-1',
        status: 'updated',
        templateUpdated: true,
        reason: 'update_existing_source',
      })
    );
  });

  it('fails when neither SQL override nor sqlCandidate is provided', async () => {
    const { service, aiAssistantSessionService, insightArtifactService } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'update_existing_source',
      targetArtifactId: 'artifact-1',
    };

    aiAssistantSessionService.getAssistantMessageByIdAndSessionId.mockResolvedValue({
      id: 'assistant-message-1',
      sqlCandidate: null,
    });

    await expect(service.execute(session, command, action)).rejects.toBeInstanceOf(
      BusinessViolationException
    );
    expect(insightArtifactService.getByIdAndDataMartIdAndProjectId).not.toHaveBeenCalled();
  });

  it('creates artifact and attaches it to template when source does not exist', async () => {
    const {
      service,
      artifactRepository,
      templateRepository,
      aiAssistantSessionService,
      insightTemplateService,
      insightTemplateValidationService,
    } = createService();
    const session = createSession();
    const command = createCommand({
      sql: 'SELECT month, SUM(credits) AS credits FROM source GROUP BY month',
    });
    const action: ApplyAiAssistantActionPayload = {
      type: 'create_and_attach_source',
      templateId: 'template-1',
      sourceKey: 'source_new',
      insertTag: true,
    };

    insightTemplateService.getByIdAndDataMartIdAndProjectId
      .mockResolvedValueOnce(createTemplate())
      .mockResolvedValueOnce(createTemplate())
      .mockResolvedValueOnce(createTemplate());
    aiAssistantSessionService.getSuggestedArtifactTitleFromLatestAssistantActions.mockResolvedValue(
      'Suggested title'
    );
    artifactRepository.create.mockReturnValue(
      createArtifact({
        id: 'artifact-new',
        title: 'Suggested title',
        sql: command.sql,
      })
    );
    artifactRepository.save.mockResolvedValue(
      createArtifact({
        id: 'artifact-new',
        title: 'Suggested title',
        sql: command.sql,
      })
    );
    templateRepository.save.mockResolvedValue(createTemplate());

    const result = await service.execute(session, command, action);

    expect(artifactRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Suggested title',
      })
    );
    expect(insightTemplateValidationService.validateSources).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'source_new',
          type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
          artifactId: 'artifact-new',
        }),
      ]),
      expect.objectContaining({
        dataMartId: 'data-mart-1',
        projectId: 'project-1',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        artifactId: 'artifact-new',
        sourceKey: 'source_new',
        status: 'updated',
        reason: 'create_and_attach_source',
        templateUpdated: true,
      })
    );
  });

  it('attaches explicit target artifact without SQL resolution', async () => {
    const {
      service,
      artifactRepository,
      aiAssistantSessionService,
      insightArtifactService,
      insightTemplateService,
      insightTemplateValidationService,
      templateRepository,
    } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'create_and_attach_source',
      templateId: 'template-1',
      sourceKey: 'source_new',
      targetArtifactId: 'artifact-existing',
      insertTag: true,
    };

    insightTemplateService.getByIdAndDataMartIdAndProjectId
      .mockResolvedValueOnce(createTemplate())
      .mockResolvedValueOnce(createTemplate());
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(
      createArtifact({
        id: 'artifact-existing',
        title: 'Existing artifact',
      })
    );
    templateRepository.save.mockResolvedValue(createTemplate());

    const result = await service.execute(session, command, action);

    expect(aiAssistantSessionService.getAssistantMessageByIdAndSessionId).not.toHaveBeenCalled();
    expect(artifactRepository.create).not.toHaveBeenCalled();
    expect(artifactRepository.save).not.toHaveBeenCalled();
    expect(insightTemplateValidationService.validateSources).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        artifactId: 'artifact-existing',
        sourceKey: 'source_new',
        status: 'updated',
        reason: 'attach_existing_source',
      })
    );
  });

  it('reuses existing source without artifact creation when SQL is absent', async () => {
    const {
      service,
      artifactRepository,
      templateRepository,
      insightArtifactService,
      insightTemplateService,
    } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'create_and_attach_source',
      templateId: 'template-1',
      sourceKey: 'source_existing',
      insertTag: true,
    };

    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(
      createTemplate({
        sources: [
          {
            key: 'source_existing',
            type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
            artifactId: 'artifact-existing',
          },
        ],
      })
    );
    insightArtifactService.getByIdAndDataMartIdAndProjectIdSafe.mockResolvedValue(
      createArtifact({
        id: 'artifact-existing',
      })
    );
    const result = await service.execute(session, command, action);

    expect(artifactRepository.create).not.toHaveBeenCalled();
    expect(artifactRepository.save).not.toHaveBeenCalled();
    expect(templateRepository.save).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        artifactId: 'artifact-existing',
        sourceKey: 'source_existing',
        status: 'already_present',
        reason: 'source_already_in_template',
        templateUpdated: false,
      })
    );
  });

  it('reuses existing source and updates artifact SQL when override differs', async () => {
    const { service, artifactRepository, insightArtifactService, insightTemplateService } =
      createService();
    const session = createSession();
    const command = createCommand({
      sql: 'SELECT month, SUM(credits) AS credits FROM source GROUP BY month',
    });
    const action: ApplyAiAssistantActionPayload = {
      type: 'create_and_attach_source',
      templateId: 'template-1',
      sourceKey: 'source_existing',
      insertTag: true,
    };

    insightTemplateService.getByIdAndDataMartIdAndProjectId
      .mockResolvedValueOnce(
        createTemplate({
          sources: [
            {
              key: 'source_existing',
              type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
              artifactId: 'artifact-existing',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createTemplate({
          sources: [
            {
              key: 'source_existing',
              type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
              artifactId: 'artifact-existing',
            },
          ],
        })
      );
    insightArtifactService.getByIdAndDataMartIdAndProjectIdSafe.mockResolvedValue(
      createArtifact({
        id: 'artifact-existing',
        sql: 'select old',
      })
    );
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(
      createArtifact({
        id: 'artifact-existing',
        sql: 'select old',
      })
    );
    artifactRepository.save.mockImplementation(async entity => entity);
    const result = await service.execute(session, command, action);

    expect(artifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artifact-existing',
        sql: 'SELECT month, SUM(credits) AS credits FROM source GROUP BY month',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        artifactId: 'artifact-existing',
        status: 'updated',
        reason: 'update_existing_source',
      })
    );
  });

  it('removes source from template sources only', async () => {
    const {
      service,
      insightTemplateService,
      templateRepository,
      insightTemplateValidationService,
    } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'remove_source_from_template',
      templateId: 'template-1',
      sourceKey: 'consumption_2025',
    };

    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(
      createTemplate({
        template: '## Result\n{{table source="consumption_2025"}}\n\n## Notes\nText',
        sources: [
          {
            key: 'consumption_2025',
            type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
            artifactId: 'artifact-1',
          },
        ],
      })
    );
    templateRepository.save.mockResolvedValue(createTemplate());

    const result = await service.execute(session, command, action);

    expect(insightTemplateValidationService.validateSources).toHaveBeenCalled();
    expect(templateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        template: '## Result\n{{table source="consumption_2025"}}\n\n## Notes\nText',
        sources: [],
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        templateId: 'template-1',
        sourceKey: 'consumption_2025',
        status: 'updated',
        reason: 'remove_source_only',
      })
    );
  });

  it('returns no_op for remove_source_from_template when nothing matches', async () => {
    const { service, insightTemplateService, templateRepository } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'remove_source_from_template',
      templateId: 'template-1',
      sourceKey: 'missing_source',
    };

    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(createTemplate());

    const result = await service.execute(session, command, action);

    expect(templateRepository.save).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        templateId: 'template-1',
        sourceKey: 'missing_source',
        status: 'no_op',
        reason: 'remove_source_no_changes',
      })
    );
  });

  it('applies full template replace for replace_template_document', async () => {
    const { service, templateFullReplaceApplyService } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'replace_template_document',
      templateId: 'template-1',
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
    };

    templateFullReplaceApplyService.apply.mockResolvedValue({
      templateId: 'template-1',
      templateUpdated: true,
      status: 'updated',
      reason: 'replace_template_document',
      renderedTemplate: '# Report\n\n{{table source="main"}}',
    });

    const result = await service.execute(session, command, action);

    expect(templateFullReplaceApplyService.apply).toHaveBeenCalledWith({
      templateId: 'template-1',
      dataMartId: 'data-mart-1',
      projectId: 'project-1',
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
    });
    expect(result).toEqual(
      expect.objectContaining({
        templateId: 'template-1',
        templateUpdated: true,
        status: 'updated',
        reason: 'replace_template_document',
      })
    );
  });

  it('returns no_op for replace_template_document when rendered template is unchanged', async () => {
    const { service, templateFullReplaceApplyService } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'replace_template_document',
      templateId: 'template-1',
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
    };

    templateFullReplaceApplyService.apply.mockResolvedValue({
      templateId: 'template-1',
      templateUpdated: false,
      status: 'no_op',
      reason: 'template_full_replace_no_changes',
      renderedTemplate: '# Report\n\n{{table source="main"}}',
    });

    const result = await service.execute(session, command, action);

    expect(result).toEqual(
      expect.objectContaining({
        templateId: 'template-1',
        templateUpdated: false,
        status: 'no_op',
        reason: 'template_full_replace_no_changes',
      })
    );
  });

  it('propagates hard fail for replace_template_document apply error', async () => {
    const { service, templateFullReplaceApplyService } = createService();
    const session = createSession();
    const command = createCommand();
    const action: ApplyAiAssistantActionPayload = {
      type: 'replace_template_document',
      templateId: 'template-1',
      text: '# Report',
      tags: [],
    };

    templateFullReplaceApplyService.apply.mockRejectedValue(
      new BusinessViolationException('template_update_conflict')
    );

    await expect(service.execute(session, command, action)).rejects.toBeInstanceOf(
      BusinessViolationException
    );
  });
});
