import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  CreateNewProjectResponseApiDto,
  RequestAccessContextApiDto,
  RequestProjectAccessApiDto,
  RequestProjectAccessResponseApiDto,
} from '../../dto/presentation/request-access-api.dto';

export function GetRequestAccessContextSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get request-access context for the current project',
      description:
        'Returns the current user, target project, available roles and existing pending request for users authenticated with an empty project-role token.',
    }),
    ApiOkResponse({ type: RequestAccessContextApiDto }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}

export function RequestProjectAccessSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Request access to the current project',
      description:
        'Creates or returns a pending project membership request for the authenticated user and selected role.',
    }),
    ApiBody({ type: RequestProjectAccessApiDto }),
    ApiResponse({ status: 202, type: RequestProjectAccessResponseApiDto }),
    ApiResponse({ status: 400, description: 'Invalid requested role' }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}

export function CreateNewProjectSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new project instead of requesting access',
      description:
        'Creates a separate project for the authenticated user and returns the new project id/title.',
    }),
    ApiResponse({ status: 201, type: CreateNewProjectResponseApiDto }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}
