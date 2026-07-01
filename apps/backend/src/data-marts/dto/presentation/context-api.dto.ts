import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { UserProjection } from '../schemas/user-projection.schema';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

export class CreateContextRequestApiDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateContextRequestApiDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class ContextResponseApiDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  createdById: string | null;

  @ApiPropertyOptional({ type: UserProjectionDto })
  createdByUser: UserProjection | null;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}

export class ContextImpactResponseApiDto {
  @ApiProperty()
  contextId: string;

  @ApiProperty()
  contextName: string;

  @ApiProperty()
  dataMartCount: number;

  @ApiProperty()
  storageCount: number;

  @ApiProperty()
  destinationCount: number;

  @ApiProperty()
  memberCount: number;

  @ApiProperty()
  userProvisioningDefaultsCount: number;

  @ApiProperty({ type: [String] })
  affectedMemberIds: string[];
}

export class UpdateEntityContextsRequestApiDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds: string[];
}

export class UpdateContextMembersRequestApiDto {
  @ApiProperty({
    type: [String],
    description: 'Project member user ids to bind to this context. Admin ids are ignored.',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  assignedUserIds: string[];
}

export class UpdateContextMembersResponseApiDto {
  @ApiProperty({ type: [String] })
  assignedUserIds: string[];

  @ApiProperty({
    type: [String],
    description:
      'Admin user ids the caller tried to attach. Admins always have project-wide scope, so binding them to a context is a no-op. UI may surface a warning.',
  })
  droppedAdminIds: string[];
}

export class UpdateMemberRequestApiDto {
  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  role: ProjectRole;

  @ApiProperty({ enum: RoleScope })
  @IsEnum(RoleScope)
  roleScope: RoleScope;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds: string[];
}

export class UpdateMemberResponseApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: ProjectRole })
  role: ProjectRole;

  @ApiProperty({ enum: RoleScope })
  roleScope: RoleScope;

  @ApiProperty({ type: [String] })
  contextIds: string[];

  @ApiProperty({ enum: ['ok', 'pending'] })
  roleStatus: 'ok' | 'pending';

  @ApiPropertyOptional()
  message?: string;
}

export class ProjectMemberResponseApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty({ enum: ProjectRole })
  role: ProjectRole;

  @ApiProperty({ enum: RoleScope })
  roleScope: RoleScope;

  @ApiProperty({ type: [String] })
  contextIds: string[];
}

export class InviteMemberRequestApiDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  role: ProjectRole;

  @ApiPropertyOptional({
    enum: RoleScope,
    description:
      'Explicit role scope for non-admin invitees. Ignored when role=admin (admins are always entire_project). If omitted, scope is inferred from contextIds (non-empty → selected_contexts, empty → entire_project) for backwards compatibility.',
  })
  @IsOptional()
  @IsEnum(RoleScope)
  roleScope?: RoleScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds?: string[];
}

/**
 * Discriminated union response for invite. `kind` distinguishes between:
 *  - `email-sent` — the IDP server delivered the invitation email itself
 *    (e.g. idp-owox-better-auth); UI shows a confirmation toast.
 *  - `magic-link` — the IDP returned a link the admin must copy and deliver
 *    manually (e.g. idp-better-auth); UI renders the link with a copy button.
 */
export class InviteMemberResponseApiDto {
  @ApiProperty()
  email: string;

  @ApiProperty({ enum: ['email-sent', 'magic-link'] })
  kind: 'email-sent' | 'magic-link';

  @ApiProperty({ enum: ProjectRole })
  role: ProjectRole;

  @ApiPropertyOptional({
    description: 'Present when `kind` is `magic-link`. Admin shares this link manually.',
  })
  magicLink?: string;

  @ApiPropertyOptional()
  expiresAt?: string;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({
    description:
      'Pre-provisioned user id from the IDP. Present when the backend could attach authorization scope immediately. Absent for IDPs that only materialise the user on first sign-in.',
  })
  userId?: string;
}

export class MembershipRequestApiDto {
  @ApiProperty()
  requestId: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  fullName?: string;

  @ApiPropertyOptional()
  avatar?: string;

  @ApiPropertyOptional()
  userId?: string;

  @ApiProperty({ enum: ProjectRole })
  requestedRole: ProjectRole;

  @ApiProperty()
  createdAt: string;
}

export class ApproveMembershipRequestApiDto {
  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  role: ProjectRole;

  @ApiPropertyOptional({ enum: RoleScope })
  @IsOptional()
  @IsEnum(RoleScope)
  roleScope?: RoleScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds?: string[];
}

export class ApproveMembershipRequestResponseApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: ProjectRole })
  role: ProjectRole;

  @ApiProperty({ enum: RoleScope })
  roleScope: RoleScope;

  @ApiProperty({ type: [String] })
  contextIds: string[];
}
