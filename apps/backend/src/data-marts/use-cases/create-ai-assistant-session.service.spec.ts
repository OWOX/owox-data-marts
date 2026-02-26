jest.mock('../services/data-mart.service', () => ({
  DataMartService: function DataMartService() {
    // mocked in tests
  },
}));
jest.mock('../services/insight-template.service', () => ({
  InsightTemplateService: function InsightTemplateService() {
    // mocked in tests
  },
}));
jest.mock('../services/ai-assistant-session.service', () => ({
  AiAssistantSessionService: function AiAssistantSessionService() {
    // mocked in tests
  },
}));
jest.mock('../mappers/ai-assistant.mapper', () => ({
  AiAssistantMapper: function AiAssistantMapper() {
    // mocked in tests
  },
}));

import { CreateAiAssistantSessionCommand } from '../dto/domain/create-ai-assistant-session.command';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { CreateAiAssistantSessionService } from './create-ai-assistant-session.service';

describe('CreateAiAssistantSessionService', () => {
  const createService = () => {
    const dataMartService = {
      getByIdAndProjectId: jest.fn(),
    };
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const aiAssistantSessionService = {
      createSession: jest.fn(),
    };
    const mapper = {
      toDomainSessionDto: jest.fn(),
    };

    const service = new CreateAiAssistantSessionService(
      dataMartService as never,
      insightTemplateService as never,
      aiAssistantSessionService as never,
      mapper as never
    );

    return {
      service,
      dataMartService,
      insightTemplateService,
      aiAssistantSessionService,
      mapper,
    };
  };

  it('creates a new session only in template scope', async () => {
    const { service, dataMartService, insightTemplateService, aiAssistantSessionService, mapper } =
      createService();
    const command = new CreateAiAssistantSessionCommand(
      'data-mart-1',
      'project-1',
      'user-1',
      'template-1'
    );
    const createdSession = { id: 'session-1' };
    const mappedResult = { id: 'session-1' };

    dataMartService.getByIdAndProjectId.mockResolvedValue({ id: 'data-mart-1' });
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'template-1',
    });
    aiAssistantSessionService.createSession.mockResolvedValue(createdSession);
    mapper.toDomainSessionDto.mockReturnValue(mappedResult);

    const result = await service.run(command);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('data-mart-1', 'project-1');
    expect(insightTemplateService.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'template-1',
      'data-mart-1',
      'project-1'
    );
    expect(aiAssistantSessionService.createSession).toHaveBeenCalledWith({
      dataMartId: 'data-mart-1',
      createdById: 'user-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
    });
    expect(mapper.toDomainSessionDto).toHaveBeenCalledWith(createdSession, []);
    expect(result).toBe(mappedResult);
  });

  it('requires templateId for template scope sessions', async () => {
    const { service, dataMartService, aiAssistantSessionService } = createService();
    const command = new CreateAiAssistantSessionCommand('data-mart-1', 'project-1', 'user-1', null);

    dataMartService.getByIdAndProjectId.mockResolvedValue({ id: 'data-mart-1' });

    await expect(service.run(command)).rejects.toThrow(
      '`templateId` is required for template scope'
    );
    expect(aiAssistantSessionService.createSession).not.toHaveBeenCalled();
  });
});
