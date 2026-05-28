import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import {
  CreateProjectMemberApiKeyRequestDto,
  CreateProjectMemberApiKeyResponseDto,
  ProjectMemberApiKeyResponseDto,
  UpdateProjectMemberApiKeyRequestDto,
} from '../../dto/presentation/project-member-api-key-api.dto';

export function ListProjectMemberApiKeysSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List API keys for the current project member',
    }),
    ApiQuery({
      name: 'includeRevoked',
      required: false,
      type: Boolean,
      description: 'Include revoked keys in the response',
    }),
    ApiOkResponse({ type: [ProjectMemberApiKeyResponseDto] })
  );
}

export function CreateProjectMemberApiKeySpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new API key for the current project member',
    }),
    ApiBody({ type: CreateProjectMemberApiKeyRequestDto }),
    ApiCreatedResponse({ type: CreateProjectMemberApiKeyResponseDto }),
    ApiResponse({ status: 400, description: 'Invalid request body' })
  );
}

export function UpdateProjectMemberApiKeySpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update an existing API key name',
    }),
    ApiParam({ name: 'apiKeyId', description: 'API key identifier' }),
    ApiBody({ type: UpdateProjectMemberApiKeyRequestDto }),
    ApiOkResponse({ type: ProjectMemberApiKeyResponseDto }),
    ApiResponse({ status: 404, description: 'API key not found' })
  );
}

export function RevokeProjectMemberApiKeySpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Revoke an API key',
      description:
        'Permanently revokes the API key. Any integrations using this key will stop working immediately.',
    }),
    ApiParam({ name: 'apiKeyId', description: 'API key identifier' }),
    ApiNoContentResponse({ description: 'API key revoked' }),
    ApiResponse({ status: 404, description: 'API key not found' })
  );
}
