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
  InviteMemberRequestApiDto,
  InviteMemberResponseApiDto,
  ProjectMemberResponseApiDto,
  UpdateMemberRequestApiDto,
  UpdateMemberResponseApiDto,
} from '../../dto/presentation/context-api.dto';

export function ListProjectMembersSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List project members with their role scope and assigned contexts',
    }),
    ApiOkResponse({ type: [ProjectMemberResponseApiDto] })
  );
}

export function InviteProjectMemberSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Invite a new project member by email',
      description:
        'Returns a discriminated union by `kind`: `email-sent` when the IDP server delivers the invitation email itself, or `magic-link` when the IDP returns a one-time link the admin must share manually.',
    }),
    ApiBody({ type: InviteMemberRequestApiDto }),
    ApiResponse({ status: 202, type: InviteMemberResponseApiDto }),
    ApiResponse({ status: 400, description: 'Invalid email, role, or context ids' }),
    ApiResponse({ status: 409, description: 'Member with this email already exists' }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}

export function UpdateProjectMemberSpec() {
  return applyDecorators(
    ApiOperation({
      summary: "Update a project member's role, scope, and context bindings",
      description:
        'When the role changes, the IDP is updated first; only on success local scope and context bindings are persisted.',
    }),
    ApiParam({ name: 'userId', description: 'Project member user ID' }),
    ApiBody({ type: UpdateMemberRequestApiDto }),
    ApiOkResponse({ type: UpdateMemberResponseApiDto }),
    ApiResponse({ status: 400, description: 'Invalid context ids' }),
    ApiResponse({ status: 404, description: 'Member not found in project' }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure when changing role' })
  );
}

export function RemoveProjectMemberSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Remove a project member',
      description:
        'Removes the member from the IDP and clears their local scope and context bindings. Idempotent for users already absent from the IDP.',
    }),
    ApiParam({ name: 'userId', description: 'Project member user ID' }),
    ApiNoContentResponse({ description: 'Member removed' }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}
