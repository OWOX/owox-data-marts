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
  ApproveMembershipRequestApiDto,
  ApproveMembershipRequestResponseApiDto,
  InviteMemberRequestApiDto,
  InviteMemberResponseApiDto,
  MembershipRequestApiDto,
  ProjectMemberResponseApiDto,
  UpdateMemberRequestApiDto,
  UpdateMemberResponseApiDto,
} from '../../dto/presentation/context-api.dto';
import {
  UpdateUserProvisioningSettingsRequestApiDto,
  UserProvisioningSettingsResponseApiDto,
} from '../../dto/presentation/user-provisioning-settings-api.dto';

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

export function GetUserProvisioningSettingsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get user provisioning settings for the current project',
      description:
        'Returns `isApplicable=false` when the active IDP/project does not support organization-backed user provisioning. `isMainProject` tells the UI whether settings are editable for this project.',
    }),
    ApiOkResponse({ type: UserProvisioningSettingsResponseApiDto }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}

export function UpdateUserProvisioningSettingsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update user provisioning defaults for the current project',
      description:
        'Only the organization main project can update provisioning settings. IDP/analytics owns provisioning mode and default role; ODM stores context-scope defaults locally.',
    }),
    ApiBody({ type: UpdateUserProvisioningSettingsRequestApiDto }),
    ApiOkResponse({ type: UserProvisioningSettingsResponseApiDto }),
    ApiResponse({
      status: 400,
      description: 'Invalid context ids or selected_contexts without contexts',
    }),
    ApiResponse({
      status: 403,
      description: 'Current project is not the organization main project',
    }),
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

export function ListMembershipRequestsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List pending project membership requests',
      description:
        'Returns the array of pending requests for the project. Empty array means there are no pending requests. The non-OWOX IDP providers (better-auth, null) return an empty list rather than throwing.',
    }),
    ApiOkResponse({ type: [MembershipRequestApiDto] }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}

export function ApproveMembershipRequestSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Approve a pending membership request',
      description:
        'Resolves the requester into a full project member with the chosen role. Optionally narrows the role scope and pre-assigns contexts. Mirrors the post-invite scope/context apply.',
    }),
    ApiParam({ name: 'requestId', description: 'Pending request id (stable identifier from IDP)' }),
    ApiBody({ type: ApproveMembershipRequestApiDto }),
    ApiOkResponse({ type: ApproveMembershipRequestResponseApiDto }),
    ApiResponse({ status: 400, description: 'Invalid role or context ids' }),
    ApiResponse({ status: 404, description: 'Membership request not found' }),
    ApiResponse({ status: 501, description: 'IDP provider does not support membership requests' }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}

export function DeclineMembershipRequestSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Decline a pending membership request',
      description:
        'Removes the request from the pending queue. Returns 404 if the request was already removed or never existed (symmetric with approve).',
    }),
    ApiParam({ name: 'requestId', description: 'Pending request id (stable identifier from IDP)' }),
    ApiNoContentResponse({ description: 'Request declined' }),
    ApiResponse({ status: 404, description: 'Membership request not found' }),
    ApiResponse({ status: 501, description: 'IDP provider does not support membership requests' }),
    ApiResponse({ status: 502, description: 'Upstream IDP failure' })
  );
}
