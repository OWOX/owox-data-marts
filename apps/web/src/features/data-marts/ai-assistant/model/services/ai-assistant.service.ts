import { ApiService } from '../../../../../services';
import type { AxiosRequestConfig } from 'axios';
import type {
  AiAssistantSessionListItemDto,
  AiAssistantSessionDto,
  AiRunTriggerResponseDto,
  AiRunTriggerStatusResponseDto,
  ApplyAiAssistantSessionRequestDto,
  ApplyAiAssistantSessionResponseDto,
  CreateAiAssistantMessageRequestDto,
  CreateAiAssistantMessageResponseDto,
  CreateAiAssistantSessionRequestDto,
  CreateAiAssistantSessionResponseDto,
  ListAiAssistantSessionsRequestDto,
  UpdateAiAssistantSessionTitleRequestDto,
} from '../types/ai-assistant.dto.ts';

export class AiAssistantService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async createSession(
    dataMartId: string,
    payload: CreateAiAssistantSessionRequestDto
  ): Promise<CreateAiAssistantSessionResponseDto> {
    return this.post<CreateAiAssistantSessionResponseDto>(
      `/${dataMartId}/ai-assistant/sessions`,
      payload
    );
  }

  async getSession(dataMartId: string, sessionId: string): Promise<AiAssistantSessionDto> {
    return this.get<AiAssistantSessionDto>(`/${dataMartId}/ai-assistant/sessions/${sessionId}`);
  }

  async listSessions(
    dataMartId: string,
    params: ListAiAssistantSessionsRequestDto
  ): Promise<AiAssistantSessionListItemDto[]> {
    return this.get<AiAssistantSessionListItemDto[]>(
      `/${dataMartId}/ai-assistant/sessions`,
      params
    );
  }

  async updateSessionTitle(
    dataMartId: string,
    sessionId: string,
    payload: UpdateAiAssistantSessionTitleRequestDto
  ): Promise<AiAssistantSessionListItemDto> {
    return this.patch<AiAssistantSessionListItemDto>(
      `/${dataMartId}/ai-assistant/sessions/${sessionId}/title`,
      payload
    );
  }

  async deleteSession(dataMartId: string, sessionId: string): Promise<void> {
    return this.delete(`/${dataMartId}/ai-assistant/sessions/${sessionId}`);
  }

  async createMessage(
    dataMartId: string,
    sessionId: string,
    payload: CreateAiAssistantMessageRequestDto
  ): Promise<CreateAiAssistantMessageResponseDto> {
    return this.post<CreateAiAssistantMessageResponseDto>(
      `/${dataMartId}/ai-assistant/sessions/${sessionId}/messages`,
      payload
    );
  }

  async applySession(
    dataMartId: string,
    sessionId: string,
    payload: ApplyAiAssistantSessionRequestDto
  ): Promise<ApplyAiAssistantSessionResponseDto> {
    return this.post<ApplyAiAssistantSessionResponseDto>(
      `/${dataMartId}/ai-assistant/sessions/${sessionId}/apply`,
      payload
    );
  }

  async getRunTriggerStatus(
    dataMartId: string,
    triggerId: string
  ): Promise<AiRunTriggerStatusResponseDto> {
    return this.get<AiRunTriggerStatusResponseDto>(
      `/${dataMartId}/ai-assistant/run-triggers/${triggerId}/status`,
      undefined,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
  }

  async getRunTriggerResponse(
    dataMartId: string,
    triggerId: string
  ): Promise<AiRunTriggerResponseDto> {
    return this.get<AiRunTriggerResponseDto>(
      `/${dataMartId}/ai-assistant/run-triggers/${triggerId}`,
      undefined,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
  }

  async abortRunTrigger(dataMartId: string, triggerId: string): Promise<void> {
    return this.delete(`/${dataMartId}/ai-assistant/run-triggers/${triggerId}`, {
      skipLoadingIndicator: true,
    } as AxiosRequestConfig);
  }
}

export const aiAssistantService = new AiAssistantService();
