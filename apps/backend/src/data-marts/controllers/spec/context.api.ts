import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import {
  ContextImpactResponseApiDto,
  ContextResponseApiDto,
  CreateContextRequestApiDto,
  UpdateContextMembersRequestApiDto,
  UpdateContextMembersResponseApiDto,
  UpdateContextRequestApiDto,
} from '../../dto/presentation/context-api.dto';

export function CreateContextSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Context' }),
    ApiBody({ type: CreateContextRequestApiDto }),
    ApiResponse({ status: 201, type: ContextResponseApiDto }),
    ApiResponse({ status: 409, description: 'Context name already exists in this project' })
  );
}

export function ListContextsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List all Contexts in the project' }),
    ApiOkResponse({ type: [ContextResponseApiDto] })
  );
}

export function UpdateContextSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update a Context by ID' }),
    ApiParam({ name: 'id', description: 'Context ID' }),
    ApiBody({ type: UpdateContextRequestApiDto }),
    ApiOkResponse({ type: ContextResponseApiDto }),
    ApiResponse({ status: 404, description: 'Context not found' }),
    ApiResponse({ status: 409, description: 'Context name already exists in this project' })
  );
}

export function GetContextImpactSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get usage counts and affected members for a Context',
      description:
        'Used to render the "Cannot delete" dialog. Returns counts of resources and members that reference the context.',
    }),
    ApiParam({ name: 'id', description: 'Context ID' }),
    ApiOkResponse({ type: ContextImpactResponseApiDto }),
    ApiResponse({ status: 404, description: 'Context not found' })
  );
}

export function DeleteContextSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete a Context by ID',
      description:
        'Soft-deletes the context. Returns 409 with impact counts if it is still attached to any Data Mart, Storage, Destination or Member — caller must detach first.',
    }),
    ApiParam({ name: 'id', description: 'Context ID' }),
    ApiNoContentResponse({ description: 'Context deleted' }),
    ApiResponse({ status: 404, description: 'Context not found' }),
    ApiResponse({ status: 409, description: 'Context is still attached to resources or members' })
  );
}

export function SetContextMembersSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Replace the set of non-admin members bound to a Context',
      description:
        'Admins are silently dropped from the input — they always have project-wide scope. The dropped admin user ids are returned in `droppedAdminIds` so the UI can warn the caller.',
    }),
    ApiParam({ name: 'id', description: 'Context ID' }),
    ApiBody({ type: UpdateContextMembersRequestApiDto }),
    ApiOkResponse({ type: UpdateContextMembersResponseApiDto }),
    ApiResponse({ status: 404, description: 'Context not found' })
  );
}
