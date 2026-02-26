import { applyDecorators } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiQuery,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AiAssistantSessionListItemResponseApiDto } from '../../dto/presentation/ai-assistant-session-list-item-response-api.dto';
import { AiAssistantSessionResponseApiDto } from '../../dto/presentation/ai-assistant-session-response-api.dto';
import { ApplyAiAssistantSessionRequestApiDto } from '../../dto/presentation/apply-ai-assistant-session-request-api.dto';
import { ApplyAiAssistantSessionResponseApiDto } from '../../dto/presentation/apply-ai-assistant-session-response-api.dto';
import { CreateAiAssistantMessageRequestApiDto } from '../../dto/presentation/create-ai-assistant-message-request-api.dto';
import { CreateAiAssistantMessageResponseApiDto } from '../../dto/presentation/create-ai-assistant-message-response-api.dto';
import { CreateAiAssistantSessionRequestApiDto } from '../../dto/presentation/create-ai-assistant-session-request-api.dto';
import { CreateAiAssistantSessionResponseApiDto } from '../../dto/presentation/create-ai-assistant-session-response-api.dto';
import { UpdateAiAssistantSessionTitleRequestApiDto } from '../../dto/presentation/update-ai-assistant-session-title-request-api.dto';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';

export function CreateAiAssistantSessionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create AI Source Assistant session' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiBody({ type: CreateAiAssistantSessionRequestApiDto }),
    ApiCreatedResponse({ type: CreateAiAssistantSessionResponseApiDto })
  );
}

export function GetAiAssistantSessionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get AI Source Assistant session with message history' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'sessionId', description: 'AI Source Assistant Session ID' }),
    ApiOkResponse({ type: AiAssistantSessionResponseApiDto })
  );
}

export function ListAiAssistantSessionsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List AI Source Assistant sessions for current user and context' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiQuery({
      name: 'scope',
      required: true,
      enum: AiAssistantScope,
    }),
    ApiQuery({
      name: 'templateId',
      required: false,
      description: 'Template id filter. Use with template scope',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      description: 'Limit number of sessions',
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      description: 'Offset for pagination',
    }),
    ApiOkResponse({ type: AiAssistantSessionListItemResponseApiDto, isArray: true })
  );
}

export function CreateAiAssistantMessageSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Append user message to AI Source Assistant session',
      description:
        'Returns lightweight response payload or heavy route trigger id depending on server-side routing.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'sessionId', description: 'AI Source Assistant Session ID' }),
    ApiBody({ type: CreateAiAssistantMessageRequestApiDto }),
    ApiCreatedResponse({ type: CreateAiAssistantMessageResponseApiDto })
  );
}

export function UpdateAiAssistantSessionTitleSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update AI Source Assistant session title' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'sessionId', description: 'AI Source Assistant Session ID' }),
    ApiBody({ type: UpdateAiAssistantSessionTitleRequestApiDto }),
    ApiOkResponse({ type: AiAssistantSessionListItemResponseApiDto })
  );
}

export function DeleteAiAssistantSessionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete AI Source Assistant session' }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'sessionId', description: 'AI Source Assistant Session ID' }),
    ApiNoContentResponse()
  );
}

export function ApplyAiAssistantSessionSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Execute pre-created apply action by id',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'sessionId', description: 'AI Source Assistant Session ID' }),
    ApiBody({ type: ApplyAiAssistantSessionRequestApiDto }),
    ApiOkResponse({ type: ApplyAiAssistantSessionResponseApiDto })
  );
}
