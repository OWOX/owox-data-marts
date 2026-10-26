import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataMartAccessReason } from '../../services/access-decision';
import { RoleScope } from '../../enums/role-scope.enum';
import { DataMartMemberOwnership } from '../domain/data-mart-member-access.dto';

export class DataMartMemberAccessContextApiDto {
  @ApiProperty({ example: 'f1b2c3d4-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'Paid ads' })
  name: string;
}

export class DataMartAccessLevelApiDto {
  @ApiProperty({ example: false })
  granted: boolean;

  @ApiProperty({
    enum: DataMartAccessReason,
    example: DataMartAccessReason.NO_SHARED_CONTEXT,
    description: 'The rule that decides these actions for the member',
  })
  reason: DataMartAccessReason;
}

export class DataMartMemberAccessItemApiDto {
  @ApiProperty({ example: 'user-123' })
  userId: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  displayName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatarUrl?: string;

  @ApiProperty({ enum: ['admin', 'editor', 'viewer'], example: 'viewer' })
  role: string;

  @ApiProperty({ enum: RoleScope, example: RoleScope.SELECTED_CONTEXTS })
  roleScope: RoleScope;

  @ApiProperty({
    type: [DataMartMemberAccessContextApiDto],
    description:
      "The member's contexts. They limit access only when roleScope is selected_contexts",
  })
  contexts: DataMartMemberAccessContextApiDto[];

  @ApiProperty({
    enum: DataMartMemberOwnership,
    nullable: true,
    example: null,
    description:
      "The member's place in the DataMart's Ownership: Data Owner, Business Owner, or null",
  })
  ownership: DataMartMemberOwnership | null;

  @ApiProperty({
    type: DataMartAccessLevelApiDto,
    description:
      'See and Use: find the DataMart in the catalog and through MCP, build reports on it',
  })
  see: DataMartAccessLevelApiDto;

  @ApiProperty({
    type: DataMartAccessLevelApiDto,
    description: 'Edit, Delete and Manage Triggers',
  })
  edit: DataMartAccessLevelApiDto;

  @ApiProperty({
    type: DataMartAccessLevelApiDto,
    description: 'Configure Sharing and Manage Owners',
  })
  configureSharing: DataMartAccessLevelApiDto;
}

export class DataMartMemberAccessResponseApiDto {
  @ApiProperty({ type: [DataMartMemberAccessItemApiDto] })
  members: DataMartMemberAccessItemApiDto[];
}
