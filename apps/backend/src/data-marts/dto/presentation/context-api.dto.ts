import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

  @ApiProperty()
  @IsString()
  description: string;
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

  @ApiPropertyOptional()
  createdByUser: { userId: string; email: string; fullName?: string; avatar?: string } | null;

  @ApiProperty()
  createdAt: Date;
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

export class UpdateMemberRequestApiDto {
  @ApiProperty({ enum: ['admin', 'editor', 'viewer'] })
  @IsString()
  @IsIn(['admin', 'editor', 'viewer'])
  role: 'admin' | 'editor' | 'viewer';

  @ApiProperty({ enum: ['entire_project', 'selected_contexts'] })
  @IsString()
  @IsIn(['entire_project', 'selected_contexts'])
  roleScope: 'entire_project' | 'selected_contexts';

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

  @ApiProperty()
  role: string;

  @ApiProperty()
  roleScope: string;

  @ApiProperty({ type: [String] })
  contextIds: string[];

  @ApiProperty({ enum: ['ok', 'pending'] })
  roleStatus: 'ok' | 'pending';

  @ApiPropertyOptional()
  message?: string;
}

export class InviteMemberRequestApiDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ enum: ['admin', 'editor', 'viewer'] })
  @IsString()
  @IsIn(['admin', 'editor', 'viewer'])
  role: 'admin' | 'editor' | 'viewer';

  @ApiPropertyOptional({
    enum: ['entire_project', 'selected_contexts'],
    description:
      'Explicit role scope for non-admin invitees. Ignored when role=admin (admins are always entire_project). If omitted, scope is inferred from contextIds (non-empty → selected_contexts, empty → entire_project) for backwards compatibility.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['entire_project', 'selected_contexts'])
  roleScope?: 'entire_project' | 'selected_contexts';

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

  @ApiProperty({ enum: ['admin', 'editor', 'viewer'] })
  role: 'admin' | 'editor' | 'viewer';

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
